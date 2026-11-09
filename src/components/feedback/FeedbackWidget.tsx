import * as React from "react";
import {
  Bug,
  CircleCheck,
  ExternalLink,
  Lightbulb,
  Megaphone,
  X,
} from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FeedbackError,
  detectOs,
  getAppVersion,
  submitFeedback,
  type FeedbackDeviceData,
  type FeedbackKind,
} from "@/lib/feedback";
import { cn, openExternalUrl } from "@/lib/utils";

const MINIMAP_TITLE = "Minimapa — clique para navegar";

interface FeedbackWidgetProps {
  /** Nome em pt-BR da tela atual (vai nos dados opt-in de dispositivo). */
  screen: string;
}

/**
 * Feedback flutuante: adesivo de ação fixo no canto inferior direito do
 * conteúdo, com popup de envio ancorado acima (padrão Sentry no mundo
 * adesivo). O envio cria uma issue no repositório via endpoint do site —
 * o app nunca vê credencial do GitHub.
 */
export const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({ screen }) => {
  const [open, setOpen] = React.useState(false);

  // Rascunho vive no widget (sempre montado): fechar o popup não perde texto.
  // Primeira opção por padrão: o popup abre com "Feedback" escolhido.
  const [kind, setKind] = React.useState<FeedbackKind>("feedback");
  const [description, setDescription] = React.useState("");
  const [includeDeviceData, setIncludeDeviceData] = React.useState(false);
  const [status, setStatus] = React.useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [issue, setIssue] = React.useState<{
    issueUrl: string;
    issueNumber: number;
  } | null>(null);

  // Regra de convivência com o Fluxograma: quando o minimapa chega perto do
  // canto (janela curta ou canvas rolado), o adesivo sobe e ancora acima dele.
  const [liftBottom, setLiftBottom] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (screen !== "Meu Curso") {
      setLiftBottom(null);
      return;
    }
    const check = () => {
      const minimap = document.querySelector(`[title="${MINIMAP_TITLE}"]`);
      if (!minimap) {
        setLiftBottom(null);
        return;
      }
      const rect = minimap.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 72) {
        setLiftBottom(Math.max(16, window.innerHeight - rect.top + 12));
      } else {
        setLiftBottom(null);
      }
    };
    check();
    window.addEventListener("scroll", check, true);
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check, true);
      window.removeEventListener("resize", check);
    };
  }, [screen]);

  const resetForm = () => {
    setKind("feedback");
    setDescription("");
    setIncludeDeviceData(false);
    setStatus("idle");
    setErrorMessage(null);
    setIssue(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Sucesso consumido: o popup reabre limpo.
    if (!next && status === "success") resetForm();
  };

  const canSend =
    description.trim().length > 0 && status !== "sending";

  const handleSend = async () => {
    if (!canSend) return;
    setStatus("sending");
    setErrorMessage(null);
    let device: FeedbackDeviceData | undefined;
    if (includeDeviceData) {
      device = {
        sistema: detectOs(),
        versaoApp: await getAppVersion(),
        tela: screen,
      };
    }
    try {
      const result = await submitFeedback({
        kind,
        description: description.trim(),
        device,
      });
      setIssue(result);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof FeedbackError
          ? error.userMessage
          : "Não deu para enviar agora. Tente de novo em instantes.",
      );
    }
  };

  return (
    <>
      {/* Adesivo de ação flutuante (gatilho) */}
      <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverPrimitive.Trigger
                type="button"
                aria-label="Enviar feedback"
                style={{ bottom: liftBottom ?? 16 }}
                className={cn(
                  "cursor-pointer fixed right-4 z-40 flex h-10 w-10 items-center justify-center select-none",
                  "rounded-xl border-2 border-ink bg-paper dark:bg-btn-raise text-black",
                  "shadow-[2px_2px_0px_0px_var(--neo-shadow)]",
                  "hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-neutral-100 hover:shadow-[1px_1px_0px_0px_var(--neo-shadow)]",
                  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2",
                  "disabled:opacity-50",
                  "transition-[bottom,transform,box-shadow,background-color] duration-150 ease-out",
                )}
              >
                <Megaphone className="h-5 w-5 stroke-[2.5]" />
              </PopoverPrimitive.Trigger>
            }
          />
          <TooltipContent>Enviar feedback</TooltipContent>
        </Tooltip>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            side="top"
            align="end"
            sideOffset={10}
            className="z-40"
          >
            <PopoverPrimitive.Popup
              aria-label="Formulário de feedback"
              className="w-[360px] max-h-[min(600px,calc(100vh-96px))] overflow-y-auto rounded-lg border-2 border-ink bg-canvas text-black outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
            >
              {status === "success" && issue ? (
                /* Estado de sucesso: feedback virou issue */
                <div className="flex flex-col items-center gap-3 p-6 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-ink bg-pastel-green shadow-[1px_1px_0px_0px_var(--neo-shadow)]">
                    <CircleCheck className="h-6 w-6 stroke-[2.5] text-ink-success" />
                  </span>
                  <p className="text-sm font-extrabold tracking-tight">
                    Feedback enviado!
                  </p>
                  <p className="max-w-[260px] text-xs font-semibold text-neutral-600">
                    Obrigado! Sua mensagem virou a issue nº {issue.issueNumber}{" "}
                    no repositório do projeto.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openExternalUrl(issue.issueUrl)}
                  >
                    Ver issue no GitHub
                    <ExternalLink className="h-3.5 w-3.5 stroke-[2.5]" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-4 p-4">
                  {/* Cabeçalho */}
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold tracking-tight">
                      Enviar feedback
                    </h2>
                    <button
                      type="button"
                      aria-label="Fechar feedback"
                      onClick={() => handleOpenChange(false)}
                      className="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg text-black transition-colors duration-150 hover:bg-black/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2"
                    >
                      <X className="h-4 w-4 stroke-[2.5]" />
                    </button>
                  </div>

                  {/* Tipo: escolha obrigatória, sem default */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-neutral-800">
                      O que é?
                    </span>
                    <SegmentedControl
                      options={[
                        {
                          value: "feedback",
                          label: (
                            <>
                              <Lightbulb className="h-3.5 w-3.5 stroke-[2.5]" />
                              Feedback
                            </>
                          ),
                        },
                        {
                          value: "bug",
                          label: (
                            <>
                              <Bug className="h-3.5 w-3.5 stroke-[2.5]" />
                              Bug
                            </>
                          ),
                        },
                      ]}
                      value={kind}
                      onValueChange={setKind}
                      ariaLabel="Tipo de feedback"
                      className="w-full"
                    />
                  </div>

                  {/* Descrição (obrigatória) */}
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="feedback-description"
                      className="text-xs font-bold text-neutral-800"
                    >
                      Descrição
                    </label>
                    <textarea
                      id="feedback-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={4}
                      maxLength={4000}
                      placeholder="O que aconteceu? O que você esperava?"
                      className="w-full resize-y bg-paper px-3.5 py-2.5 text-sm font-medium text-black placeholder:text-neutral-500 border-2 border-ink rounded-xl focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[box-shadow,border-color] disabled:opacity-50"
                    />
                  </div>

                  {/* Dados do dispositivo (opt-in, campos declarados) */}
                  <FeedbackOption
                    checked={includeDeviceData}
                    onToggle={setIncludeDeviceData}
                    label="Incluir dados do dispositivo"
                    title="Sistema operacional, versão do app e tela atual — nada além disso."
                  >
                    <span className="text-[11px] font-semibold text-neutral-500">
                      {detectOs()} · versão do app · tela atual — nada além
                      disso
                    </span>
                  </FeedbackOption>

                  {/* Erro de envio */}
                  {status === "error" && errorMessage ? (
                    <p
                      role="alert"
                      className="text-xs font-bold text-ink-error"
                    >
                      {errorMessage}
                    </p>
                  ) : null}

                  {/* Envio */}
                  <Button
                    variant="primary"
                    onClick={() => void handleSend()}
                    disabled={!canSend}
                    isLoading={status === "sending"}
                    className="w-full"
                  >
                    Enviar feedback
                  </Button>
                </div>
              )}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  );
};

/**
 * Opção opt-in do formulário: o Checkbox do design system (seleção veste
 * Azul Caneta Ação via data-checked) dentro de um label clicável com
 * rótulo e nota de apoio — o texto todo alterna a marcação.
 */
const FeedbackOption: React.FC<{
  checked: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  title?: string;
  children?: React.ReactNode;
}> = ({ checked, onToggle, disabled, label, title, children }) => (
  <label
    title={title}
    className="flex w-full cursor-pointer items-start gap-2.5 text-left has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50"
  >
    <Checkbox
      checked={checked}
      onCheckedChange={(next) => onToggle(next === true)}
      disabled={disabled}
      aria-label={label}
      className="mt-px data-checked:bg-neo-blue data-checked:text-white"
    />
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-bold text-black">{label}</span>
      {children}
    </span>
  </label>
);
