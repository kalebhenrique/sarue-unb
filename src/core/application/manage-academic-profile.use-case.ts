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

    const updated: StudentAcademicProfile = {
      ...current,
      courseName: curriculum.courseName,
      curriculumCode: curriculum.code,
      curriculumId: curriculum.id,
      userSelectedCurriculumCode: curriculum.code,
      userSelectedCurriculumId: curriculum.id,
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

    // Baixa apenas matrizes do curso para evitar download do catálogo completo
    let curriculaCatalog: CurriculumStructure[] = [];
    let usedFullCatalog = false;
    try {
      const courseId = await this.resolveCourseId(rawRes.curso, rawRes.turno);
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

    const parseInput = {
      rawText: rawRes.pdfText,
      pdfBase64: rawRes.pdfBase64,
      defaultProfile: {
        matricula: rawRes.matricula,
        studentName: rawRes.nome,
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

    const currentProfile = await this.repo.getProfile();
    if (currentProfile) {
      parseResult.profile.manualCompletedCodes = currentProfile.manualCompletedCodes || [];
      parseResult.profile.manualUncompletedCodes = currentProfile.manualUncompletedCodes || [];
      parseResult.profile.customCurriculum = currentProfile.customCurriculum;

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

        const manualCurr = curriculaCatalog.find(
          (c) =>
            c.code === currentProfile.userSelectedCurriculumCode ||
            (currentProfile.userSelectedCurriculumId && c.id === currentProfile.userSelectedCurriculumId)
        );
        if (manualCurr) {
          parseResult.matchedCurriculum = manualCurr;
          parseResult.profile.curriculumCode = manualCurr.code;
          parseResult.profile.curriculumId = manualCurr.id;
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
