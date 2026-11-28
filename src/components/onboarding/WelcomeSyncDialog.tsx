import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Compass } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";

export interface WelcomeSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Plataformas de fato conectadas, na ordem do cofre (SIGAA, Aprender 3, Teams) */
  platforms: string[];
  /** Origem da entrada no app: login com contas, histórico PDF ou exploração sem login */
  mode?: "credentials" | "transcript" | "explore";
  /** Indica se a sincronização ainda está em andamento ao abrir o dialog */
  isSyncing?: boolean;
  /** Indica se alguma etapa falhou durante a pré-sincronização */
  hasSyncError?: boolean;
}

/** Adesivo por plataforma (identidade fixa): cheio nos dois temas, tinta
 * de texto fixa — no escuro as tintas ficam nas versões vivas do .dark. */
const PLATFORM_STICKER_BG: Record<string, string> = {
  SIGAA: "bg-platform-sigaa text-ink",
  "Aprender 3": "bg-platform-aprender3 text-ink",
  "Microsoft Teams": "bg-platform-teams text-white",
  "Histórico PDF": "bg-neo-green text-ink",
  "Modo sem login": "bg-neo-yellow text-ink",
};

/**
 * Boas-vindas do primeiro cadastro: celebra a conexão com adesivos das
 * plataformas conectadas (ou do histórico PDF importado), avisa o próximo
 * passo e entrega o usuário ao app.
 */
export const WelcomeSyncDialog: React.FC<WelcomeSyncDialogProps> = ({
  open,
  onOpenChange,
  platforms,
  mode = "credentials",
  isSyncing = true,
  hasSyncError = false,
}) => {
  const reduced = useReducedMotion();
  const springy = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 20 };

  const badges =
    mode === "transcript"
      ? ["Histórico PDF"]
      : mode === "explore"
        ? ["Modo sem login"]
        : platforms;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader className="items-center text-center">
          {/* Mascote Saruê acenando com adesivos festivos */}
          <div
            className="relative mx-auto flex items-center justify-center"
            aria-hidden
          >
            <motion.div
              initial={
                reduced ? false : { scale: 0.4, rotate: -10, opacity: 0 }
              }
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={springy}
            >
              <img
                src="/sarue-hi.png"
                alt="Mascote Saruê acenando"
                className="size-48 md:size-56 object-contain select-none pointer-events-none"
              />
            </motion.div>
          </div>
          <DialogTitle className="text-2xl font-black">
            Bem-vindo ao Saruê UnB!
          </DialogTitle>

          {/* Adesivos das plataformas conectadas, histórico importado ou modo sem login */}
          <div
            className="flex flex-wrap justify-center gap-2 pt-1"
            aria-label={
              mode === "transcript"
                ? "Histórico importado em PDF"
                : mode === "explore"
                  ? "Entrou sem login"
                  : `Plataformas conectadas: ${platforms.join(", ")}`
            }
          >
            {badges.map((name, i) => (
              <motion.span
                key={name}
                initial={reduced ? false : { scale: 0, y: 8, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { ...springy, delay: 0.3 + i * 0.08 }
                }
                className={`px-3 py-1 ${
                  PLATFORM_STICKER_BG[name] ?? "bg-paper text-black"
                } font-bold text-xs border-2 border-ink rounded-full shadow-[2px_2px_0px_0px_var(--neo-shadow)] inline-flex items-center gap-1.5`}
              >
                {mode === "explore" ? (
                  <Compass
                    className="w-3.5 h-3.5 stroke-[2.5] shrink-0"
                    aria-hidden
                  />
                ) : (
                  <CheckCircle2
                    className="w-3.5 h-3.5 stroke-[2.5] shrink-0"
                    aria-hidden
                  />
                )}
                {name}
              </motion.span>
            ))}
          </div>

          <DialogDescription className="text-sm font-medium text-neutral-600 leading-relaxed pt-1">
            {mode === "transcript"
              ? "Seu histórico escolar foi importado! Você já pode explorar o Meu Curso, o Fluxograma, a Calculadora de IRA e o Monte sua Grade. Quando quiser receber avisos e prazos, conecte suas contas em Configurações."
              : mode === "explore"
                ? "Você entrou sem conectar uma conta. Já dá para explorar o Cardápio do RU, Docentes, Calendário, Monte sua Grade e simular cursos no Meu Curso. Quando quiser sincronizar avisos, prazos ou importar seu histórico, é só acessar Configurações."
                : isSyncing
                  ? "Estamos sincronizando suas plataformas agora — isso pode levar um tempo. Enquanto isso, fique à vontade para explorar o app."
                  : hasSyncError
                    ? "Não foi possível concluir a sincronização de todas as plataformas. Você pode tentar novamente pelo botão Sincronizar."
                    : "Suas plataformas já foram sincronizadas! Fique à vontade para explorar o app."}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center">
          <Button
            type="button"
            size="md"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto sm:min-w-32"
          >
            <span>Okay</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
