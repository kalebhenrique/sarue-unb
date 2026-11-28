import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { useContainer } from "./ContainerContext";
import {
  notifyMyCourseListeners,
  resolveCourseIdForProfile,
} from "../hooks/useMyCourse";
import { notifyFeedListeners } from "../hooks/useFeed";
import { toast } from "@/components/ui";
import {
  checkAndDisableRuNotificationsOnSemesterEnd,
  checkDueRuMenuNotification,
  checkIsAutoSyncAllowed,
  fetchAndCacheRuMenus,
  fetchAndCacheStudentWallet,
  getNotificationSettings,
  getSavedRuCampus,
  isOnboardingNotificationsBlocked,
  loadNotificationSettings,
  subscribeOnboardingNotificationsGate,
  syncRuMenuNotifications,
  type CurriculumStructure,
  isDemoModeActive,
} from "@/core";
import { checkForUpdates } from "../hooks/useAppUpdater";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { humanizeError, isAuthErrorMessage } from "@/lib/error-messages";

export const SLOW_SCRAPING_THRESHOLD_MS = 25000;

export type SyncStepId =
  "sigaa" | "aprender3" | "teams" | "myCourse" | "ghPages" | "planilha";

export type SyncStepStatus =
  "idle" | "syncing" | "success" | "error" | "skipped";

export interface SyncStepInfo {
  id: SyncStepId;
  label: string;
  sublabel: string;
  status: SyncStepStatus;
  message?: string;
  count?: number;
  lastUpdated?: string;
}

export interface SyncOptions {
  /** Marca sincronizações disparadas automaticamente (boot/timer em segundo plano). */
  isAutoSync?: boolean;
}

export interface SyncContextValue {
  isSyncing: boolean;
  isSlowConnection: boolean;
  lastSyncedAt: string | null;
  steps: Record<SyncStepId, SyncStepInfo>;
  syncAll: (options?: SyncOptions) => Promise<void>;
  cancelSync: () => void;
  startOnboardingSigaaSync: () => void;
  startOnboardingAprender3Sync: () => void;
  cancelOnboardingAprender3Sync: () => void;
  completeOnboardingSync: () => void;
}

export interface OnboardingPreSyncSession {
  mainGen: number;
  sigaaStarted: boolean;
  sigaaSuccess: boolean;
  sigaaError: boolean;
  aprenderStarted: boolean;
  aprenderSuccess: boolean;
  aprenderError: boolean;
}

export interface OnboardingPreSyncMachine {
  getMainGen: () => number;
  getSession: () => OnboardingPreSyncSession | null;
  isAnyInFlight: () => boolean;
  isSigaaInFlight: () => boolean;
  beginFullSync: () => { mainGen: number; isCancelled: () => boolean };
  cancelAll: () => void;
  beginSigaa: () => {
    mainGen: number;
    session: OnboardingPreSyncSession;
    isCancelled: () => boolean;
  };
  finishSigaa: (mainGen: number) => boolean;
  beginAprender3: () => {
    mainGen: number;
    session: OnboardingPreSyncSession;
    isCancelled: () => boolean;
  };
  finishAprender3: (mainGen: number, isCancelled: () => boolean) => boolean;
  cancelAprender3: () => { shouldFinalize: boolean; mainGen: number | null };
  clearSessionIfIdle: () => void;
  completeOnboarding: () => { shouldFallbackSyncAll: boolean };
}

/**
 * Máquina de estados pura para coordenar pré-sync incremental no onboarding:
 * gerações independentes permitem anexar ou cancelar o Aprender 3 sem
 * interromper o pipeline do SIGAA em voo.
 */
export function createOnboardingPreSyncMachine(): OnboardingPreSyncMachine {
  let mainGen = 0;
  let aprenderGen = 0;
  let sigaaInFlight = false;
  let aprenderInFlight = false;
  let session: OnboardingPreSyncSession | null = null;

  return {
    getMainGen: () => mainGen,
    getSession: () => session,
    isAnyInFlight: () => sigaaInFlight || aprenderInFlight,
    isSigaaInFlight: () => sigaaInFlight,

    beginFullSync() {
      const myGen = ++mainGen;
      aprenderGen += 1;
      sigaaInFlight = false;
      aprenderInFlight = false;
      session = null;
      return { mainGen: myGen, isCancelled: () => mainGen !== myGen };
    },

    cancelAll() {
      mainGen += 1;
      aprenderGen += 1;
      sigaaInFlight = false;
      aprenderInFlight = false;
      session = null;
    },

    beginSigaa() {
      const myGen = ++mainGen;
      aprenderGen += 1;
      session = {
        mainGen: myGen,
        sigaaStarted: true,
        sigaaSuccess: false,
        sigaaError: false,
        aprenderStarted: false,
        aprenderSuccess: false,
        aprenderError: false,
      };
      sigaaInFlight = true;
      aprenderInFlight = false;
      return {
        mainGen: myGen,
        session,
        isCancelled: () => mainGen !== myGen,
      };
    },

    finishSigaa(expectedMainGen: number) {
      if (mainGen !== expectedMainGen) return false;
      sigaaInFlight = false;
      return !aprenderInFlight;
    },

    beginAprender3() {
      if (!session) {
        session = {
          mainGen,
          sigaaStarted: false,
          sigaaSuccess: false,
          sigaaError: false,
          aprenderStarted: true,
          aprenderSuccess: false,
          aprenderError: false,
        };
      } else {
        session.aprenderStarted = true;
        session.aprenderSuccess = false;
        session.aprenderError = false;
      }
      const expectedMainGen = session.mainGen;
      const myAprenderGen = ++aprenderGen;
      aprenderInFlight = true;
      return {
        mainGen: expectedMainGen,
        session,
        isCancelled: () =>
          mainGen !== expectedMainGen || aprenderGen !== myAprenderGen,
      };
    },

    finishAprender3(expectedMainGen: number, isCancelled: () => boolean) {
      if (isCancelled() || mainGen !== expectedMainGen) return false;
      aprenderInFlight = false;
      return !sigaaInFlight;
    },

    cancelAprender3() {
      aprenderGen += 1;
      aprenderInFlight = false;
      if (session) {
        session.aprenderStarted = false;
        session.aprenderSuccess = false;
        session.aprenderError = false;
      }
      const shouldFinalize = Boolean(session && !sigaaInFlight);
      return {
        shouldFinalize,
        mainGen: session ? session.mainGen : null,
      };
    },

    clearSessionIfIdle() {
      if (!sigaaInFlight && !aprenderInFlight) {
        session = null;
      }
    },

    completeOnboarding() {
      if (!session) {
        return { shouldFallbackSyncAll: true };
      }
      if (!sigaaInFlight && !aprenderInFlight) {
        session = null;
      }
      return { shouldFallbackSyncAll: false };
    },
  };
}

const INITIAL_STEPS: Record<SyncStepId, SyncStepInfo> = {
  sigaa: {
    id: "sigaa",
    label: "SIGAA",
    sublabel: "Turmas e avisos do portal discente",
    status: "idle",
    message: "Pronto para sincronizar",
  },
  aprender3: {
    id: "aprender3",
    label: "Aprender 3",
    sublabel: "Tarefas, atividades, trabalhos e prazos",
    status: "idle",
    message: "Pronto para sincronizar",
  },
  teams: {
    id: "teams",
    label: "Microsoft Teams",
    sublabel: "Equipes, turmas e avisos institucionais",
    status: "idle",
    message: "Pronto para sincronizar",
  },
  myCourse: {
    id: "myCourse",
    label: "Meu Curso",
    sublabel: "Histórico e fluxo curricular",
    status: "idle",
    message: "Pronto para sincronizar",
  },
  ghPages: {
    id: "ghPages",
    label: "Catálogo UnB",
    sublabel: "Matrizes curriculares e turmas ofertadas",
    status: "idle",
    message: "Pronto para sincronizar",
  },
  planilha: {
    id: "planilha",
    label: "Dados de Docentes",
    sublabel: "Relatos da comunidade",
    status: "idle",
    message: "Pronto para sincronizar",
  },
};

export const PERIODIC_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function shouldTriggerPeriodicSync(
  lastSyncedAt: string | null,
  nowMs: number,
  isBackgroundRunEnabled: boolean,
): boolean {
  if (!isBackgroundRunEnabled) return false;
  if (!lastSyncedAt) return true;
  const lastMs = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(lastMs)) return true;
  return nowMs - lastMs >= PERIODIC_SYNC_INTERVAL_MS;
}

const SyncContext = createContext<SyncContextValue | null>(null);

// Ouvintes globais de fim de sync (ex.: avaliação de prazos do sino)
const syncCompleteListeners = new Set<() => void>();

/** Assina a conclusão de um ciclo completo de sincronização. */
export function subscribeToSyncComplete(listener: () => void): () => void {
  syncCompleteListeners.add(listener);
  return () => {
    syncCompleteListeners.delete(listener);
  };
}

function notifySyncComplete() {
  syncCompleteListeners.forEach((fn) => fn());
}

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { useCases, repos } = useContainer();

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSlowConnection, setIsSlowConnection] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEYS.LAST_SYNCED_AT);
  });
  const [steps, setSteps] =
    useState<Record<SyncStepId, SyncStepInfo>>(INITIAL_STEPS);
  const syncInFlightRef = useRef<boolean>(false);
  const preSyncMachineRef = useRef<OnboardingPreSyncMachine>(
    createOnboardingPreSyncMachine(),
  );
  const syncAllRef = useRef<(options?: SyncOptions) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const useCasesRef = useRef(useCases);
  useCasesRef.current = useCases;

  const updateStep = useCallback(
    (id: SyncStepId, patch: Partial<SyncStepInfo>) => {
      setSteps((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          ...patch,
        },
      }));
    },
    [],
  );

  const setTraySyncing = useCallback((syncing: boolean) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@/core/infrastructure/bindings").then(({ commands }) => {
        void commands.setTraySyncState(syncing);
      });
    }
  }, []);

  const runRuMenuSync = useCallback(async () => {
    try {
      const campus = getSavedRuCampus();
      await fetchAndCacheRuMenus(campus);
      await syncRuMenuNotifications({ campus });
    } catch (err) {
      console.warn("[SyncContext] Falha ao sincronizar cardápio do RU:", err);
    }
  }, []);

  const runSigaaStep = useCallback(
    async (
      isCancelled: () => boolean,
      options?: { isAutoSync?: boolean },
    ): Promise<"success" | "error" | "auth_error" | "cancelled"> => {
      updateStep("sigaa", {
        status: "syncing",
        message: "Conectando ao SIGAA e extraindo turmas e avisos...",
      });
      try {
        let res = await useCases.syncPlatforms.execute(["sigaa"]);
        if (isCancelled()) return "cancelled";

        if (res.errors?.sigaa && options?.isAutoSync) {
          await new Promise((r) => setTimeout(r, 2000));
          if (isCancelled()) return "cancelled";
          res = await useCases.syncPlatforms.execute(["sigaa"]);
          if (isCancelled()) return "cancelled";
        }

        if (res.errors?.sigaa) {
          const msg = humanizeError(
            res.errors.sigaa,
            "Falha na conexão com o SIGAA.",
          );
          updateStep("sigaa", {
            status: "error",
            message: msg,
          });
          return isAuthErrorMessage(msg) ? "auth_error" : "error";
        }

        const sigaaCourses = res.courses.filter((c) => c.platform === "sigaa");
        const sigaaItems = res.items.filter((i) => i.platform === "sigaa");
        updateStep("sigaa", {
          status: "success",
          count: sigaaCourses.length,
          message: `${sigaaCourses.length} turmas • ${sigaaItems.length} avisos`,
          lastUpdated: new Date().toISOString(),
        });
        notifyFeedListeners();
        notifySyncComplete();
        return "success";
      } catch (err: unknown) {
        if (isCancelled()) return "cancelled";
        const msg = humanizeError(err, "Falha na conexão com o SIGAA.");
        updateStep("sigaa", {
          status: "error",
          message: msg,
        });
        return isAuthErrorMessage(msg) ? "auth_error" : "error";
      }
    },
    [updateStep, useCases.syncPlatforms],
  );

  const runAprender3Step = useCallback(
    async (
      isCancelled: () => boolean,
      options?: { isAutoSync?: boolean },
    ): Promise<"success" | "error" | "auth_error" | "cancelled"> => {
      updateStep("aprender3", {
        status: "syncing",
        message: "Buscando tarefas, atividades e prazos no Aprender 3...",
      });
      try {
        let res = await useCases.syncPlatforms.execute(["aprender3"]);
        if (isCancelled()) return "cancelled";

        if (res.errors?.aprender3 && options?.isAutoSync) {
          await new Promise((r) => setTimeout(r, 2000));
          if (isCancelled()) return "cancelled";
          res = await useCases.syncPlatforms.execute(["aprender3"]);
          if (isCancelled()) return "cancelled";
        }

        if (res.errors?.aprender3) {
          const msg = humanizeError(
            res.errors.aprender3,
            "Falha na conexão com o Aprender 3.",
          );
          updateStep("aprender3", {
            status: "error",
            message: msg,
          });
          return isAuthErrorMessage(msg) ? "auth_error" : "error";
        }

        const a3Courses = res.courses.filter((c) => c.platform === "aprender3");
        const a3Items = res.items.filter((i) => i.platform === "aprender3");
        updateStep("aprender3", {
          status: "success",
          count: a3Items.length,
          message: `${a3Courses.length} turmas • ${a3Items.length} tarefas/prazos`,
          lastUpdated: new Date().toISOString(),
        });
        notifyFeedListeners();
        notifySyncComplete();
        return "success";
      } catch (err: unknown) {
        if (isCancelled()) return "cancelled";
        const msg = humanizeError(err, "Falha na conexão com o Aprender 3.");
        updateStep("aprender3", {
          status: "error",
          message: msg,
        });
        return isAuthErrorMessage(msg) ? "auth_error" : "error";
      }
    },
    [updateStep, useCases.syncPlatforms],
  );

  const runMyCourseAndWalletStep = useCallback(
    async (
      sigaaCreds: { matricula: string; senha: string },
      sigaaSuccess: boolean,
      isCancelled: () => boolean,
    ) => {
      if (!sigaaSuccess) {
        updateStep("myCourse", {
          status: "error",
          message: "Aguardando autenticação correta no SIGAA",
        });
        return;
      }

      updateStep("myCourse", {
        status: "syncing",
        message:
          "Baixando histórico escolar, carteirinha oficial e calculando fluxo...",
      });

      let studentCpf: string | undefined;
      let historyError: unknown = null;

      try {
        const result =
          await useCases.manageAcademicProfile.syncWithSigaa(sigaaCreds);
        if (isCancelled()) return;
        notifyMyCourseListeners();

        const student = result.profile;
        studentCpf = student.cpf;

        const iraStr = student.ira
          ? `IRA ${student.ira.toFixed(2)}`
          : "Perfil discente ativo";
        const pctStr = student.percentualIntegralizado
          ? `${student.percentualIntegralizado.toFixed(0)}% integralizado`
          : "Fluxo atualizado";

        updateStep("myCourse", {
          status: "success",
          message: `${iraStr} • ${pctStr}`,
          lastUpdated: new Date().toISOString(),
        });
      } catch (err: unknown) {
        historyError = err;
      }

      if (isCancelled()) return;

      // A sincronização da Carteirinha e do Saldo/Extrato do RU roda sempre que o login SIGAA teve sucesso,
      // mesmo se o download do PDF do histórico escolar tiver falhado.
      try {
        if (!studentCpf) {
          const cachedProfile =
            await useCases.manageAcademicProfile.getProfile();
          studentCpf = cachedProfile?.cpf;
        }
        await fetchAndCacheStudentWallet(
          sigaaCreds.matricula,
          sigaaCreds.senha,
          studentCpf,
        );
      } catch (walletErr) {
        console.warn(
          "[SyncContext] Falha ao sincronizar carteirinha/extrato do RU:",
          walletErr,
        );
      }

      if (isCancelled()) return;

      if (historyError) {
        updateStep("myCourse", {
          status: "error",
          message: humanizeError(
            historyError,
            "Falha ao sincronizar histórico escolar.",
          ),
        });
      }
    },
    [updateStep, useCases.manageAcademicProfile],
  );

  const notifySyncSummary = useCallback(
    ({
      totalConfigured,
      totalSuccess,
      totalErrors,
      isAutoSync,
      hasAuthError,
    }: {
      totalConfigured: number;
      totalSuccess: number;
      totalErrors: number;
      isAutoSync?: boolean;
      hasAuthError?: boolean;
    }) => {
      if (isOnboardingNotificationsBlocked()) return;

      const errorDescription = hasAuthError
        ? "Credenciais inválidas ou expiradas. Verifique matrícula/CPF e senha em Configurações."
        : "Não foi possível conectar às plataformas acadêmicas.";

      if (totalConfigured > 0 && totalSuccess === 0 && totalErrors > 0) {
        toast.add({
          title: hasAuthError ? "Erro de autenticação" : "Erro na sincronização",
          description: errorDescription,
          type: "danger",
          timeout: 6000,
        });
        if (isAutoSync && getNotificationSettings().backgroundSync) {
          void repos.osNotifier.notify({
            title: hasAuthError
              ? "Credenciais precisam ser atualizadas"
              : "Falha na sincronização em segundo plano",
            body: errorDescription,
          });
        }
      } else if (totalErrors > 0 && totalSuccess > 0) {
        if (!isAutoSync) {
          toast.add({
            title: "Sincronização com avisos",
            description: hasAuthError
              ? "Uma plataforma recusou o login. Revise suas credenciais em Configurações."
              : "Algumas plataformas não puderam ser sincronizadas.",
            type: "warning",
            timeout: 5000,
          });
        }
      } else if (totalSuccess > 0 || totalConfigured === 0) {
        toast.add({
          title: "Sincronização concluída",
          description: "Seus dados foram atualizados com sucesso.",
          type: "success",
          timeout: 4000,
        });
        if (isAutoSync && getNotificationSettings().backgroundSync) {
          void repos.osNotifier.notify({
            title: "Sincronização em segundo plano concluída",
            body: "Seus avisos, prazos e cardápio do RU foram atualizados.",
          });
        }
      }
    },
    [repos.osNotifier],
  );

  const runGhPagesStep = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        // Mesma política do useMyCourse: com perfil (login SIGAA), baixa só
        // as matrizes do curso do usuário em vez do catálogo inteiro da UnB.
        const profile = await useCases.manageAcademicProfile.getProfile();
        let curricula: CurriculumStructure[] = [];
        let isCourseScoped = false;
        if (profile) {
          const courseId = await resolveCourseIdForProfile(
            profile,
            repos.gradeRepo,
          );
          if (courseId) {
            curricula =
              await useCases.manageAcademicProfile.getCurriculaForCourse(
                courseId,
              );
            isCourseScoped = curricula.length > 0;
          }
        }
        if (curricula.length === 0) {
          curricula = await useCases.manageAcademicProfile.getAllCurricula();
        }
        if (isCancelled()) return;
        updateStep("ghPages", {
          status: "success",
          count: curricula.length,
          message: isCourseScoped
            ? `${curricula.length} matrizes do seu curso disponíveis`
            : `${curricula.length} matrizes curriculares disponíveis`,
          lastUpdated: new Date().toISOString(),
        });
      } catch (err: unknown) {
        if (isCancelled()) return;
        updateStep("ghPages", {
          status: "error",
          message: humanizeError(
            err,
            "Não foi possível carregar o catálogo da UnB.",
          ),
        });
      }
    },
    [repos.gradeRepo, updateStep, useCases.manageAcademicProfile],
  );

  const runPlanilhaStep = useCallback(
    async (isCancelled: () => boolean) => {
      updateStep("planilha", {
        status: "syncing",
        message: "Buscando relatos da comunidade...",
      });
      try {
        const evaluations = await useCases.getProfessorEvaluations.execute(
          undefined,
          true,
        );
        if (isCancelled()) return;
        updateStep("planilha", {
          status: "success",
          message: `${evaluations.length} relatos de professores disponíveis`,
          lastUpdated: new Date().toISOString(),
        });
      } catch (err) {
        if (isCancelled()) return;
        updateStep("planilha", {
          status: "error",
          message: humanizeError(
            err,
            "Não foi possível atualizar os relatos de docentes.",
          ),
        });
      }
    },
    [updateStep, useCases.getProfessorEvaluations],
  );

  const cancelSync = useCallback(() => {
    preSyncMachineRef.current.cancelAll();
    syncInFlightRef.current = false;
    setIsSyncing(false);
    setIsSlowConnection(false);
    setLastSyncedAt(null);
    setSteps(INITIAL_STEPS);

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void (async () => {
        try {
          const { commands } = await import("@/core/infrastructure/bindings");
          await commands.setTraySyncState(false);
          await commands.disconnectTeams();
        } catch {}
      })();
    }
  }, []);

  const syncAll = useCallback(
    async (options?: SyncOptions) => {
      if (syncInFlightRef.current || isOnboardingNotificationsBlocked()) {
        return;
      }

      // Sincronizações automáticas respeitam a trava de Wi-Fi sem afetar o sync manual.
      if (options?.isAutoSync) {
        const allowed = await checkIsAutoSyncAllowed();
        if (!allowed) {
          return;
        }
      }

      const { isCancelled } = preSyncMachineRef.current.beginFullSync();

      syncInFlightRef.current = true;
      setIsSyncing(true);
      setIsSlowConnection(false);
      setTraySyncing(true);

      let slowTimerId: ReturnType<typeof setTimeout> | null = null;
      let sigaaInFlight = false;
      let aprenderInFlight = false;

      const clearSlowTimer = () => {
        if (slowTimerId !== null) {
          clearTimeout(slowTimerId);
          slowTimerId = null;
        }
      };

      try {
        // Dispara verificação silenciosa de atualizações do app em segundo plano
        void checkForUpdates(true);

        // Carrega credenciais em tempo real diretamente do cofre para evitar estados defasados de React
        const activeCreds = await useCases.getCredentials.getAllCredentials();

        // Modo Demonstração: nenhum passo dependente de conta roda — mesmo que
        // credenciais órfãs existam no cofre, nunca scraping com dados fictícios.
        const isDemo = isDemoModeActive();

        // 1. Sincronização do Catálogo UnB (GitHub Pages / CDN).
        const sigaaCreds = activeCreds.sigaa;
        const hasSigaa =
          !isDemo &&
          Boolean(sigaaCreds?.matricula?.trim() && sigaaCreds?.senha);

        if (hasSigaa) {
          updateStep("ghPages", {
            status: "syncing",
            message:
              "Aguardando histórico do SIGAA para baixar as matrizes do seu curso...",
          });
        } else {
          updateStep("ghPages", {
            status: "syncing",
            message: "Consultando catálogo de matrizes e turmas da UnB...",
          });
          void runGhPagesStep(isCancelled);
        }

        // 2. Sincronização do SIGAA e 3. Aprender 3
        let sigaaSuccess = false;
        let sigaaError = false;
        let hasAuthError = false;

        const aprenderCreds = activeCreds.aprender3;
        const hasAprender =
          !isDemo &&
          Boolean(aprenderCreds?.cpf?.trim() && aprenderCreds?.senha);

        let aprenderSuccess = false;
        let aprenderError = false;

        if (hasSigaa || hasAprender) {
          slowTimerId = setTimeout(() => {
            if (isCancelled() || (!sigaaInFlight && !aprenderInFlight)) return;
            setIsSlowConnection(true);
            if (sigaaInFlight) {
              updateStep("sigaa", {
                message:
                  "Conexão muito lenta detectada — aguardando resposta do SIGAA...",
              });
            }
            if (aprenderInFlight) {
              updateStep("aprender3", {
                message:
                  "Conexão muito lenta detectada — aguardando resposta do Aprender 3...",
              });
            }
            if (!options?.isAutoSync && !isOnboardingNotificationsBlocked()) {
              toast.add({
                title: "Conexão muito lenta detectada",
                description:
                  "A internet está muito lenta para responder ao scraping. A sincronização pode levar mais tempo.",
                type: "warning",
                timeout: 6000,
              });
            }
          }, SLOW_SCRAPING_THRESHOLD_MS);
        }

        const sigaaPromise = (async () => {
          if (!hasSigaa) {
            updateStep("sigaa", {
              status: "skipped",
              message: isDemo
                ? "Indisponível no modo demonstração"
                : "Conta não configurada",
            });
            return;
          }
          sigaaInFlight = true;
          try {
            const outcome = await runSigaaStep(isCancelled, options);
            if (outcome === "success") sigaaSuccess = true;
            else if (outcome === "error" || outcome === "auth_error") {
              sigaaError = true;
              if (outcome === "auth_error") hasAuthError = true;
            }
          } finally {
            sigaaInFlight = false;
          }
        })();

        const aprenderPromise = (async () => {
          if (!hasAprender) {
            updateStep("aprender3", {
              status: "skipped",
              message: isDemo
                ? "Indisponível no modo demonstração"
                : "Conta não configurada",
            });
            return;
          }
          aprenderInFlight = true;
          try {
            const outcome = await runAprender3Step(isCancelled, options);
            if (outcome === "success") aprenderSuccess = true;
            else if (outcome === "error" || outcome === "auth_error") {
              aprenderError = true;
              if (outcome === "auth_error") hasAuthError = true;
            }
          } finally {
            aprenderInFlight = false;
          }
        })();

        // Marca estado inicial do Teams antes de aguardar os canais HTTP rápidos
        const teamsCreds = activeCreds.teams;
        const hasTeams = !isDemo && Boolean(teamsCreds?.isConnected);
        if (!hasTeams) {
          updateStep("teams", {
            status: "skipped",
            message: isDemo
              ? "Indisponível no modo demonstração"
              : "Conta não configurada",
          });
        } else {
          updateStep("teams", {
            status: "syncing",
            message: "Aguardando canais rápidos para sincronizar Teams...",
          });
        }

        // Aguarda os canais rápidos executando em paralelo (sem competir com o webview do Teams)
        await Promise.all([sigaaPromise, aprenderPromise, runRuMenuSync()]);
        clearSlowTimer();
        if (isCancelled()) return;

        // 4. Sincronização de Meu Curso + Carteirinha Estudantil / Extrato RU
        if (!hasSigaa) {
          updateStep("myCourse", {
            status: "skipped",
            message: isDemo
              ? "Indisponível no modo demonstração"
              : "Requer conta do SIGAA configurada",
          });
        } else {
          await runMyCourseAndWalletStep(
            sigaaCreds!,
            sigaaSuccess,
            isCancelled,
          );
        }
        if (isCancelled()) return;

        // Catálogo UnB por curso (depois do histórico) + Planilha de avaliações
        await runGhPagesStep(isCancelled);
        if (isCancelled()) return;

        await runPlanilhaStep(isCancelled);
        if (isCancelled()) return;

        const now = new Date().toISOString();
        setLastSyncedAt(now);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEYS.LAST_SYNCED_AT, now);
        }
        setIsSyncing(false);
        setTraySyncing(false);
        notifyFeedListeners();
        notifySyncComplete();

        notifySyncSummary({
          totalConfigured: (hasSigaa ? 1 : 0) + (hasAprender ? 1 : 0),
          totalSuccess: (sigaaSuccess ? 1 : 0) + (aprenderSuccess ? 1 : 0),
          totalErrors: (sigaaError ? 1 : 0) + (aprenderError ? 1 : 0),
          isAutoSync: options?.isAutoSync,
          hasAuthError,
        });

        // 5. Sincronização do Teams (100% não-bloqueante em segundo plano após liberar a UI)
        if (hasTeams && !isCancelled()) {
          void (async () => {
            updateStep("teams", {
              status: "syncing",
              message: "Sincronizando equipes do Teams em segundo plano...",
            });

            try {
              const res = await useCases.syncPlatforms.execute(["teams"]);
              if (isCancelled()) return;
              if (res.errors?.teams) {
                updateStep("teams", {
                  status: "error",
                  message: humanizeError(
                    res.errors.teams,
                    "Falha na sincronização do Teams.",
                  ),
                });
              } else {
                const teamsCourses = res.courses.filter(
                  (c) => c.platform === "teams",
                );
                const teamsItems = res.items.filter(
                  (i) => i.platform === "teams",
                );
                const teamsPostsCount = teamsItems.filter(
                  (i) => i.itemType === "post",
                ).length;
                const teamsAssignmentsCount = teamsItems.filter(
                  (i) => i.itemType === "assignment",
                ).length;
                updateStep("teams", {
                  status: "success",
                  count: teamsCourses.length,
                  message:
                    teamsAssignmentsCount > 0
                      ? `${teamsCourses.length} turmas • ${teamsPostsCount} avisos • ${teamsAssignmentsCount} atividades`
                      : `${teamsCourses.length} turmas • ${teamsItems.length} avisos`,
                  lastUpdated: new Date().toISOString(),
                });
                setLastSyncedAt(new Date().toISOString());
                notifyFeedListeners();
                notifySyncComplete();
              }
            } catch (err: unknown) {
              if (isCancelled()) return;
              updateStep("teams", {
                status: "error",
                message: humanizeError(err, "Falha na sincronização do Teams."),
              });
            } finally {
              if (!isCancelled()) {
                syncInFlightRef.current = false;
              }
            }
          })();
        } else {
          syncInFlightRef.current = false;
        }
      } catch {
        clearSlowTimer();
        if (!isCancelled()) {
          setIsSyncing(false);
          syncInFlightRef.current = false;
          setTraySyncing(false);
        }
      }
    },
    [
      notifySyncSummary,
      runAprender3Step,
      runGhPagesStep,
      runMyCourseAndWalletStep,
      runPlanilhaStep,
      runRuMenuSync,
      runSigaaStep,
      setTraySyncing,
      updateStep,
      useCases,
    ],
  );

  syncAllRef.current = syncAll;

  const finalizeOnboardingSync = useCallback(
    (expectedMainGen: number) => {
      const machine = preSyncMachineRef.current;
      if (machine.getMainGen() !== expectedMainGen || machine.isAnyInFlight()) {
        return;
      }

      const session = machine.getSession();
      const now = new Date().toISOString();
      setLastSyncedAt(now);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEYS.LAST_SYNCED_AT, now);
      }
      setIsSyncing(false);
      syncInFlightRef.current = false;
      setTraySyncing(false);
      notifyFeedListeners();
      notifySyncComplete();

      if (!isOnboardingNotificationsBlocked()) {
        notifySyncSummary({
          totalConfigured:
            (session?.sigaaStarted ? 1 : 0) +
            (session?.aprenderStarted ? 1 : 0),
          totalSuccess:
            (session?.sigaaSuccess ? 1 : 0) +
            (session?.aprenderSuccess ? 1 : 0),
          totalErrors:
            (session?.sigaaError ? 1 : 0) + (session?.aprenderError ? 1 : 0),
        });
        machine.clearSessionIfIdle();
      }
    },
    [notifySyncSummary, setTraySyncing],
  );

  const startOnboardingSigaaSync = useCallback(() => {
    const { mainGen, session, isCancelled } =
      preSyncMachineRef.current.beginSigaa();

    syncInFlightRef.current = true;
    setIsSyncing(true);
    setIsSlowConnection(false);
    setTraySyncing(true);
    setSteps({
      ...INITIAL_STEPS,
      sigaa: {
        ...INITIAL_STEPS.sigaa,
        status: "syncing",
        message: "Conectando ao SIGAA e extraindo turmas e avisos...",
      },
      aprender3: {
        ...INITIAL_STEPS.aprender3,
        status: "skipped",
        message: "Conta não configurada",
      },
      teams: {
        ...INITIAL_STEPS.teams,
        status: "skipped",
        message: "Conta não configurada",
      },
      ghPages: {
        ...INITIAL_STEPS.ghPages,
        status: "syncing",
        message:
          "Aguardando histórico do SIGAA para baixar as matrizes do seu curso...",
      },
    });

    void (async () => {
      let slowTimerId: ReturnType<typeof setTimeout> | null = null;
      let sigaaInFlight = false;
      const clearSlowTimer = () => {
        if (slowTimerId !== null) {
          clearTimeout(slowTimerId);
          slowTimerId = null;
        }
      };

      try {
        void checkForUpdates(true);

        const activeCreds = await useCases.getCredentials.getAllCredentials();
        if (isCancelled()) return;

        const isDemo = isDemoModeActive();
        const sigaaCreds = activeCreds.sigaa;
        const hasSigaa =
          !isDemo &&
          Boolean(sigaaCreds?.matricula?.trim() && sigaaCreds?.senha);

        if (!hasSigaa) {
          updateStep("sigaa", {
            status: "skipped",
            message: isDemo
              ? "Indisponível no modo demonstração"
              : "Conta não configurada",
          });
          updateStep("myCourse", {
            status: "skipped",
            message: isDemo
              ? "Indisponível no modo demonstração"
              : "Requer conta do SIGAA configurada",
          });
          await runGhPagesStep(isCancelled);
          if (isCancelled()) return;
          await runPlanilhaStep(isCancelled);
          return;
        }

        slowTimerId = setTimeout(() => {
          if (isCancelled() || !sigaaInFlight) return;
          setIsSlowConnection(true);
          updateStep("sigaa", {
            message:
              "Conexão muito lenta detectada — aguardando resposta do SIGAA...",
          });
          if (!isOnboardingNotificationsBlocked()) {
            toast.add({
              title: "Conexão muito lenta detectada",
              description:
                "A internet está muito lenta para responder ao scraping. A sincronização pode levar mais tempo.",
              type: "warning",
              timeout: 6000,
            });
          }
        }, SLOW_SCRAPING_THRESHOLD_MS);

        const ruMenuPromise = runRuMenuSync();

        sigaaInFlight = true;
        try {
          const outcome = await runSigaaStep(isCancelled);
          if (outcome === "success") session.sigaaSuccess = true;
          else if (outcome === "error" || outcome === "auth_error") {
            session.sigaaError = true;
          }
        } finally {
          sigaaInFlight = false;
          clearSlowTimer();
        }

        await ruMenuPromise;
        if (isCancelled()) return;

        await runMyCourseAndWalletStep(
          sigaaCreds!,
          session.sigaaSuccess,
          isCancelled,
        );
        if (isCancelled()) return;

        await runGhPagesStep(isCancelled);
        if (isCancelled()) return;

        await runPlanilhaStep(isCancelled);
      } finally {
        clearSlowTimer();
        if (preSyncMachineRef.current.finishSigaa(mainGen)) {
          finalizeOnboardingSync(mainGen);
        }
      }
    })();
  }, [
    finalizeOnboardingSync,
    runGhPagesStep,
    runMyCourseAndWalletStep,
    runPlanilhaStep,
    runRuMenuSync,
    runSigaaStep,
    setTraySyncing,
    updateStep,
    useCases.getCredentials,
  ]);

  const startOnboardingAprender3Sync = useCallback(() => {
    const { mainGen, session, isCancelled } =
      preSyncMachineRef.current.beginAprender3();

    syncInFlightRef.current = true;
    setIsSyncing(true);
    setTraySyncing(true);
    updateStep("aprender3", {
      status: "syncing",
      message: "Buscando tarefas, atividades e prazos no Aprender 3...",
    });

    void (async () => {
      let slowTimerId: ReturnType<typeof setTimeout> | null = null;
      const clearSlowTimer = () => {
        if (slowTimerId !== null) {
          clearTimeout(slowTimerId);
          slowTimerId = null;
        }
      };

      try {
        const activeCreds = await useCases.getCredentials.getAllCredentials();
        if (isCancelled()) return;

        const isDemo = isDemoModeActive();
        const aprenderCreds = activeCreds.aprender3;
        const hasAprender =
          !isDemo &&
          Boolean(aprenderCreds?.cpf?.trim() && aprenderCreds?.senha);

        if (!hasAprender) {
          updateStep("aprender3", {
            status: "skipped",
            message: isDemo
              ? "Indisponível no modo demonstração"
              : "Conta não configurada",
          });
          return;
        }

        slowTimerId = setTimeout(() => {
          if (isCancelled()) return;
          setIsSlowConnection(true);
          updateStep("aprender3", {
            message:
              "Conexão muito lenta detectada — aguardando resposta do Aprender 3...",
          });
          if (!isOnboardingNotificationsBlocked()) {
            toast.add({
              title: "Conexão muito lenta detectada",
              description:
                "A internet está muito lenta para responder ao scraping. A sincronização pode levar mais tempo.",
              type: "warning",
              timeout: 6000,
            });
          }
        }, SLOW_SCRAPING_THRESHOLD_MS);

        const outcome = await runAprender3Step(isCancelled);
        if (outcome === "success") session.aprenderSuccess = true;
        else if (outcome === "error" || outcome === "auth_error") {
          session.aprenderError = true;
        }
      } finally {
        clearSlowTimer();
        if (preSyncMachineRef.current.finishAprender3(mainGen, isCancelled)) {
          finalizeOnboardingSync(mainGen);
        }
      }
    })();
  }, [
    finalizeOnboardingSync,
    runAprender3Step,
    setTraySyncing,
    updateStep,
    useCases.getCredentials,
  ]);

  const cancelOnboardingAprender3Sync = useCallback(() => {
    const { shouldFinalize, mainGen } =
      preSyncMachineRef.current.cancelAprender3();
    updateStep("aprender3", {
      status: "skipped",
      message: "Conta não configurada",
    });
    if (shouldFinalize && mainGen !== null && syncInFlightRef.current) {
      finalizeOnboardingSync(mainGen);
    }
  }, [finalizeOnboardingSync, updateStep]);

  const completeOnboardingSync = useCallback(() => {
    const { shouldFallbackSyncAll } =
      preSyncMachineRef.current.completeOnboarding();
    if (shouldFallbackSyncAll) {
      void syncAll();
    }
  }, [syncAll]);

  useEffect(() => {
    let disposed = false;
    let unlistenManual: (() => void) | undefined;
    let unlistenAuto: (() => void) | undefined;
    let unlistenRuTick: (() => void) | undefined;

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/event").then(({ listen }) => {
        void listen("request-sync", () => {
          void syncAllRef.current();
        }).then((fn) => {
          if (disposed) fn();
          else unlistenManual = fn;
        });

        void listen("request-auto-sync", () => {
          const isBgEnabled =
            localStorage.getItem("sarue_background_run_enabled") !== "false";
          const last = localStorage.getItem(STORAGE_KEYS.LAST_SYNCED_AT);
          if (!shouldTriggerPeriodicSync(last, Date.now(), isBgEnabled)) {
            return;
          }
          void syncAllRef.current({ isAutoSync: true });
        }).then((fn) => {
          if (disposed) fn();
          else unlistenAuto = fn;
        });

        void listen("check-ru-notifications", () => {
          if (!isOnboardingNotificationsBlocked()) {
            void checkDueRuMenuNotification();
          }
        }).then((fn) => {
          if (disposed) fn();
          else unlistenRuTick = fn;
        });
      });
    }

    // Checagem silenciosa de atualizações do app na abertura (no-op no mobile e MS Store)
    void checkForUpdates(true);

    const checkPeriodicSync = () => {
      if (typeof window === "undefined" || isOnboardingNotificationsBlocked()) {
        return;
      }
      const isBgEnabled =
        localStorage.getItem("sarue_background_run_enabled") !== "false";
      const last = localStorage.getItem(STORAGE_KEYS.LAST_SYNCED_AT);
      if (!shouldTriggerPeriodicSync(last, Date.now(), isBgEnabled)) {
        return;
      }
      void (async () => {
        try {
          const hasAccounts =
            await useCasesRef.current.getCredentials.hasSavedCredentials();
          if (!disposed && hasAccounts && !isOnboardingNotificationsBlocked()) {
            void syncAllRef.current({ isAutoSync: true });
          }
        } catch {}
      })();
    };

    // Mantém a verificação periódica a cada 10 minutos enquanto o app estiver aberto,
    // sem disparar sincronização automática na abertura (o usuário usa o botão Sincronizar).
    const intervalId = setInterval(checkPeriodicSync, 10 * 60 * 1000);

    // Carrega preferências de notificação, avalia fim do período de aulas e mantém a agenda de alertas do RU atualizada
    const evaluateRuSemesterEndAndSync = async () => {
      try {
        const calendars =
          await useCasesRef.current.getAcademicCalendar.execute();
        const currentCal =
          calendars.find((c) => c.isCurrent) ?? calendars[0] ?? null;
        const disabledBySemesterEnd =
          await checkAndDisableRuNotificationsOnSemesterEnd(currentCal);
        if (disabledBySemesterEnd) {
          toast.add({
            title: "Período de aulas encerrado",
            description:
              "As notificações diárias do RU foram desativadas pelo fim do semestre. Você pode reativá-las nas Configurações durante as férias.",
            type: "info",
            timeout: 7000,
          });
        }
      } catch {}
    };

    const runRuNotificationSync = async () => {
      if (disposed || isOnboardingNotificationsBlocked()) return;
      await evaluateRuSemesterEndAndSync();
      void syncRuMenuNotifications({ fetchIfMissing: true });
    };

    void loadNotificationSettings().then(() => {
      void runRuNotificationSync();
    });

    const unsubscribeOnboardingGate = subscribeOnboardingNotificationsGate(
      (blocked) => {
        if (!blocked) {
          void loadNotificationSettings().then(() => {
            void runRuNotificationSync();
          });
        }
      },
    );

    const ruNotifIntervalId = setInterval(() => {
      if (!isOnboardingNotificationsBlocked()) {
        void evaluateRuSemesterEndAndSync();
        void checkDueRuMenuNotification();
      }
    }, 60 * 1000);

    return () => {
      disposed = true;
      if (unlistenManual) unlistenManual();
      if (unlistenAuto) unlistenAuto();
      if (unlistenRuTick) unlistenRuTick();
      unsubscribeOnboardingGate();
      clearInterval(intervalId);
      clearInterval(ruNotifIntervalId);
    };
  }, []);

  const value = useMemo(
    () => ({
      isSyncing,
      isSlowConnection,
      lastSyncedAt,
      steps,
      syncAll,
      cancelSync,
      startOnboardingSigaaSync,
      startOnboardingAprender3Sync,
      cancelOnboardingAprender3Sync,
      completeOnboardingSync,
    }),
    [
      isSyncing,
      isSlowConnection,
      lastSyncedAt,
      steps,
      syncAll,
      cancelSync,
      startOnboardingSigaaSync,
      startOnboardingAprender3Sync,
      cancelOnboardingAprender3Sync,
      completeOnboardingSync,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync deve ser utilizado dentro de um SyncProvider");
  }
  return context;
}

export function useOptionalSync(): SyncContextValue | null {
  return useContext(SyncContext);
}
