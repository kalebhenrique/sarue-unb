import React from "react";

export interface EmptyStateProps {
  /** Título curto em negrito. */
  title: string;
  /** Texto de apoio: explica o estado e aponta o próximo passo. */
  description?: React.ReactNode;
  /** Ação opcional exibida abaixo da descrição (ex: botão). */
  action?: React.ReactNode;
  /** Classes extras no container (ex: margens externas). */
  className?: string;
  /** Se o mascote Saruê em dúvida deve ser exibido. Padrão: true. */
  showMascot?: boolean;
  /** Caminho da imagem do mascote. Padrão: /sarue-doubt.png. */
  mascotSrc?: string;
}

/**
 * Estado vazio padronizado do mural (@DESIGN.md): card branco com borda
 * preta, sombra dura e o mascote Saruê em dúvida como ilustração.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  className = "",
  showMascot = true,
  mascotSrc = "/sarue-doubt.png",
}) => {
  return (
    <div
      className={`bg-paper border-2 border-ink rounded-xl p-8 text-center shadow-neo-sm md:shadow-neo ${className}`}
    >
      {showMascot ? (
        <div className="relative mx-auto mb-4 flex items-center justify-center">
          <img
            src={mascotSrc}
            alt="Mascote Saruê em dúvida"
            className="w-36 h-36 md:w-44 md:h-44 object-contain select-none pointer-events-none"
          />
        </div>
      ) : null}

      <h3 className="text-base font-black text-black mb-1.5">{title}</h3>

      {description ? (
        <p className="text-xs font-bold text-neutral-600 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
};
