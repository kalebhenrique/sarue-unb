import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui";
import { useCredentials } from "../../hooks/useCredentials";
import {
  Lock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  GraduationCap,
  BookOpen,
  Video,
  ChevronDown,
  LogOut,
} from "lucide-react";
import type { PlatformType } from "@/core";
import { useOptionalSync } from "@/context/SyncContext";
import { useContainer } from "@/context/ContainerContext";
import { notifyFeedListeners } from "@/hooks/useFeed";
import { resetGradeCache } from "@/hooks/useGrade";
import { resetMyCourseCache } from "@/hooks/useMyCourse";
import { resetStudentWalletCache } from "@/hooks/useStudentWallet";
import {
  DEMO_WALLET,
  exitDemoMode,
  isDemoModeActive,
  isDemoSigaaCredentials,
  saveCachedStudentWallet,
  setDemoMode,
} from "@/core";
import { isMobileDevice } from "@/lib/platform";

export interface PlatformAccountsAccordionProps {
  /** Título opcional do bloco (o onboarding usa; a Settings tem PageHeader próprio) */
  title?: string;
  subtitle?: string;
  /** Registra a ação de concluir (usado pelo footer do wizard no onboarding) */
  registerFinish?: (finish: () => Promise<void>) => void;
  /** Estado para o chrome do wizard: há conta conectada? está ocupado? */
  onActiveChange?: (state: { connected: boolean; busy: boolean }) => void;
  /** Animação de entrada dos adesivos (onboarding sim; Settings não) */
  animated?: boolean;
  /** Gaveta aberta ao montar (onboarding abre o SIGAA; Settings abre nenhuma) */
  initialOpenPlatform?: PlatformType | null;
  /** Permite fechar a gaveta aberta mesmo sem tudo conectado (Settings; onboarding mantém uma aberta) */
  allowAllClosed?: boolean;
  /** Exibir a plataforma Microsoft Teams (padrão true; false no onboarding) */
  showTeams?: boolean;
  /** Fecha as gavetas automaticamente quando todas as plataformas estiverem conectadas (onboarding) */
  closeWhenAllConnected?: boolean;
  /** Inicia scraping silencioso em segundo plano assim que SIGAA/Aprender 3 conectarem (onboarding) */
  preSyncOnConnect?: boolean;
  /**
   * Anatomia das gavetas: "stickers" (padrão, onboarding — adesivos com
   * sombra dura própria) ou "panel" (Settings — linhas segmentadas dentro
   * do card da seção, sem sombra própria, para não aninhar adesivos, e
   * inputs alinhados em linha com fallback para coluna em janelas pequenas).
   */
  variant?: "stickers" | "panel";
}

/**
 * "As gavetas do cofre": cada plataforma é um adesivo que expande o formulário
 * inline; conectado, fica verde-pastel com check estampado. Conectou uma,
 * abre a próxima pendente. Compartilhado entre onboarding (passo 4) e Settings.
 */
export const PlatformAccountsAccordion: React.FC<
  PlatformAccountsAccordionProps
> = ({
  title,
  subtitle,
  registerFinish,
  onActiveChange,
  animated = true,
  initialOpenPlatform = "sigaa",
  allowAllClosed = false,
  showTeams = true,
  closeWhenAllConnected = false,
  preSyncOnConnect = false,
  variant = "stickers",
}) => {
  const {
    saveSigaa,
    saveAprender3,
    saveTeams,
    clearPlatform,
    allCredentials,
    isLoading,
    error,
    clearError,
  } = useCredentials();
  const syncContext = useOptionalSync();
  const { repos, useCases } = useContainer();
  const reduced = useReducedMotion();

  // Adesivo aberto no momento (accordion: sempre um aberto)
  const [openPlatform, setOpenPlatform] = useState<PlatformType | null>(
    initialOpenPlatform,
  );

  // Campos SIGAA
  const [sigaaMatricula, setSigaaMatricula] = useState("");
  const [sigaaSenha, setSigaaSenha] = useState("");
  // Estado de conexão nasce do cofre (cache do hook): navegar entre telas desmonta
  // este componente, e ao remontar o adesivo precisa continuar "Conectado".
  const [sigaaSaved, setSigaaSaved] = useState(() =>
    Boolean(allCredentials.sigaa),
  );
  const [sigaaSuccessMsg, setSigaaSuccessMsg] = useState<string | null>(null);

  // Campos Aprender 3
  const [aprenderCpf, setAprenderCpf] = useState("");
  const [aprenderSenha, setAprenderSenha] = useState("");
  const [aprenderSaved, setAprenderSaved] = useState(() =>
    Boolean(allCredentials.aprender3),
  );
  const [aprenderSuccessMsg, setAprenderSuccessMsg] = useState<string | null>(
    null,
  );

  // Teams
  const [teamsConnected, setTeamsConnected] = useState(() =>
    Boolean(allCredentials.teams?.isConnected),
  );
  const [teamsSuccessMsg, setTeamsSuccessMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (allCredentials.teams?.isConnected !== undefined) {
      setTeamsConnected(Boolean(allCredentials.teams.isConnected));
    }
  }, [allCredentials.teams]);

  // Feedback comum
  const [formError, setFormError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  // Diálogo de desconexão do SIGAA: com outras contas conectadas, derruba todas
  const [isSigaaDisconnectDialogOpen, setIsSigaaDisconnectDialogOpen] =
    useState(false);
  const [isDisconnectingAll, setIsDisconnectingAll] = useState(false);
  // Diálogo de aviso ao conectar SIGAA sobre um histórico escolar já importado via PDF
  const [isReplaceTranscriptDialogOpen, setIsReplaceTranscriptDialogOpen] =
    useState(false);

  const allConnected =
    sigaaSaved && aprenderSaved && (showTeams ? teamsConnected : true);

  // Um adesivo aberto por vez. Fechar o aberto é permitido com tudo conectado
  // ou quando allowAllClosed (Settings). Aprender 3 e Teams exigem o SIGAA primeiro.
  const togglePlatform = (id: PlatformType) => {
    setFormError(null);
    clearError();
    setOpenPlatform((cur) => {
      if (cur !== id) {
        if (id !== "sigaa" && !sigaaSaved) return cur;
        return id;
      }
      return allConnected || allowAllClosed ? null : cur;
    });
  };

  /**
   * Login de teste do revisor do Google Play (credenciais em demo-mode.service):
   * não toca no CAS da UnB — ativa o Modo Demonstração (dados fictícios) e
   * segue o fluxo normal do wizard.
   */
  const enterDemoViaSigaaForm = async (): Promise<void> => {
    setDemoMode(true);
    await useCases.enterDemoMode.execute();
    await saveCachedStudentWallet(DEMO_WALLET);
    notifyFeedListeners();
    resetGradeCache();
    resetMyCourseCache();
    resetStudentWalletCache();
    setSigaaSaved(true);
    setSigaaSuccessMsg(
      "Modo de teste ativado: dados fictícios para avaliação do app.",
    );
    setOpenPlatform(
      !aprenderSaved
        ? "aprender3"
        : showTeams && !teamsConnected
          ? "teams"
          : closeWhenAllConnected
            ? null
            : "sigaa",
    );
  };

  const executeConnectSigaa = async (replaceImportedTranscript: boolean) => {
    setIsVerifying(true);
    try {
      const res = await saveSigaa({
        matricula: sigaaMatricula.trim(),
        senha: sigaaSenha,
      });
      if (res.success) {
        setSigaaSaved(true);
        setSigaaSuccessMsg(res.detail || "Conectado ao SIGAA com sucesso!");
        setIsReplaceTranscriptDialogOpen(false);
        // Login real encerra o Modo Demonstração: limpa os dados fictícios
        // para o sync real não conviver com o conteúdo do demo.
        if (isDemoModeActive()) {
          await exitDemoMode({
            feedRepo: repos.feedRepo,
            academicProfileRepo: repos.academicProfileRepo,
            iraScenarioRepo: repos.iraScenarioRepo,
            gradeRepo: repos.gradeRepo,
            deadlineNotificationRepo: repos.deadlineNotificationRepo,
          });
          resetGradeCache();
          resetMyCourseCache();
          resetStudentWalletCache();
          notifyFeedListeners();
        } else if (replaceImportedTranscript) {
          // Não apaga o perfil importado antes do sync confirmar: se o SIGAA falhar,
          // o histórico em PDF continua intacto; ao concluir, o sync substitui os dados.
          void syncContext?.syncAll();
        }
        if (preSyncOnConnect) {
          syncContext?.startOnboardingSigaaSync();
        }
        // Gaveta seguinte: SIGAA fica marcado como conectado e abre a próxima pendente;
        // sem pendente e com closeWhenAllConnected, fecha as gavetas
        setOpenPlatform(
          !aprenderSaved
            ? "aprender3"
            : showTeams && !teamsConnected
              ? "teams"
              : closeWhenAllConnected
                ? null
                : "sigaa",
        );
      } else {
        setSigaaSaved(false);
        setSigaaSuccessMsg(null);
        setIsReplaceTranscriptDialogOpen(false);
        setFormError(
          res.error ||
            "Falha ao autenticar no SIGAA. Verifique matrícula e senha.",
        );
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleConnectSigaa = async () => {
    setFormError(null);
    if (!sigaaMatricula.trim()) {
      setFormError("Informe sua matrícula do SIGAA.");
      return;
    }
    if (!sigaaSenha) {
      setFormError("Informe sua senha do SIGAA.");
      return;
    }
    // Porta do revisor do Google Play: credenciais de teste ativam o Modo
    // Demonstração sem tocar no CAS da UnB.
    if (
      isDemoSigaaCredentials(sigaaMatricula.trim(), sigaaSenha) &&
      !sigaaSaved &&
      !aprenderSaved &&
      !teamsConnected
    ) {
      setIsVerifying(true);
      try {
        await enterDemoViaSigaaForm();
      } finally {
        setIsVerifying(false);
      }
      return;
    }
    // Em Configurações, se o usuário entrou por histórico PDF e agora conecta
    // o SIGAA, avisa que o histórico importado será substituído pelo oficial.
    if (!preSyncOnConnect && !sigaaSaved && !isDemoModeActive()) {
      try {
        const existingProfile = await repos.academicProfileRepo.getProfile();
        if (
          existingProfile &&
          (existingProfile.completedDisciplines.length > 0 ||
            Boolean(existingProfile.matricula))
        ) {
          setIsReplaceTranscriptDialogOpen(true);
          return;
        }
      } catch {
        // Segue com a conexão normalmente se não foi possível consultar o perfil local
      }
    }
    await executeConnectSigaa(false);
  };

  const handleDisconnectSigaa = async () => {
    setFormError(null);
    setSigaaSuccessMsg(null);
    // SIGAA é essencial: desconectá-lo derruba as outras contas. Com outras
    // contas conectadas, passa pelo diálogo de confirmação.
    if (aprenderSaved || teamsConnected) {
      setIsSigaaDisconnectDialogOpen(true);
      return;
    }
    setIsVerifying(true);
    try {
      if (preSyncOnConnect) {
        syncContext?.cancelSync();
      }
      await clearPlatform("sigaa");
      setSigaaSaved(false);
    } catch {
      setFormError("Não foi possível desconectar do SIGAA.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Confirmação do diálogo: derruba Aprender 3 e Teams junto com o SIGAA e
  // devolve o accordion ao estado bloqueado (gaveta do SIGAA aberta).
  const handleConfirmSigaaDisconnect = async () => {
    setIsDisconnectingAll(true);
    setFormError(null);
    try {
      if (preSyncOnConnect) {
        syncContext?.cancelSync();
      }
      if (aprenderSaved) await clearPlatform("aprender3");
      if (teamsConnected) await clearPlatform("teams");
      await clearPlatform("sigaa");
      setAprenderSaved(false);
      setTeamsConnected(false);
      setSigaaSaved(false);
      setAprenderSuccessMsg(null);
      setTeamsSuccessMsg(null);
      setSigaaSuccessMsg(null);
      setOpenPlatform("sigaa");
      setIsSigaaDisconnectDialogOpen(false);
    } catch {
      setFormError("Não foi possível desconectar as contas.");
    } finally {
      setIsDisconnectingAll(false);
    }
  };

  const handleConnectAprender3 = async () => {
    setFormError(null);
    if (!aprenderCpf.trim()) {
      setFormError("Informe seu CPF do Aprender 3.");
      return;
    }
    if (!aprenderSenha) {
      setFormError("Informe sua senha do Aprender 3.");
      return;
    }
    setIsVerifying(true);
    try {
      const res = await saveAprender3({
        cpf: aprenderCpf.trim(),
        senha: aprenderSenha,
      });
      if (res.success) {
        setAprenderSaved(true);
        setAprenderSuccessMsg(
          res.detail || "Conectado ao Aprender 3 com sucesso!",
        );
        if (preSyncOnConnect) {
          syncContext?.startOnboardingAprender3Sync();
        }
        setOpenPlatform(
          showTeams && !teamsConnected
            ? "teams"
            : closeWhenAllConnected
              ? null
              : "aprender3",
        );
      } else {
        setAprenderSaved(false);
        setAprenderSuccessMsg(null);
        setFormError(
          res.error ||
            "Falha ao autenticar no Aprender 3. Verifique CPF e senha.",
        );
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnectAprender3 = async () => {
    setFormError(null);
    setAprenderSuccessMsg(null);
    setIsVerifying(true);
    try {
      if (preSyncOnConnect) {
        syncContext?.cancelOnboardingAprender3Sync();
      }
      await clearPlatform("aprender3");
      setAprenderSaved(false);
    } catch {
      setFormError("Não foi possível desconectar do Aprender 3.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleToggleTeams = async () => {
    setFormError(null);
    setTeamsSuccessMsg(null);
    if (teamsConnected) {
      setTeamsConnected(false);
      await clearPlatform("teams");
    } else {
      setIsVerifying(true);
      try {
        const res = await saveTeams({
          isConnected: true,
        });
        if (res.success) {
          setTeamsConnected(true);
          setTeamsSuccessMsg(
            res.detail || "Microsoft Teams conectado com sucesso!",
          );
          notifyFeedListeners();
          // Se já estiver na tela de Configurações (fora do onboarding), dispara a sincronização em segundo plano imediatamente
          if (!animated) {
            try {
              syncContext?.syncAll();
            } catch {}
          }
        } else {
          setFormError(res.error || "Falha ao autenticar no Microsoft Teams.");
        }
      } finally {
        setIsVerifying(false);
      }
    }
  };

  // Conclui salvando o que estiver preenchido e não salvo no adesivo aberto
  const handleFinish = async () => {
    setFormError(null);

    if (
      openPlatform === "sigaa" &&
      (sigaaMatricula || sigaaSenha) &&
      !sigaaSaved
    ) {
      if (!sigaaMatricula.trim()) {
        setFormError("Informe sua matrícula do SIGAA.");
        return;
      }
      if (!sigaaSenha) {
        setFormError("Informe sua senha do SIGAA.");
        return;
      }
      // Porta do revisor do Google Play: credenciais de teste ativam o Modo
      // Demonstração sem tocar no CAS da UnB.
      if (
        isDemoSigaaCredentials(sigaaMatricula.trim(), sigaaSenha) &&
        !aprenderSaved &&
        !teamsConnected
      ) {
        setIsVerifying(true);
        try {
          await enterDemoViaSigaaForm();
        } finally {
          setIsVerifying(false);
        }
        return;
      }
      setIsVerifying(true);
      try {
        const res = await saveSigaa({
          matricula: sigaaMatricula.trim(),
          senha: sigaaSenha,
        });
        if (!res.success) {
          setFormError(res.error || "Falha ao autenticar no SIGAA.");
          return;
        }
        setSigaaSaved(true);
        if (preSyncOnConnect) {
          syncContext?.startOnboardingSigaaSync();
        }
      } finally {
        setIsVerifying(false);
      }
    } else if (
      openPlatform === "aprender3" &&
      (aprenderCpf || aprenderSenha) &&
      !aprenderSaved
    ) {
      if (!aprenderCpf.trim()) {
        setFormError("Informe seu CPF do Aprender 3.");
        return;
      }
      if (!aprenderSenha) {
        setFormError("Informe sua senha do Aprender 3.");
        return;
      }
      setIsVerifying(true);
      try {
        const res = await saveAprender3({
          cpf: aprenderCpf.trim(),
          senha: aprenderSenha,
        });
        if (!res.success) {
          setFormError(res.error || "Falha ao autenticar no Aprender 3.");
          return;
        }
        setAprenderSaved(true);
        if (preSyncOnConnect) {
          syncContext?.startOnboardingAprender3Sync();
        }
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const anyConnected = sigaaSaved || aprenderSaved || teamsConnected;

  // Estado sobe para o footer do wizard (botão Entrar no Saruê)
  React.useEffect(() => {
    onActiveChange?.({
      connected: anyConnected,
      busy: isLoading || isVerifying,
    });
  }, [anyConnected, isLoading, isVerifying, onActiveChange]);

  // Ação de concluir registrada a cada render (fecha sobre o estado atual)
  React.useEffect(() => {
    registerFinish?.(handleFinish);
  });

  const platformRows: {
    id: PlatformType;
    name: string;
    hint: string;
    isSaved: boolean;
    block: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: "sigaa",
      name: "SIGAA",
      hint: "Matrícula e senha",
      isSaved: sigaaSaved,
      block: "bg-platform-sigaa",
      icon: <GraduationCap className="w-5 h-5 text-ink stroke-[2.5]" />,
    },
    {
      id: "aprender3",
      name: "Aprender 3",
      hint: "CPF e senha",
      isSaved: aprenderSaved,
      block: "bg-platform-aprender3",
      icon: <BookOpen className="w-5 h-5 text-ink stroke-[2.5]" />,
    },
    ...(showTeams
      ? [
          {
            id: "teams" as PlatformType,
            name: "Microsoft Teams (Beta)",
            hint: "Login interativo",
            isSaved: teamsConnected,
            block: "bg-platform-teams",
            icon: <Video className="w-5 h-5 text-white stroke-[2.5]" />,
          },
        ]
      : []),
  ];

  return (
    <div className="w-full">
      {/* Título opcional (onboarding usa; Settings tem PageHeader próprio) */}
      {title ? (
        <motion.div
          initial={animated ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 320, damping: 26, delay: 0.05 }
          }
          className="mb-5"
        >
          <h2 className="text-2xl font-black tracking-tight text-black">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-sm font-medium text-neutral-600 mt-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              {subtitle}
            </p>
          ) : null}
        </motion.div>
      ) : null}

      {/* Lista de plataformas: adesivos expansíveis */}
      <div className="space-y-3">
        {platformRows.map((p, i) => {
          const isOpen = openPlatform === p.id;
          const isLocked = p.id !== "sigaa" && !sigaaSaved;
          return (
            <motion.div
              key={p.id}
              initial={animated ? { opacity: 0, y: 14, scale: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : {
                      type: "spring",
                      stiffness: 320,
                      damping: 26,
                      delay: 0.12 + i * 0.08,
                    }
              }
              className={`border-2 border-ink rounded-lg overflow-hidden ${
                variant === "panel"
                  ? // Painel da Settings: linha segmentada do card — sem sombra própria.
                    ""
                  : // Adesivo do onboarding: sombra dura própria.
                    "shadow-(--neo-card-shadow)"
              } ${p.isSaved ? "bg-pastel-green" : "bg-paper"} ${isLocked ? "opacity-60" : ""}`}
            >
              {/* Cabeçalho do adesivo */}
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${p.id}-form`}
                onClick={() => {
                  if (!isLocked) togglePlatform(p.id);
                }}
                title={isLocked ? "Conecte o SIGAA primeiro" : undefined}
                aria-disabled={isLocked || undefined}
                className={`w-full flex items-center gap-3 p-4 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-colors duration-150 ${isLocked ? "cursor-not-allowed" : "cursor-pointer hover:bg-black/[0.03]"}`}
              >
                <div
                  className={`w-9 h-9 shrink-0 ${p.block} border-2 border-ink rounded-lg flex items-center justify-center`}
                >
                  {p.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-black">{p.name}</div>
                  <div className="text-xs font-medium text-neutral-600 truncate">
                    {p.isSaved
                      ? "Conectado"
                      : isLocked
                        ? "Conecte o SIGAA primeiro"
                        : p.hint}
                  </div>
                </div>
                {p.isSaved ? (
                  <motion.span
                    initial={animated ? { scale: 0, rotate: -20 } : false}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 400, damping: 15 }
                    }
                  >
                    <CheckCircle2 className="w-5 h-5 text-ink-success stroke-[2.5]" />
                  </motion.span>
                ) : null}
                {isLocked ? (
                  <Lock className="w-4 h-4 stroke-[2.5] text-neutral-500" />
                ) : (
                  <ChevronDown
                    className={`w-4 h-4 stroke-[2.5] text-neutral-700 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                  />
                )}
              </button>

              {/* Formulário expandido */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="form"
                    id={`${p.id}-form`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 300, damping: 30 }
                    }
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-3 border-t-2 border-ink/10 space-y-3">
                      {p.id === "sigaa" && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (isVerifying || isLoading) return;
                            if (sigaaSaved) {
                              void handleDisconnectSigaa();
                            } else {
                              void handleConnectSigaa();
                            }
                          }}
                          className="@container space-y-3"
                        >
                          <div
                            className={
                              variant === "panel"
                                ? "grid grid-cols-1 @min-[580px]:grid-cols-2 gap-3"
                                : "space-y-3"
                            }
                          >
                            <Input
                              label="Matrícula SIGAA"
                              placeholder="Ex: 202012345"
                              value={sigaaMatricula}
                              onChange={(e) => {
                                setSigaaMatricula(e.target.value);
                                setSigaaSaved(false);
                                setSigaaSuccessMsg(null);
                                setFormError(null);
                                clearError();
                              }}
                              disabled={isLoading || isVerifying}
                            />
                            <Input
                              type="password"
                              label="Senha SIGAA"
                              placeholder="Senha do SIGAA"
                              value={sigaaSenha}
                              onChange={(e) => {
                                setSigaaSenha(e.target.value);
                                setSigaaSaved(false);
                                setSigaaSuccessMsg(null);
                                setFormError(null);
                                clearError();
                              }}
                              disabled={isLoading || isVerifying}
                            />
                          </div>
                          {sigaaSaved && sigaaSuccessMsg ? (
                            <div className="p-3 bg-pastel-green text-black border-2 border-ink rounded-lg text-xs font-bold flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-ink-success stroke-[2.5] shrink-0" />
                              <span>{sigaaSuccessMsg}</span>
                            </div>
                          ) : null}
                          <div className="flex justify-end pt-1">
                            <Button
                              type="submit"
                              size="md"
                              variant={sigaaSaved ? "destructive" : "default"}
                              isLoading={isVerifying}
                              disabled={isVerifying || isLoading}
                            >
                              {sigaaSaved ? (
                                <LogOut className="w-3.5 h-3.5 stroke-[2.5]" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                              )}
                              <span>
                                {isVerifying
                                  ? "Validando conexão..."
                                  : sigaaSaved
                                    ? "Desconectar do SIGAA"
                                    : "Conectar SIGAA"}
                              </span>
                            </Button>
                          </div>
                        </form>
                      )}

                      {p.id === "aprender3" && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (isVerifying || isLoading) return;
                            if (aprenderSaved) {
                              void handleDisconnectAprender3();
                            } else {
                              void handleConnectAprender3();
                            }
                          }}
                          className="@container space-y-3"
                        >
                          <div
                            className={
                              variant === "panel"
                                ? "grid grid-cols-1 @min-[580px]:grid-cols-2 gap-3"
                                : "space-y-3"
                            }
                          >
                            <Input
                              label="CPF (somente números ou formatado)"
                              placeholder="Ex: 000.000.000-00"
                              value={aprenderCpf}
                              onChange={(e) => {
                                setAprenderCpf(e.target.value);
                                setAprenderSaved(false);
                                setAprenderSuccessMsg(null);
                                setFormError(null);
                                clearError();
                              }}
                              disabled={isLoading || isVerifying}
                            />
                            <Input
                              type="password"
                              label="Senha do Aprender 3"
                              placeholder="Senha do Aprender 3"
                              value={aprenderSenha}
                              onChange={(e) => {
                                setAprenderSenha(e.target.value);
                                setAprenderSaved(false);
                                setAprenderSuccessMsg(null);
                                setFormError(null);
                                clearError();
                              }}
                              disabled={isLoading || isVerifying}
                            />
                          </div>
                          {aprenderSaved && aprenderSuccessMsg ? (
                            <div className="p-3 bg-pastel-green text-black border-2 border-ink rounded-lg text-xs font-bold flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-ink-success stroke-[2.5] shrink-0" />
                              <span>{aprenderSuccessMsg}</span>
                            </div>
                          ) : null}
                          <div className="flex justify-end pt-1">
                            <Button
                              type="submit"
                              size="md"
                              variant={
                                aprenderSaved ? "destructive" : "default"
                              }
                              isLoading={isVerifying}
                              disabled={isVerifying || isLoading}
                            >
                              {aprenderSaved ? (
                                <LogOut className="w-3.5 h-3.5 stroke-[2.5]" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                              )}
                              <span>
                                {isVerifying
                                  ? "Validando conexão..."
                                  : aprenderSaved
                                    ? "Desconectar do Aprender 3"
                                    : "Conectar Aprender 3"}
                              </span>
                            </Button>
                          </div>
                        </form>
                      )}

                      {p.id === "teams" && (
                        <>
                          {isMobileDevice() ? (
                            <div className="p-3 bg-pastel-yellow text-black border-2 border-ink rounded-lg text-xs font-semibold leading-relaxed flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-ink-warning stroke-[2.5] shrink-0 mt-0.5" />
                              <span>
                                A integração com o Microsoft Teams requer
                                suporte a múltiplas janelas de autenticação
                                institucional e está disponível exclusivamente
                                na versão Desktop do Saruê UnB.
                              </span>
                            </div>
                          ) : (
                            <p className="text-xs font-medium text-neutral-600 leading-relaxed">
                              Uma janela do Teams será aberta com uma barra de
                              controle no topo. Entre com seu e-mail
                              institucional (@aluno.unb.br ou @unb.br) pela
                              opção{" "}
                              <strong className="font-bold text-black">
                                &quot;Usar minha senha&quot;
                              </strong>{" "}
                              (chave de segurança e biometria não são suportadas
                              na janela integrada), confirme o 2FA e clique em{" "}
                              <strong className="font-bold text-black">
                                &quot;Concluir Login&quot;
                              </strong>{" "}
                              assim que suas turmas carregarem.
                            </p>
                          )}
                          {teamsConnected &&
                          (teamsSuccessMsg || allCredentials.teams?.email) ? (
                            <div className="p-3 bg-pastel-green text-black border-2 border-ink rounded-lg text-xs font-bold flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-ink-success stroke-[2.5] shrink-0" />
                              <span>
                                {teamsSuccessMsg ||
                                  (allCredentials.teams?.email
                                    ? `Conectado (${allCredentials.teams.email})`
                                    : "Microsoft Teams conectado com sucesso!")}
                              </span>
                            </div>
                          ) : null}
                          <div className="flex justify-end pt-1">
                            <Button
                              variant={
                                teamsConnected ? "destructive" : "default"
                              }
                              size="md"
                              isLoading={isVerifying}
                              disabled={
                                isLoading || isVerifying || isMobileDevice()
                              }
                              onClick={handleToggleTeams}
                            >
                              <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>
                                {isMobileDevice()
                                  ? "Exclusivo para Desktop"
                                  : isVerifying
                                    ? "Aguardando login no Teams..."
                                    : teamsConnected
                                      ? "Desconectar Microsoft Teams"
                                      : "Acessar Microsoft Teams"}
                              </span>
                            </Button>
                          </div>
                        </>
                      )}

                      {/* Erro do formulário ativo ou erro global de credenciais */}
                      {formError || error ? (
                        <div
                          role="alert"
                          className="p-3 bg-pastel-red border-2 border-ink rounded-lg flex items-start gap-2.5 overflow-hidden"
                        >
                          <span className="p-1 bg-paper border-2 border-ink rounded-md shadow-[1px_1px_0px_0px_var(--neo-shadow)] shrink-0">
                            <AlertCircle className="w-3.5 h-3.5 text-ink-error stroke-[3]" />
                          </span>
                          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-xs font-bold text-ink-error leading-relaxed pt-0.5">
                            {formError || error}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Diálogo: desconectar o SIGAA derruba todas as contas — SIGAA é essencial */}
      <Dialog
        open={isSigaaDisconnectDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isDisconnectingAll) {
            setIsSigaaDisconnectDialogOpen(false);
          }
        }}
      >
        <DialogContent
          showCloseButton={!isDisconnectingAll}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-lg bg-neo-danger text-white border-2 border-ink flex items-center justify-center shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
                <LogOut className="w-5 h-5 stroke-[2.5]" />
              </div>
              <DialogTitle>Desconectar do SIGAA?</DialogTitle>
            </div>
            <DialogDescription>
              O SIGAA é essencial para o funcionamento do agregador: alimenta o
              feed, o histórico escolar e o fluxo curricular. Ao desconectá-lo,
              o Aprender 3 e o Microsoft Teams também serão desconectados e
              todas as contas voltarão ao estado bloqueado até uma nova conexão.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={isDisconnectingAll}
              onClick={() => setIsSigaaDisconnectDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="md"
              isLoading={isDisconnectingAll}
              onClick={handleConfirmSigaaDisconnect}
            >
              <LogOut className="w-4 h-4 stroke-[2.5]" />
              <span>Desconectar Tudo</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: aviso ao conectar SIGAA quando já existe histórico importado via PDF */}
      <Dialog
        open={isReplaceTranscriptDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isVerifying) {
            setIsReplaceTranscriptDialogOpen(false);
          }
        }}
      >
        <DialogContent
          showCloseButton={!isVerifying}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-lg bg-neo-yellow text-ink border-2 border-ink flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 stroke-[2.5]" />
              </div>
              <DialogTitle>Substituir histórico importado?</DialogTitle>
            </div>
            <DialogDescription>
              Você já possui um histórico escolar importado via PDF neste
              dispositivo. Ao conectar sua conta do SIGAA, os dados acadêmicos
              serão substituídos pelo histórico oficial sincronizado da sua
              conta.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={isVerifying}
              onClick={() => setIsReplaceTranscriptDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="md"
              isLoading={isVerifying}
              onClick={() => void executeConnectSigaa(true)}
            >
              <span>Conectar e substituir</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
