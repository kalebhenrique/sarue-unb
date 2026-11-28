import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileUp,
  Moon,
  Plus,
  Star,
  Sun,
  Triangle,
} from "lucide-react";
import {
  Button,
  Switch,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import { useTheme } from "../context/ThemeContext";
import { CredentialsStep } from "@/components/onboarding/CredentialsStep";
import { TranscriptImportDropzone } from "@/components/onboarding/TranscriptImportDropzone";
import type { StudentAcademicProfile } from "@/core";

export interface OnboardingScreenProps {
  onComplete: () => void;
  onCompleteWithTranscript: () => void;
  onExplore: () => void;
}

type Step2View = "credentials" | "transcript";

const TOTAL_STEPS = 2;

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  onComplete,
  onCompleteWithTranscript,
  onExplore,
}) => {
  const [step, setStep] = useState(1);
  const [step2View, setStep2View] = useState<Step2View>("credentials");
  const { resolvedTheme, setThemeMode } = useTheme();
  const reduced = useReducedMotion();
  const finishRef = useRef<() => void | Promise<void>>(() => {});
  const [credState, setCredState] = useState({ connected: false, busy: false });
  const [importedProfile, setImportedProfile] =
    useState<StudentAcademicProfile | null>(null);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [isEntering, setIsEntering] = useState(false);

  // Foco no CTA primário ao entrar no passo 1 para avançar com Enter
  const ctaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (step === 1) ctaRef.current?.focus();
  }, [step]);

  const springy = reduced
    ? { type: "tween" as const, duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 26 };

  const panelVariants: Variants = {
    enter: { opacity: 0, y: 18, scale: 1.05, rotate: 1.5 },
    center: {
      opacity: 1,
      y: 0,
      scale: 1,
      rotate: 0,
      transition: { ...springy, staggerChildren: 0.07, delayChildren: 0.05 },
    },
    exit: {
      opacity: 0,
      y: -12,
      scale: 0.95,
      rotate: -1.5,
      transition: { duration: reduced ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const itemVariants: Variants = {
    enter: { opacity: 0, y: 12, scale: 0.96 },
    center: { opacity: 1, y: 0, scale: 1, transition: springy },
    exit: { opacity: 0, transition: { duration: reduced ? 0 : 0.1 } },
  };

  const goToConnect = () => {
    setStep2View("credentials");
    setStep(2);
  };

  const handleBack = () => {
    if (step === 2 && step2View === "transcript") {
      setStep2View("credentials");
      return;
    }
    setStep(1);
  };

  return (
    <div className="h-dvh overflow-hidden md:h-auto md:overflow-visible md:min-h-full bg-canvas bg-grid flex flex-col">
      {/* Chrome do wizard: mini logo à esquerda (passo 2), 2 bolinhas ao centro, tema à direita */}
      <div className="w-full max-w-2xl mx-auto px-5 md:px-6 pt-[max(1rem,env(safe-area-inset-top))] md:pt-6 flex items-center justify-between gap-4 shrink-0">
        <div className="flex-1 flex items-center">
          <AnimatePresence>
            {step >= 2 && (
              <motion.div
                key="header-logo"
                initial={reduced ? false : { opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, scale: 0.75 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 360, damping: 24 }
                }
                className="flex items-center gap-2"
              >
                <img
                  src="/sarue-logo.png"
                  alt="Saruê UnB"
                  className="size-8 object-cover border-1 border-ink rounded-lg shadow-[1px_1px_0px_0px_var(--neo-shadow)] select-none pointer-events-none"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Indicador de progresso: 2 bolinhas-adesivo */}
        <div
          className="flex items-center gap-2.5"
          role="group"
          aria-label={`Passo ${step} de ${TOTAL_STEPS}`}
        >
          {[1, 2].map((n) => {
            const state = n < step ? "done" : n === step ? "active" : "todo";
            return (
              <motion.span
                key={n}
                aria-hidden
                animate={state === "active" ? { scale: 1.3 } : { scale: 1 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 400, damping: 20 }
                }
                className={`inline-block w-3 h-3 rounded-full border-2 border-ink ${n <= step ? "bg-neo-blue" : "bg-paper dark:bg-neutral-300"}`}
              />
            );
          })}
        </div>

        <div className="flex-1 flex items-center justify-end">
          {/* Preferência de ambiente: canto superior direito */}
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger
                aria-label="Ativar modo claro"
                onClick={() => setThemeMode("light")}
                className={`cursor-pointer p-1 rounded-md transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue ${
                  resolvedTheme === "light"
                    ? "text-black"
                    : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                <Sun className="w-3.5 h-3.5 stroke-[2.5]" />
              </TooltipTrigger>
              <TooltipContent>Modo claro</TooltipContent>
            </Tooltip>
            <Switch
              checked={resolvedTheme === "dark"}
              onCheckedChange={(checked) =>
                setThemeMode(checked ? "dark" : "light")
              }
              aria-label="Alternar modo claro e escuro"
              className="shrink-0"
            />
            <Tooltip>
              <TooltipTrigger
                aria-label="Ativar modo escuro"
                onClick={() => setThemeMode("dark")}
                className={`cursor-pointer p-1 rounded-md transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue ${
                  resolvedTheme === "dark"
                    ? "text-black"
                    : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                <Moon className="w-3.5 h-3.5 stroke-[2.5]" />
              </TooltipTrigger>
              <TooltipContent>Modo escuro</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Conteúdo do passo */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden md:overflow-visible scroll-pb-20 flex px-5 py-4 md:px-6 md:py-8">
        <div className="w-full max-w-2xl relative m-auto">
          <AnimatePresence mode="wait">
            {/* PASSO 1: BEM-VINDO */}
            {step === 1 && (
              <motion.div
                key="s1"
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {/* Adesivos decorativos */}
                <motion.div
                  className="absolute -top-2 -left-2 z-10 pointer-events-none"
                  initial={{ scale: 0, rotate: -12, opacity: 0 }}
                  animate={{ scale: 1, rotate: -8, opacity: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 260,
                          damping: 12,
                          delay: 0.45,
                        }
                  }
                  aria-hidden
                >
                  <Star className="w-7 h-7 fill-neo-yellow text-black dark:text-white stroke-[2.5]" />
                </motion.div>
                <motion.div
                  className="absolute -top-3 right-8 z-10 pointer-events-none"
                  initial={{ scale: 0, rotate: 10, opacity: 0 }}
                  animate={{ scale: 1, rotate: 6, opacity: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 260,
                          damping: 12,
                          delay: 0.55,
                        }
                  }
                  aria-hidden
                >
                  <div className="w-5 h-5 rounded-full bg-neo-coral border-2 border-ink dark:border-white shadow-[2px_2px_0px_0px_var(--neo-shadow)]" />
                </motion.div>
                <motion.div
                  className="absolute top-[16%] -left-4 z-10 pointer-events-none"
                  initial={{ scale: 0, rotate: 14, opacity: 0 }}
                  animate={{ scale: 1, rotate: 8, opacity: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 260,
                          damping: 12,
                          delay: 0.62,
                        }
                  }
                  aria-hidden
                >
                  <Triangle className="w-6 h-6 fill-platform-teams text-black dark:text-white stroke-[2.5]" />
                </motion.div>
                <motion.div
                  className="absolute top-[24%] -right-5 z-10 pointer-events-none"
                  initial={{ scale: 0, rotate: -20, opacity: 0 }}
                  animate={{ scale: 1, rotate: -12, opacity: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 260,
                          damping: 12,
                          delay: 0.69,
                        }
                  }
                  aria-hidden
                >
                  <Plus className="w-6 h-6 text-neo-purple dark:text-white stroke-[3]" />
                </motion.div>
                <motion.div
                  className="absolute bottom-[8%] left-[12%] z-10 pointer-events-none"
                  initial={{ scale: 0, rotate: 12, opacity: 0 }}
                  animate={{ scale: 1, rotate: 45, opacity: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 260,
                          damping: 12,
                          delay: 0.76,
                        }
                  }
                  aria-hidden
                >
                  <div className="w-4 h-4 bg-neo-green border-2 border-ink dark:border-white shadow-[2px_2px_0px_0px_var(--neo-shadow)]" />
                </motion.div>
                <motion.div
                  className="absolute bottom-[14%] right-[10%] z-10 pointer-events-none"
                  initial={{ scale: 0, rotate: -10, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 260,
                          damping: 12,
                          delay: 0.83,
                        }
                  }
                  aria-hidden
                >
                  <Circle className="w-5 h-5 text-black dark:text-white stroke-[3]" />
                </motion.div>

                {/* Hero */}
                <motion.div
                  variants={itemVariants}
                  className="text-center space-y-3 relative"
                >
                  <motion.div
                    initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 260, damping: 12 }
                    }
                    className="flex justify-center"
                  >
                    <img
                      src="/sarue-logo.png"
                      alt="Saruê UnB"
                      className="w-20 h-20 md:w-24 md:h-24 object-cover border-2 border-ink rounded-2xl shadow-neo-sm md:shadow-(--neo-card-shadow) select-none pointer-events-none"
                    />
                  </motion.div>
                  <h1 className="text-4xl md:text-5xl font-black text-black tracking-tight">
                    Saruê <span className="text-unb-blue">UnB</span>
                  </h1>
                  <p className="text-base md:text-lg font-medium text-neutral-700 max-w-lg mx-auto text-pretty">
                    Todas as suas plataformas acadêmicas reunidas em um único
                    feed integrado, seguro e rápido no seu dispositivo.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <span className="px-3 py-1 bg-platform-sigaa text-ink font-bold text-xs border-2 border-ink rounded-full shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
                      Sigaa
                    </span>
                    <span className="px-3 py-1 bg-platform-aprender3 text-ink font-bold text-xs border-2 border-ink rounded-full shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
                      Aprender 3
                    </span>
                    <span className="px-3 py-1 bg-platform-teams text-white font-bold text-xs border-2 border-ink rounded-full shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
                      Microsoft Teams (Beta)
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* PASSO 2A: CONECTAR PLATAFORMAS (COM SAÍDA COMPACTA PARA PDF OFFLINE) */}
            {step === 2 && step2View === "credentials" && (
              <motion.div
                key="s2-credentials"
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <motion.div variants={itemVariants}>
                  <CredentialsStep
                    onSuccess={onComplete}
                    registerFinish={(fn) => {
                      finishRef.current = fn;
                    }}
                    onActiveChange={setCredState}
                  />
                </motion.div>

                {!credState.connected && (
                  <motion.div variants={itemVariants}>
                    <div
                      className="flex items-center gap-3 my-3.5"
                      aria-hidden="true"
                    >
                      <span className="flex-1 h-0.5 bg-black/10" />
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500">
                        ou
                      </span>
                      <span className="flex-1 h-0.5 bg-black/10" />
                    </div>

                    <button
                      type="button"
                      disabled={credState.busy}
                      onClick={() => setStep2View("transcript")}
                      className="cursor-pointer w-full min-h-[56px] flex items-center justify-between gap-3 rounded-lg border-2 border-ink bg-paper px-3.5 py-2.5 text-left shadow-neo-sm transition-[transform,box-shadow,background-color] duration-150 ease-out hover:bg-neutral-50 dark:hover:bg-neutral-100 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_var(--neo-shadow)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-lg border-2 border-ink bg-neo-yellow text-ink flex items-center justify-center shrink-0"
                          aria-hidden="true"
                        >
                          <FileUp className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs sm:text-sm font-black text-black block leading-tight">
                            Prefere não conectar agora?
                          </span>
                          <span className="text-xs font-medium text-neutral-600 block leading-snug mt-0.5">
                            Usar no modo offline importando o PDF do histórico
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className="w-4 h-4 stroke-[2.5] text-neutral-500 shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* PASSO 2B: MODO OFFLINE — IMPORTAR HISTÓRICO PDF */}
            {step === 2 && step2View === "transcript" && (
              <motion.div
                key="s2-transcript"
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <motion.div variants={itemVariants} className="mb-4">
                  <h2 className="text-2xl font-black tracking-tight text-black">
                    Importe seu histórico do SIGAA
                  </h2>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <TranscriptImportDropzone
                    variant="onboarding"
                    initialProfile={importedProfile}
                    onBusyChange={setIsImportingPdf}
                    onImported={({ profile }) => setImportedProfile(profile)}
                  />
                </motion.div>

                {!importedProfile && (
                  <motion.div
                    variants={itemVariants}
                    className="mt-3 text-center"
                  >
                    <button
                      type="button"
                      disabled={isImportingPdf}
                      onClick={onExplore}
                      className="cursor-pointer inline-flex items-center justify-center min-h-11 px-3 text-xs sm:text-sm font-bold underline decoration-2 underline-offset-4 text-neutral-600 hover:text-black transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue rounded-md disabled:opacity-50"
                    >
                      Continuar sem importar (fazer depois)
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer do wizard: fixo no rodapé no mobile; Voltar à esquerda e CTA à direita */}
      <div className="shrink-0 w-full border-t-2 border-ink bg-paper px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:border-t-0 md:bg-transparent md:px-6 md:pt-0 md:pb-8">
        <div className="w-full max-w-2xl mx-auto flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button
              variant="ghost"
              size="md"
              onClick={handleBack}
              className="text-neutral-700 hover:text-black"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
              Voltar
            </Button>
          ) : (
            <span />
          )}

          {step === 1 && (
            <Button ref={ctaRef} size="md" onClick={goToConnect}>
              <span>Começar</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </Button>
          )}

          {step === 2 && step2View === "credentials" && (
            <Button
              size="md"
              disabled={!credState.connected || credState.busy}
              isLoading={isEntering}
              onClick={async () => {
                setIsEntering(true);
                try {
                  await finishRef.current();
                } finally {
                  setIsEntering(false);
                }
              }}
            >
              <span>Entrar no Saruê</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </Button>
          )}

          {step === 2 && step2View === "transcript" && (
            <Button
              size="md"
              disabled={!importedProfile || isImportingPdf}
              onClick={onCompleteWithTranscript}
            >
              <span>Entrar no Saruê</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
