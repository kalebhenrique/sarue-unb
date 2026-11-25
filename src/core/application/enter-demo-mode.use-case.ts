import type { IFeedRepository } from '../domain/interfaces/feed-repo.interface';
import type { IAcademicProfileRepository } from '../domain/interfaces/academic-profile-repo.interface';
import type { IIraScenarioRepository } from '../domain/interfaces/ira-scenario-repo.interface';
import { ManageGradeUseCase } from './manage-grade.use-case';
import { BuildIraScenarioUseCase } from './build-ira-scenario.use-case';
import { DEMO_STUDENT_PROFILE } from '../seeds/academic-profile.seed';
import {
  DEMO_COURSES,
  DEMO_FEED_ITEMS,
  DEMO_SAVED_GRADE,
  DEMO_WALLET,
} from '../seeds/demo-data.seed';
import { saveCachedStudentWallet } from '../infrastructure/ru-wallet.service';

/**
 * Semeia os dados fictícios do Modo Demonstração (feed, turmas, perfil
 * acadêmico, cenário de IRA, grade salva e carteirinha/saldo RU) pelos
 * repositórios do container —
 * os mesmos que o app usa para ler. Nada toca nos servidores da UnB e o cofre
 * de credenciais fica vazio, então os passos de sync dependente de conta ficam
 * naturalmente de fora.
 *
 * A flag de demo (setDemoMode) fica a cargo do chamador (camada de UI), pois
 * use cases dependem apenas do domínio. A semeadura é idempotente (upserts
 * por id) e cada passo é best-effort: uma falha de repositório não impede os
 * demais.
 */
export class EnterDemoModeUseCase {
  private buildIraScenario = new BuildIraScenarioUseCase();

  constructor(
    private readonly feedRepo: IFeedRepository,
    private readonly academicProfileRepo: IAcademicProfileRepository,
    private readonly iraScenarioRepo: IIraScenarioRepository,
    private readonly manageGrade: ManageGradeUseCase,
  ) {}

  async execute(): Promise<void> {
    const steps: Array<[string, () => Promise<unknown>]> = [
      [
        'turmas do feed',
        () => this.feedRepo.saveCourses(DEMO_COURSES),
      ],
      [
        'itens do feed',
        () => this.feedRepo.saveItems(DEMO_FEED_ITEMS),
      ],
      [
        'perfil acadêmico',
        () =>
          this.academicProfileRepo.saveProfile({
            ...DEMO_STUDENT_PROFILE,
            updatedAt: new Date().toISOString(),
          }),
      ],
      [
        'cenário de IRA',
        () =>
          this.iraScenarioRepo.saveScenario(
            this.buildIraScenario.execute(DEMO_STUDENT_PROFILE),
          ),
      ],
      ['grade salva', () => this.manageGrade.save(DEMO_SAVED_GRADE)],
      ['carteira do RU', () => saveCachedStudentWallet(DEMO_WALLET)],
    ];

    for (const [label, step] of steps) {
      try {
        await step();
      } catch (err) {
        console.warn(`[DemoMode] Falha ao semear ${label}:`, err);
      }
    }
  }
}
