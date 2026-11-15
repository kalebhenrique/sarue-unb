import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "./button";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  /** Chamado no "Voltar": o pai navega para fora da tela quebrada. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private retryButtonRef = React.createRef<HTMLButtonElement>();

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Erro capturado:", error, errorInfo);
  }

  componentDidUpdate(
    _prevProps: ErrorBoundaryProps,
    prevState: ErrorBoundaryState
  ) {
    // O foco se perde quando os children quebrados desmontam: trazê-lo
    // para a ação principal (leitores de tela anunciam o role="alert").
    if (!prevState.hasError && this.state.hasError) {
      this.retryButtonRef.current?.focus();
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleBack = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const canGoBack = Boolean(this.props.onReset);
      return (
        <div
          role="alert"
          className="flex-1 flex items-center justify-center p-6 min-h-[300px]"
        >
          <div className="max-w-md w-full bg-paper border-2 border-ink rounded-xl p-8 text-center shadow-neo-sm md:shadow-neo">
            <div className="relative mx-auto mb-4 flex items-center justify-center">
              <img
                src="/sarue-doubt.png"
                alt=""
                className="w-36 h-36 md:w-44 md:h-44 object-contain select-none pointer-events-none"
              />
            </div>
            <h3 className="text-base font-black text-black mb-1.5">
              {this.props.fallbackTitle || "Ocorreu um erro nesta tela"}
            </h3>
            <p className="text-xs font-bold text-neutral-600 max-w-md mx-auto leading-relaxed">
              {this.props.fallbackDescription ||
                (canGoBack
                  ? "Seus dados permanecem intactos. Tente carregar a tela de novo ou volte para outra área do app."
                  : "Seus dados permanecem intactos. Tente carregar a tela de novo.")}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button
                ref={this.retryButtonRef}
                variant="primary"
                size="md"
                onClick={this.handleRetry}
                className="gap-1.5"
              >
                <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                Tentar de novo
              </Button>
              {canGoBack && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={this.handleBack}
                  className="gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
                  Voltar
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
