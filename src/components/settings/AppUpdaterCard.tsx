import React from "react";
import { Download, ExternalLink, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { isMobileDevice } from "@/lib/platform";

type UpdaterState = ReturnType<typeof useAppUpdater>;

/** Mensagem de status por estado do updater — braços disjuntos por `status`. */
const statusMessage = (updater: UpdaterState): string => {
  switch (updater.status) {
    case "checking":
      return "Consultando GitHub Releases em busca de novas versões...";
    case "downloading":
      return `Baixando atualização (${updater.progress?.percent ?? 0}%)...`;
    case "ready-to-restart":
      return "Atualização baixada com sucesso! Reinicie o aplicativo para concluir.";
    case "available":
      return isMobileDevice()
        ? `Nova versão ${updater.updateInfo?.version} disponível para download do APK!`
        : `Nova versão ${updater.updateInfo?.version} disponível para instalação!`;
    case "up-to-date":
      return "Você está utilizando a versão mais recente do Saruê UnB.";
    case "error":
      return `Não foi possível verificar atualizações: ${updater.errorMessage}`;
    case "idle":
      return "Mantenha o Saruê UnB sempre atualizado com as últimas correções e novidades.";
  }
};

export interface AppUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog de atualização disponível exibido ao tocar no botão de atualização na Home.
 * No Android (.apk) oferece download direto do APK da última Release no GitHub;
 * no Desktop permite baixar e aplicar a atualização pelo auto-updater.
 */
export const AppUpdateDialog: React.FC<AppUpdateDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const updater = useAppUpdater();
  const isMobileApk = isMobileDevice();
  const isDownloading = updater.status === "downloading";
  const downloadPct = updater.progress?.percent ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-lg bg-neo-yellow text-ink border-2 border-ink flex items-center justify-center shadow-neo-sm shrink-0">
              <Sparkles className="w-5 h-5 stroke-[2.5]" />
            </div>
            <DialogTitle>
              Nova versão {updater.updateInfo?.version} disponível!
            </DialogTitle>
          </div>
          <DialogDescription>
            Você está na versão {updater.currentVersion}.{" "}
            {isMobileApk
              ? "Baixe e instale o novo APK da última Release oficial para receber as correções e melhorias."
              : "Atualize agora para receber as últimas correções e novidades."}
          </DialogDescription>
        </DialogHeader>

        {isDownloading && updater.progress ? (
          <div className="space-y-1.5">
            <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden border-2 border-ink">
              <div
                className="h-full bg-neo-blue transition-[width] duration-300"
                style={{ width: `${downloadPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-bold text-neutral-600">
              <span>Baixando {updater.updateInfo?.version}...</span>
              <span>{downloadPct}%</span>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => onOpenChange(false)}
          >
            <span>Depois</span>
          </Button>

          {isMobileApk ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => {
                void updater.openApkDownload();
                onOpenChange(false);
              }}
            >
              <ExternalLink className="w-4 h-4 stroke-[2.5]" />
              <span>Baixar APK</span>
            </Button>
          ) : updater.status === "ready-to-restart" ? (
            <Button
              type="button"
              variant="accent"
              size="md"
              onClick={() => void updater.relaunchApp()}
            >
              <RotateCcw className="w-4 h-4 stroke-[2.5]" />
              <span>Reiniciar e Aplicar</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="md"
              isLoading={isDownloading}
              onClick={() => void updater.downloadUpdate()}
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isDownloading ? `Baixando ${downloadPct}%` : "Baixar Atualização"}
              </span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const AppUpdaterCard: React.FC = () => {
  // O hook mora aqui de propósito: cada tick de progresso re-renderiza só
  // este card, não a tela de Settings inteira.
  const updater = useAppUpdater();
  const downloadPct = updater.progress?.percent ?? 0;
  const isDownloading = updater.status === "downloading";
  const isChecking = updater.status === "checking";
  const isMobileApk = isMobileDevice();

  const isStoreBuild = import.meta.env.VITE_TARGET_STORE === "microsoft";

  // Em builds .aab (Google Play Store), o card não deve ser exibido
  if (isMobileApk && !updater.isApkUpdaterSupported) {
    return null;
  }

  // Na versão distribuída pela Microsoft Store, a entrega e atualização são gerenciadas pelo SO
  if (isStoreBuild) {
    return (
      <SettingsSection icon={Sparkles} label="Atualizações do aplicativo">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs font-semibold text-neutral-600">
            As atualizações deste aplicativo são gerenciadas automaticamente pela Microsoft Store.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              Microsoft Store
            </span>
          </div>
        </div>
      </SettingsSection>
    );
  }

  return (
    // Mesma seção padrão das demais (ícone w-4 + rótulo gritado): a tela
    // inteira compartilha uma anatomia só de cabeçalho.
    <SettingsSection icon={Sparkles} label="Atualizações do aplicativo">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <p className="text-xs font-semibold text-neutral-600">
          {statusMessage(updater)}
        </p>

        <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
          {updater.status === "ready-to-restart" ? (
            <Button
              type="button"
              variant="accent"
              size="md"
              className="w-full sm:w-auto"
              onClick={() => updater.relaunchApp()}
            >
              <RotateCcw className="w-4 h-4 stroke-[2.5]" />
              <span>Reiniciar e Aplicar</span>
            </Button>
          ) : updater.status === "available" ? (
            isMobileApk ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                className="w-full sm:w-auto"
                onClick={() => void updater.openApkDownload()}
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Baixar APK ({updater.updateInfo?.version})</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="md"
                className="w-full sm:w-auto"
                isLoading={isDownloading}
                onClick={() => updater.downloadUpdate()}
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {isDownloading ? `Baixando ${downloadPct}%` : "Baixar Atualização"}
                </span>
              </Button>
            )
          ) : (
            <Button
              type="button"
              variant="outline"
              size="md"
              className="w-full sm:w-auto"
              isLoading={isChecking}
              onClick={() => updater.checkForUpdates()}
            >
              <RefreshCw className="w-4 h-4 stroke-[2.5]" />
              <span>{isChecking ? "Verificando..." : "Verificar Atualizações"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Barra de progresso durante o download */}
      {isDownloading && updater.progress && (
        <div className="mt-4 pt-3 border-t-2 border-ink/10">
          <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden border-2 border-ink">
            <div
              className="h-full bg-neo-blue transition-[width] duration-300"
              style={{ width: `${downloadPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-bold text-neutral-600 mt-1.5">
            <span>
              Baixando arquivos da versão {updater.updateInfo?.version}...
            </span>
            <span>{downloadPct}%</span>
          </div>
        </div>
      )}
    </SettingsSection>
  );
};
