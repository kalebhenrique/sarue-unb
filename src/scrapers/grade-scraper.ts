import fs from "node:fs/promises";
import path from "node:path";
import {
  CookieJar,
  USER_AGENT,
  decodeHtmlEntities,
  parseScheduleCode,
  parseScheduleField,
  fetchWithRetry,
  type ScheduleSlot,
} from "./utils.ts";

export interface Department {
  id: string;
  name: string;
}

export interface SemesterOption {
  value: string;
  year: string;
  period: string;
  label: string;
  is_current?: boolean;
}

export interface ScrapedClass {
  id: string;
  discipline_code: string;
  discipline_name: string;
  class_code: string;
  teachers: string[];
  classroom: string;
  schedule_code: string;
  schedule_description?: string;
  date_range?: string;
  schedule_slots: ScheduleSlot[];
  vacancies?: number;
  occupied?: number;
}

export interface ScrapedDiscipline {
  code: string;
  name: string;
  department_id: string;
  classes: ScrapedClass[];
  acronym?: string;
  acronyms?: string[];
}

export interface ScrapedProfessor {
  id: string;
  siape?: string;
  name: string;
  department_id: string;
  department_name: string;
  department_ids: string[];
  discipline_codes: string[];
  photo_url?: string;
}

const STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "as",
  "os",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "para",
  "por",
  "com",
  "sob",
  "sobre",
  "ao",
  "aos",
  "à",
  "às",
]);

const ROMAN_TO_ARABIC: Record<string, string> = {
  I: "1",
  II: "2",
  III: "3",
  IV: "4",
  V: "5",
  VI: "6",
  VII: "7",
  VIII: "8",
  IX: "9",
  X: "10",
};

const ARABIC_TO_ROMAN: Record<string, string> = {
  "1": "I",
  "2": "II",
  "3": "III",
  "4": "IV",
  "5": "V",
  "6": "VI",
  "7": "VII",
  "8": "VIII",
  "9": "IX",
  "10": "X",
};

/**
 * Cria siglas associadas para disciplinas removendo preposições e tratando números/algarismos romanos.
 * Ex: "Cálculo 1" -> { acronym: "C1", acronyms: ["C1", "CI"] }
 *     "Organização e Arquitetura de Computações" -> { acronym: "OAC", acronyms: ["OAC"] }
 *     "Sistemas Digitais" -> { acronym: "SD", acronyms: ["SD"] }
 *     "Introdução a Sociologia" -> { acronym: "IS", acronyms: ["IS"] }
 */
export function generateAcronyms(name: string): {
  acronym: string;
  acronyms: string[];
} {
  const cleaned = name
    .replace(/\s*\(\d+h\).*$/i, "")
    .replace(/[-–—/\\()]/g, " ")
    .trim();

  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
  const filtered = tokens.filter((t) => {
    const norm = t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return !STOPWORDS.has(norm);
  });

  if (filtered.length < 2) {
    if (filtered.length === 1 && /^\w+\d+$/i.test(filtered[0])) {
      const ac = filtered[0].toUpperCase();
      return { acronym: ac, acronyms: [ac] };
    }
    return { acronym: "", acronyms: [] };
  }

  const mainLetters: string[] = [];
  const altLetters: string[] = [];

  for (const t of filtered) {
    if (/^\d+$/.test(t)) {
      mainLetters.push(t);
      const roman = ARABIC_TO_ROMAN[t];
      altLetters.push(roman || t);
    } else if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(t)) {
      const upper = t.toUpperCase();
      const arabic = ROMAN_TO_ARABIC[upper];
      mainLetters.push(arabic || upper);
      altLetters.push(upper);
    } else {
      const ch = t[0]
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (/[A-Z0-9]/.test(ch)) {
        mainLetters.push(ch);
        altLetters.push(ch);
      }
    }
  }

  const primary = mainLetters.join("");
  const secondary = altLetters.join("");
  const set = new Set<string>();
  if (primary) set.add(primary);
  if (secondary) set.add(secondary);

  return {
    acronym: primary,
    acronyms: Array.from(set),
  };
}

const SIGAA_HOME_URL = "https://sigaa.unb.br/sigaa/public/home.jsf";
const SIGAA_TURMAS_URL =
  "https://sigaa.unb.br/sigaa/public/turmas/listar.jsf?aba=p-ensino";
const SIGAA_POST_URL = "https://sigaa.unb.br/sigaa/public/turmas/listar.jsf";
const SIGAA_DOCENTES_URL =
  "https://sigaa.unb.br/sigaa/public/docente/busca_docentes.jsf?aba=p-academico";
const SIGAA_DOCENTES_POST_URL =
  "https://sigaa.unb.br/sigaa/public/docente/busca_docentes.jsf";

export class GradeScraper {
  private jar = new CookieJar();

  async initSession(): Promise<string> {
    const resHome = await fetchWithRetry(SIGAA_HOME_URL, {
      headers: { "User-Agent": USER_AGENT },
    });
    this.jar.update(resHome.headers);

    const resTurmas = await fetchWithRetry(SIGAA_TURMAS_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: this.jar.header(),
        Referer: SIGAA_HOME_URL,
      },
    });
    this.jar.update(resTurmas.headers);
    return resTurmas.text();
  }

  parseDepartments(html: string): Department[] {
    const selectMatch = html.match(
      /<select[^>]+name="formTurma:inputDepto"[^>]*>([\s\S]*?)<\/select>/i,
    );
    if (!selectMatch) return [];

    const optionRegex = /<option[^>]+value="([^"]+)"[^>]*>([^<]+)<\/option>/g;
    const departments: Department[] = [];
    let m: RegExpExecArray | null;

    while ((m = optionRegex.exec(selectMatch[1])) !== null) {
      const id = m[1].trim();
      const name = decodeHtmlEntities(m[2].trim());
      if (id && id !== "0" && name) {
        departments.push({ id, name });
      }
    }

    return departments;
  }

  parseSemesters(html: string): SemesterOption[] {
    const anoMatch = html.match(
      /<input[^>]+name="formTurma:inputAno"[^>]+value="([^"]+)"/i,
    );
    const currentYear = anoMatch
      ? anoMatch[1].trim()
      : String(new Date().getFullYear());
    const yNum = parseInt(currentYear, 10) || new Date().getFullYear();

    const periodoMatch = html.match(
      /<select[^>]+name="formTurma:inputPeriodo"[^>]*>([\s\S]*?)<\/select>/i,
    );
    let selectedPeriod = "2";

    if (periodoMatch) {
      const optRegex = /<option[^>]+value="([^"]+)"([^>]*)>([^<]*)<\/option>/g;
      let m: RegExpExecArray | null;
      while ((m = optRegex.exec(periodoMatch[1])) !== null) {
        if (m[2].includes("selected")) {
          selectedPeriod = m[1].trim();
        }
      }
    }

    // Na UnB:
    // - Semestres regulares são apenas 1 e 2.
    // - Semestre 3 NÃO existe na instituição.
    // - Semestre 4 (férias de verão) só entra quando divulgado e ativo.
    // - Regra: sempre exibir o semestre atual e o próximo se possível (ex: 2026 • 2º semestre e 2027 • 1º semestre).
    const currentPeriod =
      selectedPeriod === "1" || selectedPeriod === "2" ? selectedPeriod : "2";

    const currentOption: SemesterOption = {
      value: `${currentYear}-${currentPeriod}`,
      year: currentYear,
      period: currentPeriod,
      label: `${currentYear} • ${currentPeriod}º semestre`,
      is_current: true,
    };

    let nextOption: SemesterOption;
    if (currentPeriod === "1") {
      nextOption = {
        value: `${currentYear}-2`,
        year: currentYear,
        period: "2",
        label: `${currentYear} • 2º semestre`,
        is_current: false,
      };
    } else {
      const nextYear = String(yNum + 1);
      nextOption = {
        value: `${nextYear}-1`,
        year: nextYear,
        period: "1",
        label: `${nextYear} • 1º semestre`,
        is_current: false,
      };
    }

    return [currentOption, nextOption];
  }

  async scrapeDepartment(
    deptId: string,
    year: string,
    period: string,
    initialHtml?: string,
  ): Promise<ScrapedDiscipline[]> {
    let html = initialHtml;
    if (!html) {
      html = await this.initSession();
    }

    const vsMatch = html.match(
      /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i,
    );
    const viewState = vsMatch ? vsMatch[1] : "j_id1";

    let btnName = "formTurma:j_id_jsp_1370969402_11";
    const btnMatch =
      html.match(/<input[^>]+name="([^"]+)"[^>]+value="Buscar"/i) ||
      html.match(/<input[^>]+value="Buscar"[^>]+name="([^"]+)"/i);
    if (btnMatch) {
      btnName = btnMatch[1];
    }

    const body = new URLSearchParams({
      formTurma: "formTurma",
      "formTurma:inputNivel": "",
      "formTurma:inputDepto": deptId,
      "formTurma:inputAno": year,
      "formTurma:inputPeriodo": period,
      [btnName]: "Buscar",
      "javax.faces.ViewState": viewState,
    });

    const res = await fetchWithRetry(SIGAA_POST_URL, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: this.jar.header(),
        Referer: SIGAA_TURMAS_URL,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    this.jar.update(res.headers);

    const postHtml = await res.text();
    return this.parseClassesTable(postHtml, deptId);
  }

  parseClassesTable(html: string, deptId: string): ScrapedDiscipline[] {
    const tableMatch = html.match(
      /<table[^>]+class="listagem"[^>]*>([\s\S]*?)<\/table>/i,
    );
    if (!tableMatch) return [];

    const tableHtml = tableMatch[1];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const disciplines: ScrapedDiscipline[] = [];

    let currentCode = "";
    let currentName = "";
    let currentClasses: ScrapedClass[] = [];

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowContent = rowMatch[1];

      // Título da disciplina
      const titleMatch = rowContent.match(
        /<span[^>]+class="tituloDisciplina"[^>]*>([\s\S]*?)<\/span>/i,
      );
      if (titleMatch) {
        if (currentCode && currentClasses.length > 0) {
          const { acronym, acronyms } = generateAcronyms(currentName);
          disciplines.push({
            code: currentCode,
            name: currentName,
            department_id: deptId,
            classes: currentClasses,
            acronym: acronym || undefined,
            acronyms: acronyms.length > 0 ? acronyms : undefined,
          });
          currentClasses = [];
        }

        const rawTitle = decodeHtmlEntities(titleMatch[1]);
        const cleanTitle = rawTitle.replace(/^[-–—\s]+|[-–—\s]+$/g, "");
        const parts = cleanTitle.split(/\s*[-–—]\s*/);
        if (parts.length >= 2) {
          currentCode = parts[0].trim();
          currentName = parts[1].replace(/\s*\(\d+h\).*$/i, "").trim();
        } else {
          currentCode = cleanTitle.trim();
          currentName = cleanTitle.trim();
        }
        continue;
      }

      // Linha de turma (linhaPar / linhaImpar)
      if (
        rowMatch[0].includes("linhaPar") ||
        rowMatch[0].includes("linhaImpar")
      ) {
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const tds: string[] = [];
        let tdMatch: RegExpExecArray | null;
        while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
          tds.push(decodeHtmlEntities(tdMatch[1]));
        }

        if (tds.length >= 4) {
          const classCode = tds[0].replace(/<[^>]+>/g, "").trim();
          const teachersRaw = tds[2].replace(/<[^>]+>/g, "").trim();
          const scheduleRaw = tds[3].replace(/<[^>]+>/g, "").trim();

          // No SIGAA:
          // tds[0]: Código da turma
          // tds[1]: Ano-Período
          // tds[2]: Docente
          // tds[3]: Horário (código e horários brutos)
          // tds[4]: Célula auxiliar (devido a colspan="2" no cabeçalho)
          // tds[5]: Qtde Vagas Ofertadas (capacidade total)
          // tds[6]: Qtde Vagas Ocupadas (vagas ocupadas reais)
          // tds[7]: Local
          let vacancies: number | undefined;
          let occupied: number | undefined;
          let classroom = "A definir";

          if (tds.length >= 7) {
            const v5 = parseInt(tds[5].replace(/<[^>]+>/g, "").trim(), 10);
            const v6 = parseInt(tds[6].replace(/<[^>]+>/g, "").trim(), 10);
            if (!isNaN(v5) && !isNaN(v6)) {
              vacancies = v5;
              occupied = v6;
              classroom =
                tds.length >= 8
                  ? tds[7].replace(/<[^>]+>/g, "").trim() || "A definir"
                  : "A definir";
            } else {
              // Fallback caso a tabela não tenha a coluna vazia de colspan
              const v4 = parseInt(tds[4].replace(/<[^>]+>/g, "").trim(), 10);
              const v5Alt = parseInt(tds[5].replace(/<[^>]+>/g, "").trim(), 10);
              if (!isNaN(v4) && !isNaN(v5Alt)) {
                vacancies = v4;
                occupied = v5Alt;
                classroom =
                  tds.length >= 7
                    ? tds[6].replace(/<[^>]+>/g, "").trim() || "A definir"
                    : "A definir";
              }
            }
          }

          // Professores
          const teachers = teachersRaw
            .split(")")
            .map((p) => p.split("(")[0].trim())
            .filter((p) => p.length > 0);

          const { schedule_code, date_range, schedule_description } =
            parseScheduleField(scheduleRaw);
          const schedule_slots = parseScheduleCode(schedule_code);

          const sc: ScrapedClass = {
            id: `${currentCode}-${classCode}`,
            discipline_code: currentCode,
            discipline_name: currentName,
            class_code: classCode,
            teachers: teachers.length > 0 ? teachers : ["A definir"],
            classroom,
            schedule_code,
            schedule_description,
            date_range,
            schedule_slots,
            vacancies: isNaN(vacancies || NaN) ? undefined : vacancies,
            occupied: isNaN(occupied || NaN) ? undefined : occupied,
          };

          currentClasses.push(sc);
        }
      }
    }

    if (currentCode && currentClasses.length > 0) {
      const { acronym, acronyms } = generateAcronyms(currentName);
      disciplines.push({
        code: currentCode,
        name: currentName,
        department_id: deptId,
        classes: currentClasses,
        acronym: acronym || undefined,
        acronyms: acronyms.length > 0 ? acronyms : undefined,
      });
    }

    return disciplines;
  }

  async initDocentesSession(): Promise<string> {
    const resHome = await fetchWithRetry(SIGAA_HOME_URL, {
      headers: { "User-Agent": USER_AGENT },
    });
    this.jar.update(resHome.headers);

    const resDocentes = await fetchWithRetry(SIGAA_DOCENTES_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: this.jar.header(),
        Referer: SIGAA_HOME_URL,
      },
    });
    this.jar.update(resDocentes.headers);
    return resDocentes.text();
  }

  parseDocenteDepartments(html: string): Department[] {
    const selectMatch = html.match(
      /<select[^>]+name="form:departamento"[^>]*>([\s\S]*?)<\/select>/i,
    );
    if (!selectMatch) return [];

    const optionRegex = /<option[^>]+value="([^"]+)"[^>]*>([^<]+)<\/option>/g;
    const departments: Department[] = [];
    let m: RegExpExecArray | null;

    while ((m = optionRegex.exec(selectMatch[1])) !== null) {
      const id = m[1].trim();
      const name = decodeHtmlEntities(m[2].trim());
      if (id && id !== "0" && name) {
        departments.push({ id, name });
      }
    }

    return departments;
  }

  async scrapeDocentesDepartment(
    deptId: string,
    deptName: string,
    initialHtml?: string,
  ): Promise<ScrapedProfessor[]> {
    let html = initialHtml;
    if (!html) {
      html = await this.initDocentesSession();
    }

    const vsMatch = html.match(
      /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i,
    );
    const viewState = vsMatch ? vsMatch[1] : "j_id1";

    let btnName = "form:buscar";
    const btnMatch =
      html.match(/<input[^>]+name="([^"]+)"[^>]+value="Buscar"/i) ||
      html.match(/<input[^>]+value="Buscar"[^>]+name="([^"]+)"/i);
    if (btnMatch) {
      btnName = btnMatch[1];
    }

    const body = new URLSearchParams({
      form: "form",
      "form:nome": "",
      "form:departamento": deptId,
      [btnName]: "Buscar",
      "javax.faces.ViewState": viewState,
    });

    const res = await fetchWithRetry(SIGAA_DOCENTES_POST_URL, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: this.jar.header(),
        Referer: SIGAA_DOCENTES_URL,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    this.jar.update(res.headers);

    const postHtml = await res.text();
    return this.parseDocentesTable(postHtml, deptId, deptName);
  }

  parseDocentesTable(
    html: string,
    deptId: string,
    fallbackDeptName: string,
  ): ScrapedProfessor[] {
    const tableMatch = html.match(
      /<table[^>]+class="listagem"[^>]*>([\s\S]*?)<\/table>/i,
    );
    if (!tableMatch) return [];

    const tableHtml = tableMatch[1];
    const rowRegex =
      /<tr[^>]+class="linha(?:Par|Impar)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
    const professors: ScrapedProfessor[] = [];

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowContent = rowMatch[1];

      const nameMatch = rowContent.match(
        /<span[^>]+class="nome"[^>]*>([\s\S]*?)<\/span>/i,
      );
      if (!nameMatch) continue;

      const rawName = decodeHtmlEntities(
        nameMatch[1].replace(/<[^>]+>/g, "").trim(),
      );
      if (!rawName) continue;

      const deptMatch = rowContent.match(
        /<span[^>]+class="departamento"[^>]*>([\s\S]*?)<\/span>/i,
      );
      const deptName = deptMatch
        ? decodeHtmlEntities(deptMatch[1].replace(/<[^>]+>/g, "").trim())
        : fallbackDeptName;

      const siapeMatch = rowContent.match(/portal\.jsf\?siape=(\d+)/i);
      const siape = siapeMatch ? siapeMatch[1].trim() : undefined;

      const imgMatch = rowContent.match(/<img[^>]+src="([^"]+)"/i);
      const rawImg = imgMatch ? imgMatch[1].trim() : undefined;
      const photoUrl =
        rawImg && !rawImg.includes("no_picture")
          ? rawImg.startsWith("http")
            ? rawImg
            : `https://sigaa.unb.br${rawImg}`
          : undefined;

      const normKey = rawName
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      professors.push({
        id: siape || `prof-${deptId}-${normKey.replace(/[^A-Z0-9]/g, "-")}`,
        siape,
        name: rawName,
        department_id: deptId,
        department_name: deptName || fallbackDeptName,
        department_ids: [deptId],
        discipline_codes: [],
        photo_url: photoUrl,
      });
    }

    return professors;
  }

  static buildProfessorsCatalog(
    directoryProfessors: ScrapedProfessor[],
    allDisciplines: ScrapedDiscipline[],
    departments: Department[],
  ): ScrapedProfessor[] {
    const deptNameById = new Map<string, string>(
      departments.map((d) => [d.id, d.name]),
    );

    const norm = (v: string) =>
      v
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const byNormName = new Map<string, ScrapedProfessor>();

    for (const p of directoryProfessors) {
      const key = norm(p.name);
      if (!key) continue;
      const existing = byNormName.get(key);
      if (existing) {
        if (!existing.siape && p.siape) existing.siape = p.siape;
        if (!existing.photo_url && p.photo_url)
          existing.photo_url = p.photo_url;
        for (const dId of p.department_ids) {
          if (!existing.department_ids.includes(dId)) {
            existing.department_ids.push(dId);
          }
        }
      } else {
        byNormName.set(key, {
          ...p,
          department_ids: [...p.department_ids],
          discipline_codes: [...p.discipline_codes],
        });
      }
    }

    // Cruza com todos os docentes que lecionam turmas em classes.json
    for (const disc of allDisciplines) {
      const code = disc.code.trim().toUpperCase();
      const deptId = disc.department_id;
      const deptName = deptNameById.get(deptId) || "UnB";

      for (const cls of disc.classes || []) {
        for (const rawTeacher of cls.teachers || []) {
          const cleanName = rawTeacher.trim();
          if (!cleanName || cleanName.toUpperCase() === "A DEFINIR") continue;

          const key = norm(cleanName);
          if (!key) continue;

          const existing = byNormName.get(key);
          if (existing) {
            if (!existing.discipline_codes.includes(code)) {
              existing.discipline_codes.push(code);
            }
            if (deptId && !existing.department_ids.includes(deptId)) {
              existing.department_ids.push(deptId);
            }
          } else {
            byNormName.set(key, {
              id: `prof-${deptId}-${key.replace(/\s+/g, "-")}`,
              name: cleanName,
              department_id: deptId,
              department_name: deptName,
              department_ids: deptId ? [deptId] : [],
              discipline_codes: [code],
            });
          }
        }
      }
    }

    return Array.from(byNormName.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
  }
}

// Fallback seed departments
export const FALLBACK_DEPARTMENTS: Department[] = [
  { id: "508", name: "DEPTO CIÊNCIAS DA COMPUTAÇÃO - CIC" },
  { id: "518", name: "DEPARTAMENTO DE MATEMÁTICA - MAT" },
  { id: "514", name: "DEPTO ESTATÍSTICA - EST" },
  { id: "443", name: "DEPTO ENGENHARIA ELÉTRICA - ENE" },
  { id: "449", name: "DEPARTAMENTO DE ENGENHARIA MECÂNICA - ENM" },
  { id: "440", name: "DEPARTAMENTO DE ENGENHARIA CIVIL E AMBIENTAL - ENC" },
  { id: "524", name: "INSTITUTO DE FÍSICA - IF" },
  { id: "610", name: "INSTITUTO DE QUÍMICA - IQ" },
  { id: "327", name: "DEPTO ADMINISTRAÇÃO - ADM" },
  { id: "333", name: "DEPTO CIÊNCIAS CONTÁBEIS ATUARIAIS - CCA" },
  { id: "335", name: "DEPTO ECONOMIA - ECO" },
  { id: "673", name: "CAMPUS UNB GAMA - FGA" },
  { id: "672", name: "CAMPUS UNB CEILÂNDIA - FCE" },
  { id: "675", name: "CAMPUS UNB PLANALTINA - FUP" },
  { id: "401", name: "FACULDADE DE DIREITO - FD" },
  { id: "379", name: "FACULDADE DE MEDICINA - FM" },
];

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string, def: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  const yearArg = getArg("--year", process.env.SCRAPER_YEAR || "");
  const periodArg = getArg("--period", process.env.SCRAPER_PERIOD || "");
  const scrapeAllSemesters =
    args.includes("--all-semesters") || (!yearArg && !periodArg);
  const defaultNow = new Date();
  const defaultYear = String(defaultNow.getFullYear());
  const defaultPeriod = defaultNow.getMonth() + 1 <= 6 ? "1" : "2";
  const year = yearArg || defaultYear;
  const period = periodArg || defaultPeriod;
  const outDir = path.resolve(
    getArg("--out-dir", process.env.OUTPUT_DIR || "./public/data"),
  );
  const targetDept = getArg("--dept", "");
  const limitStr = getArg("--limit", "");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  console.log(
    scrapeAllSemesters
      ? `[GradeScraper] Iniciando coleta multi-semestre (atual + próximo detectados do SIGAA)`
      : `[GradeScraper] Iniciando coleta de turmas: ano=${year}, período=${period}`,
  );
  console.log(`[GradeScraper] Diretório de saída: ${outDir}`);

  await fs.mkdir(outDir, { recursive: true });

  const scraper = new GradeScraper();
  let departments: Department[] = [];
  let semesters: SemesterOption[] = [];

  try {
    const initialHtml = await scraper.initSession();
    departments = scraper.parseDepartments(initialHtml);
    semesters = scraper.parseSemesters(initialHtml);
    console.log(
      `[GradeScraper] ${departments.length} departamentos e ${semesters.length} opções de semestres obtidos do SIGAA.`,
    );
  } catch (err) {
    console.warn(
      `[GradeScraper] Falha ao coletar lista ao vivo de departamentos/semestres: ${err}. Usando fallback.`,
    );
    departments = FALLBACK_DEPARTMENTS;
    semesters = [
      {
        value: "2026-2",
        year: "2026",
        period: "2",
        label: "2026 • 2º semestre",
        is_current: true,
      },
      { value: "2026-4", year: "2026", period: "4", label: "2026 - Sem 4" },
      {
        value: "2026-1",
        year: "2026",
        period: "1",
        label: "2026 • 1º semestre",
      },
      {
        value: "2027-1",
        year: "2027",
        period: "1",
        label: "2027 • 1º semestre",
      },
    ];
  }

  if (departments.length === 0) {
    departments = FALLBACK_DEPARTMENTS;
  }

  // Salva departamentos
  const deptPath = path.join(outDir, "departments.json");
  await fs.writeFile(deptPath, JSON.stringify(departments, null, 2), "utf-8");
  console.log(
    `[GradeScraper] Salvo: ${deptPath} (${departments.length} registros)`,
  );

  // Salva semestres
  const semPath = path.join(outDir, "semesters.json");
  await fs.writeFile(semPath, JSON.stringify(semesters, null, 2), "utf-8");
  console.log(
    `[GradeScraper] Salvo: ${semPath} (${semesters.length} semestres)`,
  );

  let deptsToScrape = targetDept
    ? departments.filter((d) => d.id === targetDept)
    : departments;
  if (limit && limit > 0) {
    deptsToScrape = deptsToScrape.slice(0, limit);
  }

  const fallbackSemester: SemesterOption = {
    value: `${year}-${period}`,
    year,
    period,
    label: `${year} • ${period}º semestre`,
    is_current: scrapeAllSemesters,
  };
  const filteredSemesters = semesters.filter(
    (s) => s.period === "1" || s.period === "2",
  );
  const targetSemesters: SemesterOption[] = scrapeAllSemesters
    ? filteredSemesters.length > 0
      ? filteredSemesters
      : [fallbackSemester]
    : [
        semesters.find((s) => s.year === year && s.period === period) ??
          fallbackSemester,
      ];

  const primarySemester =
    targetSemesters.find((s) => s.is_current) ?? targetSemesters[0];
  let primaryDisciplines: ScrapedDiscipline[] = [];
  let wroteLegacyClasses = false;
  const semestersSummary: Record<
    string,
    { total_disciplines: number; total_classes: number }
  > = {};

  for (const sem of targetSemesters) {
    console.log(
      `[GradeScraper] Coletando turmas de ${sem.year}.${sem.period} para ${deptsToScrape.length} departamentos...`,
    );

    const semDisciplines: ScrapedDiscipline[] = [];
    let processed = 0;

    for (const dept of deptsToScrape) {
      try {
        const disciplines = await scraper.scrapeDepartment(
          dept.id,
          sem.year,
          sem.period,
        );
        semDisciplines.push(...disciplines);
        processed++;
        if (disciplines.length > 0) {
          console.log(
            `[GradeScraper] [${sem.value}] [${processed}/${deptsToScrape.length}] ${dept.name} (${dept.id}): ${disciplines.length} disciplinas.`,
          );
        }
      } catch (e) {
        console.warn(
          `[GradeScraper] [${sem.value}] Erro ao raspar depto ${dept.id} (${dept.name}):`,
          e,
        );
      }
      // Breve pausa para não sobrecarregar o servidor do SIGAA
      await new Promise((r) => setTimeout(r, 200));
    }

    const semClassesPath = path.join(outDir, `classes-${sem.value}.json`);
    await fs.writeFile(
      semClassesPath,
      JSON.stringify(semDisciplines),
      "utf-8",
    );
    console.log(
      `[GradeScraper] Salvo: ${semClassesPath} (${semDisciplines.length} disciplinas coletadas)`,
    );

    semestersSummary[sem.value] = {
      total_disciplines: semDisciplines.length,
      total_classes: semDisciplines.reduce(
        (acc, d) => acc + d.classes.length,
        0,
      ),
    };

    if (sem.value === primarySemester.value) {
      primaryDisciplines = semDisciplines;
      if (primarySemester.is_current) {
        const legacyClassesPath = path.join(outDir, "classes.json");
        await fs.writeFile(
          legacyClassesPath,
          JSON.stringify(semDisciplines),
          "utf-8",
        );
        wroteLegacyClasses = true;
        console.log(
          `[GradeScraper] Salvo alias retrocompatível: ${legacyClassesPath} (${semDisciplines.length} disciplinas)`,
        );
      }
    }
  }

  // O catálogo de docentes é coletado pelo scraper próprio
  // (professors-scraper.ts, `pnpm run scrape:professors`), publicado por
  // .github/workflows/scrape-professors.yml — trimestral, não faz parte da
  // coleta diária da grade.
  const metaPath = path.join(outDir, "grade-meta.json");
  const meta = {
    scraped_at: new Date().toISOString(),
    year: primarySemester.year,
    period: primarySemester.period,
    semesters,
    semesters_summary: semestersSummary,
    total_departments: departments.length,
    total_disciplines: primaryDisciplines.length,
    total_classes: primaryDisciplines.reduce(
      (acc, d) => acc + d.classes.length,
      0,
    ),
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  console.log(`[GradeScraper] Concluído com sucesso! Metadados em ${metaPath}`);

  // Sincroniza cópia para public/data/ para desenvolvimento local transparente (apenas em coleta completa)
  const publicDataDir = path.resolve("public", "data");
  if (!targetDept && !limit && path.resolve(outDir) !== publicDataDir) {
    try {
      await fs.mkdir(publicDataDir, { recursive: true });
      if (wroteLegacyClasses) {
        const legacyClassesPath = path.join(outDir, "classes.json");
        await fs.copyFile(legacyClassesPath, path.join(publicDataDir, "classes.json"));
      }
      for (const sem of targetSemesters) {
        const semFile = `classes-${sem.value}.json`;
        await fs.copyFile(
          path.join(outDir, semFile),
          path.join(publicDataDir, semFile),
        );
      }
      await fs.copyFile(deptPath, path.join(publicDataDir, "departments.json"));
      await fs.copyFile(semPath, path.join(publicDataDir, "semesters.json"));
      await fs.copyFile(metaPath, path.join(publicDataDir, "grade-meta.json"));
      console.log(`[GradeScraper] Sincronizado para ${publicDataDir}`);
    } catch {}
  }
}

// Execução se chamado diretamente via CLI
if (process.argv[1] && process.argv[1].endsWith("grade-scraper.ts")) {
  main().catch((err) => {
    console.error("[GradeScraper] Falha fatal:", err);
    process.exit(1);
  });
}
