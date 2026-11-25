import type { IFeedRepository } from '../domain/interfaces/feed-repo.interface';
import type { IAcademicProfileRepository } from '../domain/interfaces/academic-profile-repo.interface';
import type { IIraScenarioRepository } from '../domain/interfaces/ira-scenario-repo.interface';
import type { IGradeRepository } from '../domain/interfaces/grade-repo.interface';
import type { IDeadlineNotificationRepository } from '../domain/interfaces/deadline-notification-repo.interface';
import { STORAGE_KEYS } from '../../lib/storage-keys';

/**
 * Modo Demonstração: permite explorar o app com dados fictícios sem conta
 * SIGAA/Aprender 3/Teams — feito para o revisor do Google Play (e qualquer
 * curioso). A flag vive no localStorage: leitura síncrona no boot (o cofre
 * Stronghold é async/Argon2id) e não é dado sensível.
 */

export const DEMO_MODE_STORAGE_KEY = STORAGE_KEYS.DEMO_MODE;

/**
 * Par de credenciais de teste informado ao revisor do Google Play no campo
 * "Acesso ao app" do Play Console. O app é open-source, então o par é público:
 * a consequência de alguém usá-lo é entrar no modo demo (dados fictícios,
 * nenhum dado sensível e nenhuma requisição às plataformas da UnB).
 */
export const DEMO_SIGAA_CREDENTIALS = {
  matricula: '123456789',
  senha: '#SarueTest123@',
} as const;

export function isDemoSigaaCredentials(
  matricula: string,
  senha: string,
): boolean {
  return (
    matricula.trim() === DEMO_SIGAA_CREDENTIALS.matricula &&
    senha === DEMO_SIGAA_CREDENTIALS.senha
  );
}

export function isDemoModeActive(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setDemoMode(active: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (active) {
      window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    }
  } catch {
    // localStorage indisponível (privacy mode etc.): demo só não persiste.
  }
}

export interface ExitDemoModeDeps {
  feedRepo: Pick<IFeedRepository, 'clear'>;
  academicProfileRepo: Pick<IAcademicProfileRepository, 'clearProfile'>;
  iraScenarioRepo: Pick<IIraScenarioRepository, 'clearScenario'>;
  gradeRepo: Pick<IGradeRepository, 'clearSavedGrade'>;
  deadlineNotificationRepo: Pick<IDeadlineNotificationRepository, 'clear'>;
}

/**
 * Desliga o modo demo e limpa os dados fictícios que ele semeou (feed,
 * perfil acadêmico, cenário de IRA e grade salva). Chamado ao conectar uma
 * conta real ou ao sair do demo pelas Configurações. Cada limpeza é
 * best-effort: uma falha não impede as demais nem o desligamento da flag.
 */
export async function exitDemoMode(deps: ExitDemoModeDeps): Promise<void> {
  setDemoMode(false);
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['feed', () => deps.feedRepo.clear()],
    ['perfil acadêmico', () => deps.academicProfileRepo.clearProfile()],
    ['cenário de IRA', () => deps.iraScenarioRepo.clearScenario()],
    ['grade salva', () => deps.gradeRepo.clearSavedGrade()],
    ['notificações de prazo', () => deps.deadlineNotificationRepo.clear()],
  ];
  for (const [label, step] of steps) {
    try {
      await step();
    } catch (err) {
      console.warn(`[DemoMode] Falha ao limpar ${label} do modo demo:`, err);
    }
  }
}
