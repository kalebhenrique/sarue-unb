import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { Moon, Sun } from "lucide-react";
import {
  Button,
  Switch,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import { useTheme } from "../context/ThemeContext";
import { CredentialsStep } from "@/components/onboarding/CredentialsStep";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Star,
  Plus,
  Circle,
  Triangle,
  Inbox,
  CalendarDays,
  BookOpen,
  Lock,
  ShieldCheck,
  GitBranch,
} from "lucide-react";

export interface OnboardingScreenProps {
  onComplete: () => void;
  onExplore: () => void;
}

const TOTAL_STEPS = 4;

type StepCard = {
  bg: string;
  /** Barra superior da categoria no escuro (placa + faixa viva). */
  bar?: string;
  /** Fundo do adesivo de ícone no escuro (sólido vivo). */
  sticker?: string;
  icon: React.ReactNode;
  title: string;
  copy: string;
};

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  onComplete,
  onExplore,
}) => {
  const [step, setStep] = useState(1);
  const { resolvedTheme, setThemeMode } = useTheme();
  const reduced = useReducedMotion();
  const finishRef = useRef<() => void | Promise<void>>(() => {});
  const [credState, setCredState] = useState({ connected: false, busy: false });
  // Loading exclusivo da ação de entrar: o busy do passo desabilita o botão,
  // mas o spinner pertence só ao clique de Entrar (validar SIGAA não é "entrar").
  const [isEntering, setIsEntering] = useState(false);

  // Foco no CTA primário ao entrar na tela e a cada passo (1–3), para o
  // usuário avançar tudo com Enter. No passo 4 o foco fica com o formulário.
  const ctaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (step < TOTAL_STEPS) ctaRef.current?.focus();
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

  const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));
  const isLast = step === TOTAL_STEPS;

  return (
    <div className="h-dvh overflow-hidden md:h-auto md:overflow-visible md:min-h-full bg-canvas bg-grid flex flex-col">
      {/* Chrome do wizard: tema, progresso, pular */}
      <div className="w-full max-w-2xl mx-auto px-5 md:px-6 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-6 flex items-center justify-between gap-4 shrink-0">
        <div className="flex-1 flex items-center gap-2.5">
          {/* Preferência de ambiente: canto superior esquerdo. Sol e lua
              nomeiam o switch; tooltip explica cada lado no hover. */}
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

        {/* Indicador de progresso: bolinhas-adesivo */}
        <div
          className="flex items-center gap-2.5"
          role="group"
          aria-label={`Passo ${step} de ${TOTAL_STEPS}`}
        >
          {[1, 2, 3, 4].map((n) => {
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

        <div className="flex-1 flex justify-end">
          {!isLast ? (
            <Button
              variant="ghost"
              size="md"
              onClick={() => setStep(TOTAL_STEPS)}
              className="text-neutral-700 hover:text-black"
            >
              Pular <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </Button>
          ) : credState.connected ? null : (
            <Button
              variant="ghost"
              size="md"
              onClick={onExplore}
              className="text-neutral-700 hover:text-black"
            >
              Explorar sem Login
            </Button>
          )}
        </div>
      </div>

      {/* Conteúdo do passo */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden md:overflow-visible flex px-5 py-5 md:px-6 md:py-8">
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
                  <p className="text-base md:text-lg font-medium text-neutral-700 max-w-lg mx-auto">
                    Todas as suas plataformas acadêmicas reunidas em um único
                    feed desktop integrado, seguro e rápido.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <span className="px-3 py-1 bg-platform-sigaa text-ink font-bold text-xs border-2 border-ink rounded-full shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
                      Sigaa
                    </span>
                    <span className="px-3 py-1 bg-platform-aprender3 text-black font-bold text-xs border-2 border-ink rounded-full shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
                      Aprender 3
                    </span>
                    <span className="px-3 py-1 bg-platform-teams text-white font-bold text-xs border-2 border-ink rounded-full shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
                      Microsoft Teams (Beta)
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* PASSO 2: FUNCIONALIDADES */}
            {step === 2 && (
              <motion.div
                key="s2"
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <motion.h2
                  variants={itemVariants}
                  className="text-3xl font-black tracking-tight text-black text-center"
                >
                  Tudo que você usa, em um lugar só
                </motion.h2>
                <motion.p
                  variants={itemVariants}
                  className="text-sm md:text-base font-medium text-neutral-600 text-center mt-2"
                >
                  Três frentes que poupam suas abas e seu tempo.
                </motion.p>
                <div className="grid md:grid-cols-3 gap-4 pt-4">
                  {STEP2_CARDS.map((c) => (
                    <motion.div
                      key={c.title}
                      variants={itemVariants}
                      className={`${c.bg} ${c.bar ?? ""} border-2 border-ink rounded-lg shadow-neo-sm md:shadow-(--neo-card-shadow) p-5 dark:bg-paper`}
                    >
                      <div className={`w-10 h-10 bg-paper ${c.sticker ?? ""} border-2 border-ink rounded-lg shadow-[2px_2px_0px_0px_var(--neo-shadow)] flex items-center justify-center mb-3`}>
                        {c.icon}
                      </div>
                      <h3 className="text-base font-bold text-black tracking-tight">
                        {c.title}
                      </h3>
                      <p className="text-sm font-medium text-neutral-700 leading-relaxed mt-1">
                        {c.copy}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* PASSO 3: SEGURANÇA */}
            {step === 3 && (
              <motion.div
                key="s3"
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <motion.h2
                  variants={itemVariants}
                  className="text-3xl font-black tracking-tight text-black text-center"
                >
                  Seus dados moram no seu computador
                </motion.h2>
                <motion.p
                  variants={itemVariants}
                  className="text-sm md:text-base font-medium text-neutral-600 text-center mt-2"
                >
                  Privacidade não é uma opção aqui — é arquitetura.
                </motion.p>
                <div className="grid md:grid-cols-3 gap-4 pt-4">
                  {STEP3_CARDS.map((c) => (
                    <motion.div
                      key={c.title}
                      variants={itemVariants}
                      className={`${c.bg} ${c.bar ?? ""} border-2 border-ink rounded-lg shadow-neo-sm md:shadow-(--neo-card-shadow) p-5 dark:bg-paper`}
                    >
                      <div className={`w-10 h-10 bg-paper ${c.sticker ?? ""} border-2 border-ink rounded-lg shadow-[2px_2px_0px_0px_var(--neo-shadow)] flex items-center justify-center mb-3`}>
                        {c.icon}
                      </div>
                      <h3 className="text-base font-bold text-black tracking-tight">
                        {c.title}
                      </h3>
                      <p className="text-sm font-medium text-neutral-700 leading-relaxed mt-1">
                        {c.copy}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* PASSO 4: LOGIN */}
            {step === 4 && (
              <motion.div
                key="s4"
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
              onClick={back}
              className="text-neutral-700 hover:text-black"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
              Voltar
            </Button>
          ) : (
            <span />
          )}
          {step < 4 ? (
            <Button ref={ctaRef} size="md" onClick={next}>
              <span>{step === 1 ? "Começar" : "Continuar"}</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </Button>
          ) : (
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
        </div>
      </div>
    </div>
  );
};

// Cards dos passos 2 e 3 (mesma anatomia, conteúdo distinto)
const STEP2_CARDS: StepCard[] = [
  {
    bg: "bg-pastel-blue",
    bar: "dark:border-t-[6px] dark:border-t-sticker-blue",
    sticker: "dark:bg-sticker-blue",
    icon: <Inbox className="w-5 h-5 text-blue-ink dark:text-ink stroke-[2.5]" />,
    title: "Feed Unificado",
    copy: "Posts e tarefas do SIGAA e do Aprender 3 num feed só, com prazo visível e marcação de concluído.",
  },
  {
    bg: "bg-pastel-yellow",
    bar: "dark:border-t-neo-yellow dark:border-t-[6px]",
    sticker: "dark:bg-neo-yellow",
    icon: (
      <CalendarDays className="w-5 h-5 text-platform-aprender3 dark:text-ink stroke-[2.5]" />
    ),
    title: "Monte sua Grade",
    copy: "Busque turmas por departamento, gere opções de horário sem conflito e salve grades por semestre.",
  },
  {
    bg: "bg-pastel-green",
    bar: "dark:border-t-neo-green dark:border-t-[6px]",
    sticker: "dark:bg-neo-green",
    icon: <BookOpen className="w-5 h-5 text-ink-success dark:text-ink stroke-[2.5]" />,
    title: "Disciplinas",
    copy: "Tudo organizado por disciplina: avisos, materiais e o que vence primeiro.",
  },
];

const STEP3_CARDS: StepCard[] = [
  {
    bg: "bg-pastel-blue",
    bar: "dark:border-t-[6px] dark:border-t-sticker-blue",
    sticker: "dark:bg-sticker-blue",
    icon: <Lock className="w-5 h-5 text-blue-ink dark:text-ink stroke-[2.5]" />,
    title: "Cofre Local Stronghold",
    copy: "Suas credenciais ficam em cofre criptografado no seu próprio computador. Nada vai para servidores nossos.",
  },
  {
    bg: "bg-pastel-green",
    bar: "dark:border-t-neo-green dark:border-t-[6px]",
    sticker: "dark:bg-neo-green",
    icon: <ShieldCheck className="w-5 h-5 text-ink-success dark:text-ink stroke-[2.5]" />,
    title: "Zero Telemetria",
    copy: "Nenhum dado de uso, clique ou métrica sai do seu computador. Tudo é processado localmente, por construção.",
  },
  {
    bg: "bg-pastel-yellow",
    bar: "dark:border-t-neo-yellow dark:border-t-[6px]",
    sticker: "dark:bg-neo-yellow",
    icon: <GitBranch className="w-5 h-5 text-blue-ink dark:text-ink stroke-[2.5]" />,
    title: "Código Aberto",
    copy: "Apache 2.0 no GitHub. Qualquer pessoa pode auditar os scrapers e o cofre, e sugerir melhorias.",
  },
];
