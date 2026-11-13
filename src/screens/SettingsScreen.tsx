import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  Button,
  Switch,
  PageContainer,
  PageHeader,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Slider,
  SegmentedControl,
} from "@/components/ui";
import { ConnectedAccountsCard } from "@/components/settings/ConnectedAccountsCard";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useCredentials } from "../hooks/useCredentials";
import { useFeed } from "../hooks/useFeed";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { resetMyCourseCache } from "../hooks/useMyCourse";
import { resetGradeCache } from "../hooks/useGrade";
import { useContainer } from "../context/ContainerContext";
import { useOptionalSync } from "../context/SyncContext";
import {
  Settings,
  Heart,
  AlertCircle,
  Trash2,
  RotateCcw,
  RotateCwClock,
  SlidersHorizontal,
  PersonStanding,
  Triangle,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useAppUpdater } from "../hooks/useAppUpdater";
import { useAutostart } from "../hooks/useAutostart";
import { useBackgroundRun } from "../hooks/useBackgroundRun";
import { AppUpdaterCard } from "@/components/settings/AppUpdaterCard";
import { PatchNotesView } from "@/components/settings/PatchNotesView";
import { ContributorsDialog } from "@/components/settings/ContributorsDialog";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import {
  isSoundEffectsEnabled,
  setSoundEffectsEnabled,
  playButtonClickSound,
} from "@/lib/sound-effects";
import { useAccessibility } from "../context/AccessibilityContext";
import { useTheme } from "../context/ThemeContext";
import {
  UI_ZOOM_MAX_PERCENT,
  UI_ZOOM_MIN_PERCENT,
  UI_ZOOM_STEP_PERCENT,
  type UiZoom,
} from "../lib/accessibility";
import { isMobileDevice } from "../lib/platform";

export interface SettingsScreenProps {
  onResetCredentials: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onResetCredentials,
}) => {
  const { useCases, repos } = useContainer();
  const { clearFeedData } = useFeed();
  const { clearAll, allCredentials } = useCredentials();
  const syncContext = useOptionalSync();
  // Instância "ociosa" do updater: serve só para ler a versão instalada.
  // O estado quente de download/check vive dentro de AppUpdaterCard.
  const { currentVersion: appVersion } = useAppUpdater();
  const {
    isEnabled: isAutostartEnabled,
    toggle: toggleAutostart,
    isLoading: isAutostartLoading,
  } = useAutostart();
  const {
    isEnabled: isBackgroundRunEnabled,
    toggle: toggleBackgroundRun,
    isLoading: isBackgroundRunLoading,
  } = useBackgroundRun();
  const { reduceAnimations, setReduceAnimations, uiZoom, setUiZoom } =
    useAccessibility();
  const { themeMode, setThemeMode } = useTheme();

  // Modo explorar: nenhuma conta conectada — o botão da zona de perigo vira
  // "Voltar para o Onboarding", mas a ação continua apagando tudo (grades,
  // feed e dados locais editados durante a exploração).
  const hasAnyAccount = Boolean(
    allCredentials.sigaa ||
    allCredentials.aprender3 ||
    allCredentials.teams?.isConnected,
  );

  const [isWiping, setIsWiping] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isViewingPatchNotes, setIsViewingPatchNotes] = useState(false);
  const [isCreditsDialogOpen, setIsCreditsDialogOpen] = useState(false);

  // Patch notes substituem esta tela (e o Dialog trava o scroll): guardamos
  // a posição antes de sair e restauramos quando o usuário volta.
  const { save: saveScroll, restore: restoreScroll } = useScrollRestore();
  const shouldRestoreScrollRef = useRef(false);
  useEffect(() => {
    if (
      !isViewingPatchNotes &&
      !isCreditsDialogOpen &&
      shouldRestoreScrollRef.current
    ) {
      shouldRestoreScrollRef.current = false;
      restoreScroll();
    }
  }, [isViewingPatchNotes, isCreditsDialogOpen, restoreScroll]);

  const handleOpenPatchNotes = () => {
    saveScroll();
    shouldRestoreScrollRef.current = true;
    setIsViewingPatchNotes(true);
  };

  const handleCreditsOpenChange = (open: boolean) => {
    if (open) {
      saveScroll();
      shouldRestoreScrollRef.current = true;
    }
    setIsCreditsDialogOpen(open);
  };
  const [isSoundActive, setIsSoundActive] = useState(() =>
    isSoundEffectsEnabled(),
  );
  // Zoom visual do slider: arrastar só move o thumb; o zoom real do WebView
  // aplica (e persiste) quando o usuário solta, via onValueCommitted.
  const [zoomPercent, setZoomPercent] = useState<number>(() =>
    Math.round(uiZoom * 100),
  );

  const handleToggleSound = (checked: boolean) => {
    setIsSoundActive(checked);
    setSoundEffectsEnabled(checked);
    if (checked) {
      void playButtonClickSound();
    }
  };

  const handleConfirmWipe = async () => {
    setIsWiping(true);
    try {
      // 0. Interrompe imediatamente qualquer sincronização em andamento e fecha janelas do Teams
      syncContext?.cancelSync();
      // 1. Apaga credenciais salvas no cofre seguro (Stronghold + flags instantâneas)
      await clearAll();
      // 2. Apaga feed, turmas e associações (SQLite + memória)
      await clearFeedData();
      // 3. Apaga rascunhos de grade horária (SQLite + memória)
      await useCases.manageGrade.clear();
      resetGradeCache();
      // 4. Apaga cenários simulados de IRA e histórico de notificações de prazo (SQLite + memória)
      await useCases.manageIraScenario.clear();
      await repos.deadlineNotificationRepo.clear();
      await repos.osNotifier.setBadgeCount(0);
      // 5. Apaga perfil acadêmico e histórico escolar (Meu Curso) + cache de avaliações
      await useCases.manageAcademicProfile.clearProfile();
      resetMyCourseCache();
      await useCases.getProfessorEvaluations.clearCache();
      // 6. Limpa preferências auxiliares e caches dinâmicos do localStorage
      try {
        const targetKeys = new Set<string>([
          STORAGE_KEYS.ACADEMIC_PROFILE,
          STORAGE_KEYS.IRA_SCENARIO,
          STORAGE_KEYS.LAST_SYNCED_AT,
          STORAGE_KEYS.EVALUATIONS_ENRICHED,
          STORAGE_KEYS.EVALUATIONS_FILTER_BY_COURSE,
          STORAGE_KEYS.GRADE_YEAR,
          STORAGE_KEYS.GRADE_PERIOD,
          STORAGE_KEYS.FLOWCHART_OPEN_SEMESTERS,
          STORAGE_KEYS.ONBOARDING_EXPLORED,
          "unb_aggregator_academic_profile_v1",
          "unb_aggregator_ira_scenario_v1",
          "unb_grade_deptId",
        ]);

        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith("sarue_curricula_course_") || targetKeys.has(key))
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {}
      // 7. Fecha o diálogo e redireciona imediatamente para o onboarding
      setIsConfirmDialogOpen(false);
      onResetCredentials();
    } catch (err) {
      console.error("Erro ao apagar todos os dados:", err);
    } finally {
      setIsWiping(false);
    }
  };

  if (isViewingPatchNotes) {
    return (
      <PatchNotesView
        onBack={() => setIsViewingPatchNotes(false)}
        currentVersion={appVersion}
      />
    );
  }

  return (
    <PageContainer>
      {/* Mesma largura das demais telas: o PageContainer governa */}
      <div className="space-y-6">
        <PageHeader icon={Settings} title="Configurações" />

        {/* Contas conectadas: accordion do cofre dentro do card padrão */}
        <ConnectedAccountsCard />

        {/* Preferências do aplicativo */}
        <SettingsSection icon={SlidersHorizontal} label="Preferências">
          <div className="space-y-4">
            {/* Inicialização com o Sistema */}
            {!isMobileDevice() && (
              <div className="flex items-center justify-between gap-4 py-1">
                <div className="max-w-md">
                  <span className="text-xs font-black text-black block">
                    Iniciar com o sistema
                  </span>
                  <p className="text-xs font-semibold text-neutral-600 leading-snug mt-0.5">
                    O Saruê abre em segundo plano quando você liga o computador,
                    para você não perder prazos.
                  </p>
                </div>
                <Switch
                  checked={isAutostartEnabled}
                  disabled={isAutostartLoading}
                  onCheckedChange={toggleAutostart}
                  aria-label="Iniciar automaticamente com o sistema"
                  className="shrink-0"
                />
              </div>
            )}

            {/* Rodar em segundo plano */}
            {!isMobileDevice() && (
              <div className="flex items-center justify-between gap-4 py-1">
                <div className="max-w-md">
                  <span className="text-xs font-black text-black block">
                    Rodar em segundo plano
                  </span>
                  <p className="text-xs font-semibold text-neutral-600 leading-snug mt-0.5">
                    Mantém o Saruê ativo na bandeja para não perder prazos e sincroniza
                    a cada 6 horas automaticamente.
                  </p>
                </div>
                <Switch
                  checked={isBackgroundRunEnabled}
                  disabled={isBackgroundRunLoading}
                  onCheckedChange={toggleBackgroundRun}
                  aria-label="Rodar em segundo plano"
                  className="shrink-0"
                />
              </div>
            )}

            {/* Feedback Sonoro / Switch Mecânico */}
            <div className="flex items-center justify-between gap-4 py-1">
              <div className="max-w-md">
                <span className="text-xs font-black text-black block">
                  Som de clique
                </span>
                <p className="text-xs font-semibold text-neutral-600 leading-snug mt-0.5">
                  Efeito sonoro de clique macio e tátil ao apertar botões.
                </p>
              </div>
              {/* Wrapper mutado: o listener global de som escala o DOM a
                  partir do alvo do clique, e o input oculto do Switch da
                  Base UI é irmão do span visível — o data-no-sound só no
                  span não o alcança. Desligar fica mudo; ligar toca via
                  handleToggleSound. */}
              <div data-no-sound="true" className="shrink-0">
                <Switch
                  checked={isSoundActive}
                  onCheckedChange={handleToggleSound}
                  aria-label="Ativar efeito sonoro de botão"
                  data-no-sound="true"
                />
              </div>
            </div>

            {/* Tema da interface: claro, escuro ou sistema */}
            <div className="flex items-center justify-between gap-4 py-1">
              <div className="max-w-md">
                <span className="text-xs font-black text-black block">
                  Tema da interface
                </span>
                <p className="text-xs font-semibold text-neutral-600 leading-snug mt-0.5">
                  Claro, escuro ou acompanhando o seu sistema.
                </p>
              </div>
              <SegmentedControl
                size="md"
                ariaLabel="Tema da interface"
                value={themeMode}
                onValueChange={setThemeMode}
                className="w-64 shrink-0"
                options={[
                  {
                    value: "light",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 stroke-[2.5]" />
                        Claro
                      </span>
                    ),
                    title: "Tema claro",
                  },
                  {
                    value: "dark",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <Moon className="w-3.5 h-3.5 stroke-[2.5]" />
                        Escuro
                      </span>
                    ),
                    title: "Tema escuro — a lousa à noite",
                  },
                  {
                    value: "system",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <Monitor className="w-3.5 h-3.5 stroke-[2.5]" />
                        Sistema
                      </span>
                    ),
                    title: "Seguir o tema do sistema",
                  },
                ]}
              />
            </div>
          </div>
        </SettingsSection>

        {/* Acessibilidade: reduzir animações + zoom da interface */}
        <SettingsSection icon={PersonStanding} label="Acessibilidade">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 py-1">
              <div className="max-w-md">
                <span className="text-xs font-black text-black block">
                  Reduzir animações
                </span>
                <p className="text-xs font-semibold text-neutral-600 leading-snug mt-0.5">
                  Desliga os movimentos do app. Desligado, segue a configuração
                  do seu sistema.
                </p>
              </div>
              <Switch
                checked={reduceAnimations}
                onCheckedChange={(checked) => setReduceAnimations(checked)}
                aria-label="Reduzir animações da interface"
                className="shrink-0"
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-1">
              <div className="max-w-md">
                <span className="text-xs font-black text-black block">
                  Zoom da interface
                </span>
                <p className="text-xs font-semibold text-neutral-600 leading-snug mt-0.5">
                  Aumenta ou diminui o tamanho de toda a interface, de 90% a
                  120%.
                </p>
              </div>
              <div className="flex items-center gap-3 w-56 shrink-0">
                <div className="relative flex-1 pt-5">
                  <Slider
                    aria-label="Zoom da interface"
                    min={UI_ZOOM_MIN_PERCENT}
                    max={UI_ZOOM_MAX_PERCENT}
                    step={UI_ZOOM_STEP_PERCENT}
                    value={[zoomPercent]}
                    onValueChange={(value) => {
                      // Durante o arraste, só o visual do slider acompanha.
                      setZoomPercent(Array.isArray(value) ? value[0] : value);
                    }}
                    onValueCommitted={(value) => {
                      const percent = Array.isArray(value) ? value[0] : value;
                      const next =
                        typeof percent === "number" ? percent / 100 : NaN;
                      if (Number.isFinite(next) && next !== uiZoom) {
                        setUiZoom(next as UiZoom);
                      }
                    }}
                    className="w-full"
                  />
                  {/* Marcador do 100%: 1/3 do curso (90–120%), apontando pro trilho */}
                  <Triangle
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 left-[calc(33.333%-3px)] w-3 h-3 rotate-180 fill-current text-neutral-400"
                  />
                </div>
                <span className="text-xs font-black text-black w-10 text-right tabular-nums">
                  {zoomPercent}%
                </span>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Atualizações do Aplicativo */}
        {!isMobileDevice() && <AppUpdaterCard />}

        {/* Zona de Perigo — logo após Atualizações, com respiro maior antes */}
        <div className="pt-6">
          {/* No escuro: sombra Vermelho Profundo sob placa Vermelho Sangue —
              a tinta tingida escurece junto com o tema, o degrau continua
              lendo contra a base de corte. */}
          <Card className="border-2 border-neo-danger bg-pastel-red rounded-lg p-5 shadow-[4px_4px_0px_0px_#dc2626] dark:bg-[#7f1d1d] dark:shadow-[4px_4px_0px_0px_#450a0a]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-ink-error mb-1">
                  <AlertCircle className="w-5 h-5 stroke-[2.5]" />
                  <h3 className="text-sm font-black uppercase tracking-tight dark:text-black">
                    Apagar Dados e Credenciais
                  </h3>
                </div>
                <p className="text-xs font-semibold text-neutral-700 leading-snug">
                  Tudo que o Saruê guardou neste dispositivo some: contas,
                  avisos do feed, disciplinas e grades salvas. Não existe
                  desfazer.
                </p>
              </div>

              <Button
                type="button"
                variant="destructive"
                size="md"
                onClick={() => {
                  // Interrompe imediatamente qualquer sincronização que esteja rodando
                  syncContext?.cancelSync();
                  if (hasAnyAccount) setIsConfirmDialogOpen(true);
                  else void handleConfirmWipe();
                }}
                className="shrink-0"
              >
                {hasAnyAccount ? (
                  <Trash2 className="w-4 h-4 stroke-[2.5]" />
                ) : (
                  <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                )}
                <span>
                  {hasAnyAccount
                    ? "Apagar Dados e Credenciais"
                    : "Voltar para o Onboarding"}
                </span>
              </Button>
            </div>
          </Card>
        </div>

        {/* Sobre: versão, patch notes, licença e redes, sem rótulo de seção */}
        <section>
          <div className="flex flex-col items-center text-center pt-2">
            <img
              src="/sarue-sleep.png"
              alt="Mascote Saruê dormindo"
              className="w-48 md:w-60 h-auto object-contain select-none pointer-events-none mb-4"
            />

            <span className="text-[11px] font-extrabold text-neutral-500">
              v{appVersion}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleOpenPatchNotes}
              title="Ver as novidades e patch notes desta versão"
            >
              <RotateCwClock className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Registros de Alterações</span>
            </Button>

            <p className="text-xs text-neutral-600 font-medium leading-relaxed max-w-md mt-4">
              Software livre sob a licença Apache 2.0, feito para e pela
              comunidade acadêmica da UnB. Código auditável publicamente no
              GitHub.
            </p>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsCreditsDialogOpen(true)}
              title="Quem faz o Saruê"
              className="mt-3"
            >
              <Heart className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Contribuidores</span>
            </Button>

            <span className="text-xs font-bold text-neutral-600 mt-3">
              © {new Date().getFullYear()} Kaleb Henrique
            </span>
          </div>
        </section>
      </div>

      {/* Diálogo de Confirmação */}
      <Dialog
        open={isConfirmDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isWiping) {
            setIsConfirmDialogOpen(false);
          }
        }}
      >
        <DialogContent showCloseButton={!isWiping} className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-lg bg-neo-danger text-white border-2 border-ink flex items-center justify-center shadow-[2px_2px_0px_0px_var(--neo-shadow)]">
                <Trash2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <DialogTitle>
                {hasAnyAccount
                  ? "Apagar Todos os Dados e Credenciais?"
                  : "Apagar Dados e Voltar ao Onboarding?"}
              </DialogTitle>
            </div>
            <DialogDescription>
              Esta ação é definitiva e irreversível. Todos os dados armazenados
              do Saruê UnB neste dispositivo serão permanentemente excluídos.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={isWiping}
              onClick={() => setIsConfirmDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="md"
              disabled={isWiping}
              isLoading={isWiping}
              onClick={handleConfirmWipe}
            >
              <Trash2 className="w-4 h-4 stroke-[2.5]" />
              <span>Confirmar Exclusão</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Créditos */}
      <ContributorsDialog
        open={isCreditsDialogOpen}
        onOpenChange={handleCreditsOpenChange}
      />
    </PageContainer>
  );
};
