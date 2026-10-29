import type { Course, CourseAssociation, CourseCatalogItem, Discipline } from '../domain/entities/course';
import type { IFeedRepository } from '../domain/interfaces/feed-repo.interface';
import { catalogShiftMatchesFamily, shiftFamilyFromSigaaToken } from '../domain/course-shift';

export interface GetDisciplinesResult {
  disciplines: Discipline[];
  unmatchedCourses: Course[];
  unmatchedAprenderCourses: Course[];
  otherCourses: Course[];
}

export function normalizeCourseText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve o course_id no catálogo desambiguando cursos homônimos pelo turno. */
export function resolveCourseIdFromCatalog(
  catalog: Pick<CourseCatalogItem, 'id' | 'name' | 'shift'>[],
  courseName: string,
  shiftToken?: string | null
): string | null {
  if (!courseName || catalog.length === 0) return null;
  const target = normalizeCourseText(courseName);
  const sameName = catalog.filter((c) => normalizeCourseText(c.name) === target);
  const partial =
    sameName.length === 0
      ? catalog.filter((c) => {
          const n = normalizeCourseText(c.name);
          return n.length >= 4 && (n.includes(target) || target.includes(n));
        })
      : [];
  const pool = sameName.length > 0 ? sameName : partial;
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0].id;

  const family = shiftFamilyFromSigaaToken(shiftToken);
  if (family) {
    const compatible = pool.filter((c) => catalogShiftMatchesFamily(c.shift, family));
    const initial = family[0];
    const exact = compatible.filter((c) => normalizeCourseText(c.shift ?? '')[0] === initial);
    if (exact.length > 0) return exact[0].id;
    if (compatible.length > 0) return compatible[0].id;
  }
  return pool[0].id;
}


export function getCourseAcronym(name: string): string {
  const stopWords = new Set([
    'E', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'EM', 'NO', 'NA', 'NOS', 'NAS', 'PARA', 'COM', 'POR', 'A', 'O', 'AS', 'OS'
  ]);
  const words = normalizeCourseText(name).split(' ').filter((w) => w.length > 0 && !stopWords.has(w));
  return words.map((w) => w[0]).join('');
}

export class GetCoursesUseCase {
  constructor(private readonly feedRepo: IFeedRepository) {}

  async execute(): Promise<Course[]> {
    const courses = await this.feedRepo.getCourses();
    return [...courses]
      .filter((c) => !normalizeCourseText(c.name).includes('ESPACO DO ALUNO'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getDisciplines(): Promise<GetDisciplinesResult> {
    const allCourses = await this.feedRepo.getCourses();
    const associations = await this.feedRepo.getAssociations();

    const assocMap = new Map<string, CourseAssociation>();
    for (const assoc of associations) {
      assocMap.set(assoc.aprenderCourseId, assoc);
    }

    const sigaaCourses = allCourses.filter((c) => c.platform === 'sigaa');
    const aprenderCourses = allCourses.filter(
      (c) =>
        c.platform === 'aprender3' &&
        !normalizeCourseText(c.name).includes('ESPACO DO ALUNO')
    );
    const teamsCourses = allCourses.filter(
      (c) =>
        c.platform === 'teams' &&
        !c.name.toLowerCase().includes('language') &&
        !c.name.toLowerCase().includes('restart') &&
        !c.name.toLowerCase().includes('notification') &&
        !c.name.toLowerCase().includes('announcement') &&
        !c.name.toLowerCase().includes('join or create') &&
        !c.name.toLowerCase().includes('classes') &&
        !c.name.toLowerCase().includes('equipes') &&
        c.name !== 'TEAMS'
    );

    // Se o usuário não tiver disciplinas do SIGAA, tratamos cada curso como sua própria disciplina
    if (sigaaCourses.length === 0) {
      const disciplines: Discipline[] = allCourses.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        semester: c.semester,
        professor: c.professor,
        classroom: c.classroom,
        schedule: c.schedule,
        turma: c.turma,
        sigaaCourse: c.platform === 'sigaa' ? c : undefined,
        aprenderCourses: c.platform === 'aprender3' ? [c] : [],
        teamsCourses: c.platform === 'teams' ? [c] : [],
        url: c.url,
        unreadCount: c.unreadCount || 0,
        pendingAssignmentsCount: c.pendingAssignmentsCount || 0,
      }));

      return {
        disciplines,
        unmatchedCourses: [],
        unmatchedAprenderCourses: [],
        otherCourses: [],
      };
    }

    // Ordena SIGAA por tamanho do nome normalizado decrescente para priorizar nomes mais específicos
    const sortedSigaa = [...sigaaCourses].sort(
      (a, b) => normalizeCourseText(b.name).length - normalizeCourseText(a.name).length
    );

    // Mapeamento de SIGAA ID -> Array de Aprender3 e Teams Courses
    const sigaaToAprender = new Map<string, Course[]>();
    const sigaaToTeams = new Map<string, Course[]>();
    for (const sc of sigaaCourses) {
      sigaaToAprender.set(sc.id, []);
      sigaaToTeams.set(sc.id, []);
    }

    const unmatchedAprenderCourses: Course[] = [];
    const unmatchedTeamsCourses: Course[] = [];
    const otherCourses: Course[] = [];

    // 1. Mapeamento do Aprender 3
    for (const ac of aprenderCourses) {
      const existingAssoc = assocMap.get(ac.id);

      if (existingAssoc?.isIgnored) {
        continue;
      }

      if (existingAssoc?.sigaaCourseId === '__others__') {
        otherCourses.push(ac);
        continue;
      }

      if (existingAssoc?.sigaaCourseId && sigaaToAprender.has(existingAssoc.sigaaCourseId)) {
        sigaaToAprender.get(existingAssoc.sigaaCourseId)!.push(ac);
        continue;
      }

      const normAprenderName = normalizeCourseText(ac.name);
      const normAprenderCode = normalizeCourseText(ac.code);

      let matchedSigaa: Course | undefined;

      if (normAprenderCode.length >= 4 && normAprenderCode !== 'APRENDER3' && normAprenderCode !== 'A3') {
        matchedSigaa = sortedSigaa.find(
          (s) => normalizeCourseText(s.code) === normAprenderCode
        );
      }

      if (!matchedSigaa) {
        matchedSigaa = sortedSigaa.find((s) => {
          const normSigaaName = normalizeCourseText(s.name);
          return normSigaaName.length >= 4 && normAprenderName.includes(normSigaaName);
        });
      }

      if (matchedSigaa) {
        sigaaToAprender.get(matchedSigaa.id)!.push(ac);
      } else {
        unmatchedAprenderCourses.push(ac);
      }
    }

    // 2. Mapeamento do Teams (com suporte a siglas como SSTC, OAC)
    for (const tc of teamsCourses) {
      const existingAssoc = assocMap.get(tc.id);

      if (existingAssoc?.isIgnored) {
        continue;
      }

      if (existingAssoc?.sigaaCourseId === '__others__') {
        otherCourses.push(tc);
        continue;
      }

      if (existingAssoc?.sigaaCourseId && sigaaToTeams.has(existingAssoc.sigaaCourseId)) {
        sigaaToTeams.get(existingAssoc.sigaaCourseId)!.push(tc);
        continue;
      }

      const normTeamsName = normalizeCourseText(tc.name);
      const cleanPrefix = normTeamsName.split(/[\s\-_(]/)[0].trim();

      let matchedSigaa: Course | undefined;

      // 2.1 Verifica sigla exata (ex.: SSTC -> SINAIS E SISTEMAS NO TEMPO CONTINUO, OAC -> ORGANIZACAO E ARQUITETURA DE COMPUTADORES)
      if (cleanPrefix.length >= 2) {
        matchedSigaa = sortedSigaa.find((s) => {
          const acronym = getCourseAcronym(s.name);
          return acronym === cleanPrefix || acronym.startsWith(cleanPrefix) || cleanPrefix.startsWith(acronym);
        });
      }

      // 2.2 Se não casou por sigla, tenta código ou substring
      if (!matchedSigaa) {
        matchedSigaa = sortedSigaa.find((s) => {
          const normSigaaName = normalizeCourseText(s.name);
          const normSigaaCode = normalizeCourseText(s.code);
          return (
            (normSigaaCode.length >= 4 && normTeamsName.includes(normSigaaCode)) ||
            (normSigaaName.length >= 4 && normTeamsName.includes(normSigaaName)) ||
            (normTeamsName.length >= 4 && normSigaaName.includes(normTeamsName))
          );
        });
      }

      if (matchedSigaa) {
        sigaaToTeams.get(matchedSigaa.id)!.push(tc);
      } else {
        unmatchedTeamsCourses.push(tc);
      }
    }

    const disciplines: Discipline[] = sigaaCourses.map((sc) => {
      const linkedAprender = sigaaToAprender.get(sc.id) || [];
      const linkedTeams = sigaaToTeams.get(sc.id) || [];
      const totalUnread = (sc.unreadCount || 0) +
        linkedAprender.reduce((acc, c) => acc + (c.unreadCount || 0), 0) +
        linkedTeams.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
      const totalPending = (sc.pendingAssignmentsCount || 0) +
        linkedAprender.reduce((acc, c) => acc + (c.pendingAssignmentsCount || 0), 0) +
        linkedTeams.reduce((acc, c) => acc + (c.pendingAssignmentsCount || 0), 0);

      return {
        id: sc.id,
        code: sc.code,
        name: sc.name,
        semester: sc.semester,
        professor: sc.professor,
        classroom: sc.classroom,
        schedule: sc.schedule,
        turma: sc.turma,
        sigaaCourse: sc,
        aprenderCourses: linkedAprender,
        teamsCourses: linkedTeams,
        url: sc.url,
        unreadCount: totalUnread,
        pendingAssignmentsCount: totalPending,
      };
    });

    disciplines.sort((a, b) => a.name.localeCompare(b.name));

    return {
      disciplines,
      unmatchedCourses: [...unmatchedAprenderCourses, ...unmatchedTeamsCourses],
      unmatchedAprenderCourses,
      otherCourses,
    };
  }

  async associateCourse(aprenderCourseId: string, sigaaCourseId: string | null, isIgnored: boolean = false): Promise<void> {
    await this.feedRepo.saveAssociation({
      aprenderCourseId,
      sigaaCourseId,
      isIgnored,
      updatedAt: new Date().toISOString(),
    });
  }
}

