import React from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "motion/react";
import { cn } from "@/lib/utils";

export interface BottomSheetProps
  extends Omit<
    React.ComponentPropsWithoutRef<"div">,
    | "onDrag"
    | "onDragStart"
    | "onDragEnd"
    | "onAnimationStart"
    | "onAnimationComplete"
    | "onUpdate"
  > {
  /** Controla abertura/fechamento (animado via AnimatePresence) */
  open: boolean;
  /** Chamado ao arrastar para baixo além dos limites ou ao clicar no backdrop */
  onClose: () => void;
  /** Conteúdo do sheet (sem a alça) */
  children: React.ReactNode;
  /** Exibe a alça de arrasto no topo. Padrão: true */
  showHandle?: boolean;
  /**
   * Restringe o gesto de arrastar à alça. Use quando o conteúdo do sheet é
   * rolável (ex.: listas), para não sequestrar o scroll vertical.
   * Padrão: false (o sheet inteiro é arrastável)
   */
  dragOnlyOnHandle?: boolean;
  /** Exibe backdrop escurecido atrás do sheet; clique nele chama onClose. Padrão: false */
  backdrop?: boolean;
  /** Distância (px) arrastada para baixo que fecha o sheet. Padrão: 60 */
  closeDistance?: number;
  /** Velocidade vertical (px/s) que fecha o sheet. Padrão: 300 */
  closeVelocity?: number;
  /** Classes extras aplicadas ao container do sheet */
  className?: string;
  /** Classes extras aplicadas à alça de arrasto */
  handleClassName?: string;
  /** Classes extras aplicadas ao backdrop (ex.: md:hidden, z-*) */
  backdropClassName?: string;
  /** Chamado após a conclusão da animação de saída (AnimatePresence onExitComplete) */
  onExitComplete?: () => void;
  /** Renderiza via Portal em document.body (útil para sheets fixos acima de tapbars). Padrão: false */
  portal?: boolean;
}

/**
 * Bottom sheet arrastável para baixo (drag-to-dismiss), animado em altura,
 * com backdrop opcional. Responsabilidade do consumidor: posicionamento
 * (ex.: fixed bottom-0) e conteúdo interativo.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  children,
  showHandle = true,
  dragOnlyOnHandle = false,
  backdrop = false,
  closeDistance = 60,
  closeVelocity = 300,
  className,
  handleClassName,
  backdropClassName,
  onExitComplete,
  portal = false,
  ...rest
}) => {
  const shouldReduceMotion = useReducedMotion();
  const dragControls = useDragControls();

  const content = (
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && backdrop && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          aria-hidden="true"
          className={cn(
            "fixed inset-0 z-30 bg-ink/10 backdrop-blur-xs",
            backdropClassName
          )}
        />
      )}
      {open && (
        <motion.div
          key="sheet"
          drag="y"
          dragListener={!dragOnlyOnHandle}
          dragControls={dragOnlyOnHandle ? dragControls : undefined}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.65 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > closeDistance || info.velocity.y > closeVelocity) {
              onClose();
            }
          }}
          initial={
            shouldReduceMotion
              ? { opacity: 0 }
              : { y: "100%", opacity: 0 }
          }
          animate={{ y: 0, opacity: 1 }}
          exit={
            shouldReduceMotion
              ? { opacity: 0 }
              : { y: "100%", opacity: 0 }
          }
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: "transform" }}
          className={cn(
            "overflow-hidden bg-paper border-t-2 border-ink rounded-t-2xl select-none",
            dragOnlyOnHandle ? "touch-pan-y" : "touch-pan-x",
            className
          )}
          {...rest}
        >
          {showHandle && (
            <div
              onPointerDown={
                dragOnlyOnHandle ? (event) => dragControls.start(event) : undefined
              }
              className={cn(
                "w-full pt-2.5 pb-2.5 flex justify-center cursor-grab active:cursor-grabbing",
                dragOnlyOnHandle && "touch-none",
                handleClassName
              )}
            >
              <div className="w-10 h-1.5 rounded-full bg-neutral-400" />
            </div>
          )}
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (portal) {
    return typeof document !== "undefined"
      ? createPortal(content, document.body)
      : null;
  }

  return content;
};
