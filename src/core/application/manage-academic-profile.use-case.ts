import type { StudentAcademicProfile } from '../domain/entities/academic-profile';
import type { CurriculumStructure } from '../domain/entities/course';
import type { SigaaCredentials } from '../domain/entities/credential';
import type { IAcademicProfileRepository } from '../domain/interfaces/academic-profile-repo.interface';
import type { IGradeRepository } from '../domain/interfaces/grade-repo.interface';
import { normalizeCourseText } from './get-courses.use-case';
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

    // O catálogo completo (curricula.json) tem ~43MB: resolve o curso no
    // catálogo pequeno (courses.json, ~48KB) e baixa só as matrizes dele.
    // O catálogo completo é último recurso.
    let curriculaCatalog: CurriculumStructure[] = [];
    try {
      const courseId = await this.resolveCourseId(rawRes.curso);
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
    }

    const parseResult = await this.parseHistoricoUseCase.execute({
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
      },
      curriculaCatalog,
    });

    const currentProfile = await this.repo.getProfile();
    // Preserva eventuais marcações manuais e matriz customizada anteriores
    if (currentProfile) {
      parseResult.profile.manualCompletedCodes = currentProfile.manualCompletedCodes || [];
      parseResult.profile.manualUncompletedCodes = currentProfile.manualUncompletedCodes || [];
      parseResult.profile.customCurriculum = currentProfile.customCurriculum;
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
  private async resolveCourseId(courseName: string): Promise<string | null> {
    if (!courseName || !this.gradeRepo?.getCoursesCatalog) return null;
    try {
      const catalog = (await this.gradeRepo.getCoursesCatalog()) || [];
      if (catalog.length === 0) return null;
      const target = normalizeCourseText(courseName);
      const hit =
        catalog.find((c) => normalizeCourseText(c.name) === target) ||
        catalog.find((c) => {
          const n = normalizeCourseText(c.name);
          return n.length >= 4 && (n.includes(target) || target.includes(n));
        });
      return hit ? hit.id : null;
    } catch {
      return null;
    }
  }
}
