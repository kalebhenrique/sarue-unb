import type { StudentAcademicProfile } from '../domain/entities/academic-profile';
import type { CurriculumStructure } from '../domain/entities/course';
import type { SigaaCredentials } from '../domain/entities/credential';
import type { IAcademicProfileRepository } from '../domain/interfaces/academic-profile-repo.interface';
import type { IGradeRepository } from '../domain/interfaces/grade-repo.interface';
import { resolveCourseIdFromCatalog } from './get-courses.use-case';
import { ParseHistoricoUseCase } from './parse-historico.use-case';

export class ManageAcademicProfileUseCase {
  private parseHistoricoUseCase = new ParseHistoricoUseCase();

  constructor(
    private readonly repo: IAcademicProfileRepository,
    private readonly gradeRepo?: IGradeRepository
  ) {}

  async getProfile(): Promise<StudentAcademicProfile | null> {
    return this.repo.getProfile();
  }

  async getAllCurricula(): Promise<CurriculumStructure[]> {
    return this.repo.getAllCurricula();
  }

  async getCurriculaForCourse(courseId: string): Promise<CurriculumStructure[]> {
    return this.repo.getCurriculaForCourse(courseId);
  }

  async saveProfile(profile: StudentAcademicProfile): Promise<void> {
    await this.repo.saveProfile(profile);
  }

  async clearProfile(): Promise<void> {
    await this.repo.clearProfile();
  }

  /**
   * Alterna o estado de conclusão de uma disciplina.
   *
   * `isEffectivelyCompleted` é o estado que a UI está mostrando agora (inclui
   * equivalências e marcas manuais anteriores). Com ele, o toggle sempre inverte
   * o estado visível e grava a marca mínima: se o estado desejado já é o natural
   * do histórico SIGAA, nenhuma marca é necessária — o reset devolve exatamente
   * o estado original. Sem o parâmetro, mantém o comportamento legado (inverte
   * com base apenas no histórico original).
   */
  async toggleDiscipline(
    code: string,
    isEffectivelyCompleted?: boolean
  ): Promise<StudentAcademicProfile> {
    const current = await this.repo.getProfile();
    if (!current) {
      throw new Error('Nenhum perfil acadêmico carregado para alternar disciplinas.');
    }

    const normCode = code.toUpperCase();
    const isOriginallyCompleted = current.completedDisciplines.some(
      (d) => d.code === normCode && d.isCompleted
    );

    const manualCompleted = new Set(current.manualCompletedCodes || []);
    const manualUncompleted = new Set(current.manualUncompletedCodes || []);

    if (isEffectivelyCompleted === undefined) {
      if (isOriginallyCompleted) {
        // Se era originalmente aprovada, alternar significa desmarcar ou remover da lista de desmarcadas
        if (manualUncompleted.has(normCode)) {
          manualUncompleted.delete(normCode);
        } else {
          manualUncompleted.add(normCode);
        }
      } else {
        // Se não era originalmente aprovada, alternar significa marcar ou desmarcar
        if (manualCompleted.has(normCode)) {
          manualCompleted.delete(normCode);
        } else {
          manualCompleted.add(normCode);
        }
      }
    } else {
      // Estado desejado = inverso do que a UI mostra agora
      const desiredCompleted = !isEffectivelyCompleted;

      // A decisão parte do zero: as duas marcas deste código saem primeiro
      manualCompleted.delete(normCode);
      manualUncompleted.delete(normCode);

      // Só precisa de marca se o desejado divergir do natural do histórico —
      // assim o reset (ou uma nova alternância) devolve o estado puro do SIGAA
      if (desiredCompleted && !isOriginallyCompleted) {
        manualCompleted.add(normCode);
      } else if (!desiredCompleted && isOriginallyCompleted) {
        manualUncompleted.add(normCode);
      }
    }

    const updated: StudentAcademicProfile = {
      ...current,
      manualCompletedCodes: Array.from(manualCompleted),
      manualUncompletedCodes: Array.from(manualUncompleted),
      updatedAt: new Date().toISOString(),
    };

    await this.repo.saveProfile(updated);
    return updated;
  }

  async resetManualOverrides(): Promise<StudentAcademicProfile> {
    const current = await this.repo.getProfile();
    if (!current) {
      throw new Error('Nenhum perfil acadêmico para redefinir.');
    }

    const updated: StudentAcademicProfile = {
      ...current,
      manualCompletedCodes: [],
      manualUncompletedCodes: [],
      updatedAt: new Date().toISOString(),
    };

    await this.repo.saveProfile(updated);
    return updated;
  }

  async saveCustomCurriculum(customCurriculum: CurriculumStructure): Promise<StudentAcademicProfile> {
    const current = await this.repo.getProfile();
    if (!current) {
      throw new Error('Nenhum perfil acadêmico carregado para editar currículo.');
    }

    const updated: StudentAcademicProfile = {
      ...current,
      customCurriculum,
      updatedAt: new Date().toISOString(),
    };

    await this.repo.saveProfile(updated);
    return updated;
  }

  async resetCustomCurriculum(): Promise<StudentAcademicProfile> {
    const current = await this.repo.getProfile();
    if (!current) {
      throw new Error('Nenhum perfil acadêmico carregado para restaurar currículo.');
    }

    const updated: StudentAcademicProfile = {
      ...current,
      customCurriculum: undefined,
      updatedAt: new Date().toISOString(),
    };

    await this.repo.saveProfile(updated);
    return updated;
  }

  async updateIntegralizationPercentage(percentual?: number): Promise<StudentAcademicProfile> {
    const current = await this.repo.getProfile();
    if (!current) {
      throw new Error('Nenhum perfil acadêmico carregado para atualizar a integralização.');
    }

    let nextValue: number | undefined;
    if (percentual !== undefined) {
      if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
        throw new Error('Informe um percentual válido entre 0% e 100%.');
      }
      nextValue = Math.round(percentual * 10) / 10;
    }

    const updated: StudentAcademicProfile = {
      ...current,
      percentualIntegralizado: nextValue,
      updatedAt: new Date().toISOString(),
    };

    await this.repo.saveProfile(updated);
    return updated;
  }

  async setCurriculum(curriculum: CurriculumStructure): Promise<StudentAcademicProfile> {
    const current = (await this.repo.getProfile()) || {
      matricula: '',
      courseName: curriculum.courseName,
      level: 'Graduação',
      admissionYear: '2024.1',
      completedDisciplines: [],
      manualCompletedCodes: [],
      manualUncompletedCodes: [],
      updatedAt: new Date().toISOString(),
    };

    // Preserva dados nativos do curso oficial antes de registrar a matriz selecionada
    const nativeCourseName =
      current.nativeCourseName ||
      (current.matricula ? current.courseName : undefined);
    const nativeCurriculumCode =
      current.nativeCurriculumCode ||
      (current.matricula ? current.curriculumCode : undefined);
    const nativeCurriculumId =
      current.nativeCurriculumId ||
      (current.matricula ? current.curriculumId : undefined);

    const updated: StudentAcademicProfile = {
      ...current,
      nativeCourseName,
      nativeCurriculumCode,
      nativeCurriculumId,
      userSelectedCurriculumCode: curriculum.code,
      userSelectedCurriculumId: curriculum.id,
      userSelectedCourseName: curriculum.courseName,
      courseName: curriculum.courseName,
      curriculumCode: curriculum.code,
      curriculumId: curriculum.id,
      customCurriculum: undefined,
      shift: current.shift || curriculum.shift,
      updatedAt: new Date().toISOString(),
    };

    await this.repo.saveProfile(updated);
    return updated;
  }

  async syncWithSigaa(creds: SigaaCredentials): Promise<{
    profile: StudentAcademicProfile;
    matchedCurriculum?: CurriculumStructure;
  }> {
    const rawRes = await this.repo.fetchSigaaHistory(creds);

    const { curriculaCatalog, usedFullCatalog } = await this.resolveCurriculaCatalog(
      rawRes.curso,
      rawRes.turno
    );

    const parseInput = {
      rawText: rawRes.pdfText,
      pdfBase64: rawRes.pdfBase64,
      defaultProfile: {
        matricula: rawRes.matricula,
        studentName: rawRes.nome,
        cpf: rawRes.cpf,
        courseName: rawRes.curso,
        level: rawRes.nivel,
        admissionYear: rawRes.entrada,
        ira: rawRes.ira,
        mp: rawRes.mp,
        chObrigatoriaPendente: rawRes.chObrigatoriaPendente,
        chOptativaPendente: rawRes.chOptativaPendente,
        chTotalCurriculo: rawRes.chTotalCurriculo,
        chComplementarPendente: rawRes.chComplementarPendente,
        percentualIntegralizado: rawRes.percentualIntegralizado,
        shift: rawRes.turno ?? undefined,
      },
      curriculaCatalog,
    };

    let parseResult = await this.parseHistoricoUseCase.execute(parseInput);

    // Auto-cura: se a matriz não constar no arquivo do curso, tenta o catálogo completo
    const curriculumPrefix = parseResult.profile.curriculumCode?.match(/^(\d{3,5})\//)?.[1];
    if (
      !usedFullCatalog &&
      curriculumPrefix &&
      !curriculaCatalog.some((c) => c.code.startsWith(curriculumPrefix))
    ) {
      try {
        const fullCatalog = await this.repo.getAllCurricula();
        if (fullCatalog.some((c) => c.code.startsWith(curriculumPrefix))) {
          parseResult = await this.parseHistoricoUseCase.execute({
            ...parseInput,
            curriculaCatalog: fullCatalog,
          });
        }
      } catch (e) {
        console.warn(
          '[ManageAcademicProfile] Auto-cura com catálogo completo falhou:',
          e
        );
      }
    }

    parseResult.profile.nativeCourseName = parseResult.profile.courseName;
    parseResult.profile.nativeCurriculumCode = parseResult.profile.curriculumCode;
    parseResult.profile.nativeCurriculumId = parseResult.profile.curriculumId;

    const currentProfile = await this.repo.getProfile();
    const isSameStudent =
      !currentProfile?.matricula ||
      !parseResult.profile.matricula ||
      currentProfile.matricula === parseResult.profile.matricula;
    if (currentProfile && isSameStudent) {
      if (currentProfile.nativeCourseName) {
        parseResult.profile.nativeCourseName = currentProfile.nativeCourseName;
        parseResult.profile.nativeCurriculumCode = currentProfile.nativeCurriculumCode;
        parseResult.profile.nativeCurriculumId = currentProfile.nativeCurriculumId;
      }

      parseResult.profile.manualCompletedCodes = currentProfile.manualCompletedCodes || [];
      parseResult.profile.manualUncompletedCodes = currentProfile.manualUncompletedCodes || [];
      parseResult.profile.customCurriculum = currentProfile.customCurriculum;
      if (!parseResult.profile.cpf && currentProfile.cpf) {
        parseResult.profile.cpf = currentProfile.cpf;
      }

      // Preserva histórico anterior caso o PDF venha sem disciplinas
      if (
        (!parseResult.profile.completedDisciplines || parseResult.profile.completedDisciplines.length === 0) &&
        (currentProfile.completedDisciplines?.length || 0) > 0
      ) {
        console.warn(
          '[ManageAcademicProfile] Emissão de histórico sem disciplinas válidas; mantendo histórico escolar anterior.'
        );
        parseResult.profile.completedDisciplines = currentProfile.completedDisciplines;
        parseResult.profile.trancadaEvents = currentProfile.trancadaEvents || [];
        if (!parseResult.profile.curriculumCode && currentProfile.curriculumCode) {
          parseResult.profile.curriculumCode = currentProfile.curriculumCode;
          parseResult.profile.curriculumId = currentProfile.curriculumId;
        }
      }

      // Preserva matriz escolhida manualmente pelo discente
      if (currentProfile.userSelectedCurriculumCode) {
        parseResult.profile.userSelectedCurriculumCode = currentProfile.userSelectedCurriculumCode;
        parseResult.profile.userSelectedCurriculumId = currentProfile.userSelectedCurriculumId;
        parseResult.profile.userSelectedCourseName = currentProfile.userSelectedCourseName;

        const manualCurr = curriculaCatalog.find(
          (c) =>
            c.code === currentProfile.userSelectedCurriculumCode ||
            (currentProfile.userSelectedCurriculumId && c.id === currentProfile.userSelectedCurriculumId)
        );
        if (manualCurr) {
          parseResult.matchedCurriculum = manualCurr;
          parseResult.profile.curriculumCode = manualCurr.code;
          parseResult.profile.curriculumId = manualCurr.id;
          parseResult.profile.courseName = manualCurr.courseName;
        }
      }
    }

    // Se o usuário apagou os dados/credenciais enquanto o histórico era baixado, não regrava o perfil
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (
          window.localStorage.getItem('unb_vault_cleared_v1') === 'true' ||
          window.localStorage.getItem('unb_cleared_sigaa_v1') === 'true'
        ) {
          return parseResult;
        }
      } catch {}
    }

    await this.repo.saveProfile(parseResult.profile);
    return parseResult;
  }

  /**
   * Importa um PDF de histórico escolar do SIGAA UnB localmente (sem login),
   * enriquecendo com o catálogo de matrizes curriculares e persistindo no SQLite.
   */
  async importFromPdf(pdfData: Uint8Array): Promise<{
    profile: StudentAcademicProfile;
    matchedCurriculum?: CurriculumStructure;
  }> {
    if (!pdfData || pdfData.byteLength === 0) {
      throw new Error('O arquivo PDF selecionado está vazio.');
    }

    // 1. Extrai texto via Rust (Desktop + Android, pulando unpdf no WebView) ou cai para unpdf fora do Tauri
    let preExtractedText: string | undefined;
    try {
      const rustText = await this.repo.extractPdfText?.(pdfData);
      if (rustText && rustText.trim().length > 0) {
        preExtractedText = rustText;
      }
    } catch (e) {
      console.warn('[ManageAcademicProfile] Extração via Rust indisponível, usando fallback JS:', e);
    }

    const probe = await this.parseHistoricoUseCase.execute(
      preExtractedText ? { rawText: preExtractedText } : { pdfData }
    );
    const extractedText = probe.rawText || preExtractedText || '';
    return this.finalizePdfImport(probe, extractedText);
  }

  /**
   * Importa um PDF de histórico a partir do caminho local (drag-and-drop nativo no Tauri).
   */
  async importFromPdfPath(path: string): Promise<{
    profile: StudentAcademicProfile;
    matchedCurriculum?: CurriculumStructure;
  }> {
    if (!path || !path.trim()) {
      throw new Error('Caminho do arquivo PDF inválido.');
    }
    const extractedText = await this.repo.extractPdfTextFromPath?.(path);
    if (!extractedText || !extractedText.trim()) {
      throw new Error(
        'Não foi possível ler o PDF arrastado. Tente usar o botão "Escolher arquivo PDF".'
      );
    }
    const probe = await this.parseHistoricoUseCase.execute({ rawText: extractedText });
    return this.finalizePdfImport(probe, extractedText);
  }

  private async finalizePdfImport(
    probe: { profile: StudentAcademicProfile; matchedCurriculum?: CurriculumStructure },
    extractedText: string
  ): Promise<{
    profile: StudentAcademicProfile;
    matchedCurriculum?: CurriculumStructure;
  }> {
    const hasDisciplines = probe.profile.completedDisciplines.length > 0;
    const hasIdentity = Boolean(
      probe.profile.matricula ||
        (probe.profile.courseName && probe.profile.courseName !== 'Curso UnB')
    );
    if (!hasDisciplines && !hasIdentity) {
      throw new Error(
        'Não foi possível reconhecer um histórico escolar do SIGAA UnB neste PDF. Verifique se o arquivo foi emitido pelo SIGAA.'
      );
    }

    // 2. Carrega catálogo de matrizes do curso (com fallback/auto-cura) reutilizando o texto já extraído
    const { curriculaCatalog, usedFullCatalog } = await this.resolveCurriculaCatalog(
      probe.profile.courseName,
      probe.profile.shift
    );

    let parseResult = await this.parseHistoricoUseCase.execute({
      rawText: extractedText,
      curriculaCatalog,
    });

    const curriculumPrefix = parseResult.profile.curriculumCode?.match(/^(\d{3,5})\//)?.[1];
    if (
      !usedFullCatalog &&
      curriculumPrefix &&
      !curriculaCatalog.some((c) => c.code.startsWith(curriculumPrefix))
    ) {
      try {
        const fullCatalog = await this.repo.getAllCurricula();
        if (fullCatalog.some((c) => c.code.startsWith(curriculumPrefix))) {
          parseResult = await this.parseHistoricoUseCase.execute({
            rawText: extractedText,
            curriculaCatalog: fullCatalog,
          });
        }
      } catch (e) {
        console.warn(
          '[ManageAcademicProfile] Auto-cura com catálogo completo falhou na importação de PDF:',
          e
        );
      }
    }

    parseResult.profile.nativeCourseName = parseResult.profile.courseName;
    parseResult.profile.nativeCurriculumCode = parseResult.profile.curriculumCode;
    parseResult.profile.nativeCurriculumId = parseResult.profile.curriculumId;

    await this.repo.saveProfile(parseResult.profile);
    return parseResult;
  }

  /** Carrega matrizes do curso resolvido ou cai para o catálogo completo. */
  private async resolveCurriculaCatalog(
    courseName: string,
    shiftToken?: string | null
  ): Promise<{ curriculaCatalog: CurriculumStructure[]; usedFullCatalog: boolean }> {
    let curriculaCatalog: CurriculumStructure[] = [];
    let usedFullCatalog = false;
    try {
      const courseId = await this.resolveCourseId(courseName, shiftToken);
      if (courseId) {
        curriculaCatalog = await this.repo.getCurriculaForCourse(courseId);
      }
    } catch (e) {
      console.warn(
        '[ManageAcademicProfile] Catálogo por curso falhou, usando catálogo completo:',
        e
      );
    }
    if (curriculaCatalog.length === 0) {
      curriculaCatalog = await this.repo.getAllCurricula();
      usedFullCatalog = true;
    }
    return { curriculaCatalog, usedFullCatalog };
  }

  /** Resolve o course_id no catálogo pequeno de cursos (~48KB, via Rust). */
  private async resolveCourseId(
    courseName: string,
    shiftToken?: string | null
  ): Promise<string | null> {
    if (!courseName || !this.gradeRepo?.getCoursesCatalog) return null;
    try {
      const catalog = (await this.gradeRepo.getCoursesCatalog()) || [];
      return resolveCourseIdFromCatalog(catalog, courseName, shiftToken);
    } catch {
      return null;
    }
  }
}
