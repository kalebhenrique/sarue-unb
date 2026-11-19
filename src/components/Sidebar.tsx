import React from "react";
import {
  Home,
  BookOpen,
  CalendarDays,
  SquareKanban,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  GraduationCap,
  MessageSquareQuote,
  Utensils,
  IdCard,
  AlignJustify,
  Bell,
} from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { AnimatePresence, motion } from "motion/react";
import { Progress } from "@/components/ui/progress";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SyncStatusTooltip, SyncStatusSummaryDialog } from "./SyncStatusTooltip";
import { DeadlineBell } from "./notifications/DeadlineBell";
import { useDeadlines } from "../context/DeadlineContext";
import { useUpdateAvailable } from "../hooks/useAppUpdater";
import { useDesktopRuSidebar } from "../hooks/useDesktopRuSidebar";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { SyncStepInfo } from "../context/SyncContext";

export type NavTab =
  | "home"
  | "courses"
  | "ru"
  | "wallet"
  | "grade"
  | "calendar"
  | "my-course"
  | "evaluations"
  | "notifications"
  | "settings";

export interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isSyncing?: boolean;
  onSync?: () => void;
  lastSyncedAt?: string | null;
  hasConnectedAccounts?: boolean;
  hasUpdateAvailable?: boolean;
  syncSteps?: Record<
    "sigaa" | "aprender3" | "teams" | "myCourse" | "ghPages" | "planilha",
    SyncStepInfo
  >;
  /** Estado do popover de status (controlado pelo ritual pós-cadastro no AppShell) */
  syncPopoverOpen?: boolean;
  onSyncPopoverOpenChange?: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isSyncing = false,
  onSync,
  lastSyncedAt,
  hasConnectedAccounts = false,
  hasUpdateAvailable: propHasUpdateAvailable,
  syncSteps,
  syncPopoverOpen,
  onSyncPopoverOpenChange,
}) => {
  const hookHasUpdateAvailable = useUpdateAvailable();
  const hasUpdate = propHasUpdateAvailable ?? hookHasUpdateAvailable;
  const { badgeCount } = useDeadlines();
  const { isHidden: isRuHiddenInDesktop } = useDesktopRuSidebar();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mobileSyncDialogOpen, setMobileSyncDialogOpen] = React.useState(false);

  // Popover de status: controlado pelo AppShell (ritual pós-cadastro), com fallback interno
  const [internalSyncPopoverOpen, setInternalSyncPopoverOpen] =
    React.useState(false);
  const syncPopoverOpenValue =
    onSyncPopoverOpenChange !== undefined
      ? Boolean(syncPopoverOpen)
      : internalSyncPopoverOpen;
  // Fixa o painel aberto (clique ou ritual pós-cadastro) até clique fora;
  // hover abre preview que fecha ao tirar o mouse (com 150ms de graça para entrar no painel)
  const [isPinned, setIsPinned] = React.useState(false);
  const closeTimerRef = React.useRef<number | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const handleSyncPopoverOpenChange = (open: boolean) => {
    if (!open) setIsPinned(false);
    if (onSyncPopoverOpenChange) {
      onSyncPopoverOpenChange(open);
    } else {
      setInternalSyncPopoverOpen(open);
    }
  };

  const openSyncPanel = () => {
    if (!hasConnectedAccounts) return;
    clearCloseTimer();
    if (!syncPopoverOpenValue) handleSyncPopoverOpenChange(true);
  };

  const scheduleSyncPanelClose = () => {
    if (isPinned) return;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      handleSyncPopoverOpenChange(false);
    }, 150);
  };

  // Clique no Sincronizar: dispara o sync (quando ocioso) e fixa o painel de
  // progresso aberto até clique fora. Com sync rodando, clique alterna o painel.
  const handleSyncTriggerClick = (event: React.MouseEvent) => {
    clearCloseTimer();
    if (!hasConnectedAccounts) return;
    if (!isSyncing) onSync?.();
    if (!syncPopoverOpenValue || !isPinned) {
      setIsPinned(true);
      if (!syncPopoverOpenValue) handleSyncPopoverOpenChange(true);
      event.preventDefault();
    } else {
      setIsPinned(false);
    }
  };
  const navItems = [
    { id: "home" as NavTab, label: "Home", icon: Home },
    { id: "courses" as NavTab, label: "Disciplinas", icon: BookOpen },
    { id: "grade" as NavTab, label: "Montar Grade", icon: SquareKanban },
    { id: "calendar" as NavTab, label: "Calendário", icon: CalendarDays },
    {
      id: "evaluations" as NavTab,
      label: "Avaliar Professor",
      icon: MessageSquareQuote,
    },
    { id: "my-course" as NavTab, label: "Meu Curso", icon: GraduationCap },
    ...(!isRuHiddenInDesktop
      ? [{ id: "ru" as NavTab, label: "Cardápio RU", icon: Utensils }]
      : []),
    { id: "settings" as NavTab, label: "Configurações", icon: Settings },
  ];

  const moreNavItems = [
    { id: "wallet" as NavTab, label: "Carteirinha", icon: IdCard },
    { id: "calendar" as NavTab, label: "Calendário", icon: CalendarDays },
    { id: "grade" as NavTab, label: "Montar Grade", icon: SquareKanban },
    {
      id: "evaluations" as NavTab,
      label: "Avaliar Professor",
      icon: MessageSquareQuote,
    },
    { id: "my-course" as NavTab, label: "Meu Curso", icon: GraduationCap },
    { id: "settings" as NavTab, label: "Configurações", icon: Settings },
  ];

  const [isMoreOpen, setIsMoreOpen] = React.useState(false);
  const [moreSyncPulse, setMoreSyncPulse] = React.useState(0);
  const showMoreSyncIcon = moreSyncPulse > 0;
  const wasSyncingRef = React.useRef(false);

  React.useEffect(() => {
    const startedSync = isSyncing && !wasSyncingRef.current;
    wasSyncingRef.current = isSyncing;
    if (startedSync) {
      setMoreSyncPulse((prev) => prev + 1);
    }
  }, [isSyncing]);

  React.useEffect(() => {
    if (moreSyncPulse === 0) return;
    const timer = window.setTimeout(() => {
      setMoreSyncPulse(0);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [moreSyncPulse]);

  React.useEffect(() => {
    setIsMoreOpen(false);
  }, [currentTab]);

  React.useEffect(() => {
    if (!isMoreOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMoreOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoreOpen]);

  const isHomeActive = currentTab === "home";
  const isCoursesActive = currentTab === "courses";
  const isRuActive = currentTab === "ru";
  const isNotificationsActive = currentTab === "notifications";
  const isMoreRouteActive = moreNavItems.some((item) => item.id === currentTab);

  // Índice ativo para o thumb deslizante da Bottom Tab Bar (estilo SegmentedControl):
  // 0 = Início, 1 = Disciplinas, 2 = RU, 3 = Notificações, 4 = Mais (quando aberto ou em rota interna)
  const activeMobileIndex = isMoreOpen
    ? 4
    : isHomeActive
      ? 0
      : isCoursesActive
        ? 1
        : isRuActive
          ? 2
          : isNotificationsActive
            ? 3
            : isMoreRouteActive
              ? 4
              : -1;

  const formatLastSync = (isoString?: string | null) => {
    if (!isoString) return "Não sincronizado";
    try {
      let date = new Date(isoString);
      if (isNaN(date.getTime())) {
        const numeric = Number(isoString.replace(/[^0-9]/g, ""));
        if (numeric > 0) {
          date = new Date(numeric < 1e11 ? numeric * 1000 : numeric);
        }
      }
      if (isNaN(date.getTime())) return "Não sincronizado";
      return `Último: ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return "";
    }
  };

  const activeSyncStep = syncSteps
    ? (
        [
          "sigaa",
          "aprender3",
          "myCourse",
          "teams",
          "ghPages",
          "planilha",
        ] as const
      )
        .map((id) => syncSteps[id])
        .find((s) => s?.status === "syncing")
    : undefined;

  // Cálculo estritamente sequencial de 4 etapas para a barra verde do mobile:
  // 1) SIGAA + Aprender 3 (juntos no primeiro check em 25%)
  // 2) Meu Curso (50%)
  // 3) Catálogo UnB / ghPages (75%)
  // 4) Planilha de Avaliações (100%)
  const syncProgressInfo = React.useMemo(() => {
    const total = 4;
    if (!syncSteps) {
      return {
        total,
        completed: lastSyncedAt ? total : 0,
        percent: lastSyncedAt ? 100 : 0,
      };
    }

    const isDone = (
      id: "sigaa" | "aprender3" | "myCourse" | "ghPages" | "planilha",
    ) => {
      const st = syncSteps[id]?.status;
      return st === "success" || st === "error" || st === "skipped";
    };

    const isCurrentlySyncing = isSyncing || Boolean(activeSyncStep);
    if (!isCurrentlySyncing) {
      const anySuccess = (
        ["sigaa", "aprender3", "myCourse", "ghPages", "planilha"] as const
      ).some((id) => syncSteps[id]?.status === "success");
      const allDone = anySuccess || Boolean(lastSyncedAt);
      return {
        total,
        completed: allDone ? total : 0,
        percent: allDone ? 100 : 0,
      };
    }

    // Cada check exige que o anterior já tenha concluído (progresso contínuo sem pular checks)
    const stage1 = isDone("sigaa") && isDone("aprender3");
    const stage2 = stage1 && isDone("myCourse");
    const stage3 = stage2 && isDone("ghPages");
    const stage4 = stage3 && isDone("planilha");

    const completed = [stage1, stage2, stage3, stage4].filter(Boolean).length;
    const stepSize = 100 / total; // 25% por etapa
    // Enquanto sincroniza a próxima etapa, avança parcialmente (+10%) sem nunca ultrapassar o próximo check
    const percent =
      completed >= total
        ? 100
        : Math.round(completed * stepSize + stepSize * 0.4);

    return {
      total,
      completed,
      percent,
    };
  }, [syncSteps, isSyncing, activeSyncStep, lastSyncedAt]);

  // Painel do popover: status das plataformas + ação de sincronizar
  // (o status mudou de tooltip no hover para popover no clique — persiste até clique fora)
  const syncPanel = (
    <PopoverPrimitive.Popup
      aria-label="Status da sincronização"
      onMouseEnter={clearCloseTimer}
      onMouseLeave={scheduleSyncPanelClose}
      className="w-80 rounded-lg border-2 border-ink bg-canvas overflow-hidden outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
    >
      {syncSteps ? (
        <SyncStatusTooltip
          steps={syncSteps}
          isSyncing={isSyncing || Boolean(activeSyncStep)}
          lastSyncedAt={lastSyncedAt ?? null}
        />
      ) : null}
    </PopoverPrimitive.Popup>
  );

  return (
    <>
      <aside
        className={`group hidden md:flex h-full bg-paper border-r-2 border-ink flex-col transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] select-none z-20 shrink-0 overflow-x-hidden ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Topo da Sidebar: header e navegação — a navegação rola quando o
          espaço vertical acaba (zoom alto, janela curta); header e rodapé
          ficam sempre fixos (sanduíche) */}
        <div className="min-h-0 flex-1 flex flex-col">
          {/* Header da Sidebar */}
          <div className="shrink-0 p-4 border-b-2 border-ink flex items-center justify-between min-h-[69px] overflow-hidden">
            <div className="flex items-center min-w-0 flex-1">
              {/* Logo e Botão de Expandir no hover quando colapsado */}
              <div className="relative shrink-0 flex items-center justify-center">
                <button
                  type="button"
                  data-no-sound={isHomeActive ? "true" : undefined}
                  onClick={() => onSelectTab("home")}
                  title="Ir para a Home"
                  aria-label="Ir para a Home"
                  className={`cursor-pointer w-[42px] h-[42px] border-2 border-ink rounded-xl overflow-hidden shadow-[2px_2px_0px_0px_var(--neo-shadow)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 flex items-center justify-center bg-paper transition-opacity duration-200 ${
                    isCollapsed ? "group-hover:opacity-0" : "opacity-100"
                  }`}
                >
                  <img
                    src="/sarue-logo.png"
                    alt="Saruê UnB"
                    className="w-full h-full object-cover select-none pointer-events-none"
                  />
                </button>

                {/* Botão de Expandir: visível no hover apenas quando colapsado */}
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  title="Expandir barra lateral"
                  aria-label="Expandir barra lateral"
                  className={`cursor-pointer absolute inset-0 w-[42px] h-[42px] items-center justify-center border-2 border-ink rounded-xl bg-neo-blue hover:bg-neo-blueHover text-white shadow-[2px_2px_0px_0px_var(--neo-shadow)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-opacity duration-200 flex ${
                    isCollapsed
                      ? "opacity-0 group-hover:opacity-100"
                      : "opacity-0 pointer-events-none"
                  }`}
                >
                  <PanelLeftOpen className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>

              {/* Texto Saruê UnB com expansão/colapso suave */}
              <div
                className={`overflow-hidden transition-[max-width,opacity,margin] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                  isCollapsed
                    ? "max-w-0 opacity-0 ml-0 pointer-events-none"
                    : "max-w-[150px] opacity-100 ml-3"
                }`}
              >
                <button
                  type="button"
                  data-no-sound={isHomeActive ? "true" : undefined}
                  onClick={() => onSelectTab("home")}
                  title="Ir para a Home"
                  className="cursor-pointer text-left block focus-visible:outline-hidden"
                >
                  <span className="font-extrabold text-base tracking-tight whitespace-nowrap text-black block truncate">
                    Saruê <span className="text-unb-blue">UnB</span>
                  </span>
                </button>
              </div>
            </div>

            {/* Botão de Colapsar: visível no hover apenas quando expandido */}
            <div
              className={`flex items-center justify-center transition-[max-width,opacity,margin,padding] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                isCollapsed
                  ? "max-w-0 p-0 opacity-0 ml-0 pointer-events-none overflow-hidden"
                  : "max-w-12 p-1 opacity-0 group-hover:opacity-100 ml-1 overflow-visible"
              }`}
            >
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Recolher barra lateral"
                className="cursor-pointer p-1.5 border-2 border-ink rounded-lg bg-paper hover:bg-neutral-100 text-black shadow-[2px_2px_0px_0px_var(--neo-shadow)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_var(--neo-shadow)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-[transform,box-shadow,background-color,border-color]"
              >
                <PanelLeftClose className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Lista de Navegação com som fofo/macio tátil (apenas ao alternar para aba inativa) */}
          <nav className="min-h-0 overflow-y-auto border-b-2 border-ink">
            <ul className="flex flex-col">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                const isSettingsWithUpdate =
                  item.id === "settings" && hasUpdate;

                return (
                  <li
                    key={item.id}
                    className="border-b-2 border-ink last:border-b-0"
                  >
                    <button
                      type="button"
                      data-no-sound={isActive ? "true" : undefined}
                      onClick={() => onSelectTab(item.id)}
                      title={item.label}
                      aria-current={isActive ? "page" : undefined}
                      className={`cursor-pointer w-full flex items-center select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper transition-colors duration-150 py-3.5 px-4 overflow-hidden ${
                        isActive
                          ? "bg-neo-blue text-white font-black"
                          : "bg-paper text-neutral-800 hover:bg-neutral-100 font-bold"
                      }`}
                    >
                      <div className="w-[42px] h-6 shrink-0 flex items-center justify-center relative">
                        <Icon className="w-5 h-5 stroke-[2.5]" />
                        {isSettingsWithUpdate && isCollapsed && (
                          <span
                            aria-hidden="true"
                            className={`absolute top-0.5 right-2 w-2 h-2 rounded-full ${
                              isActive ? "bg-paper" : "bg-neo-blue"
                            }`}
                          />
                        )}
                      </div>
                      <div
                        className={`flex items-center min-w-0 transition-[max-width,opacity,margin] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                          isCollapsed
                            ? "max-w-0 opacity-0 ml-0 pointer-events-none"
                            : "max-w-44 opacity-100 ml-3"
                        }`}
                      >
                        <span className="text-sm font-extrabold tracking-tight whitespace-nowrap truncate">
                          {item.label}
                        </span>
                        {isSettingsWithUpdate && (
                          <span
                            data-testid="sidebar-update-dot"
                            aria-label="Atualização disponível"
                            title="Atualização disponível"
                            className={`w-2 h-2 rounded-full shrink-0 ml-2 ${
                              isActive ? "bg-paper" : "bg-neo-blue"
                            }`}
                          />
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Canto Inferior da Sidebar: Botão de Sincronizar com Efeito Macio */}
        <div className="shrink-0 p-4 border-t-2 border-ink overflow-hidden">
          <div
            className={`relative transition-[height] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
              isCollapsed ? "h-[88px]" : "h-10"
            }`}
          >
            {/* Botão de Sincronizar com Popover */}
            <div
              className={`absolute top-0 transition-[width,left,transform] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                isCollapsed
                  ? "left-1/2 -translate-x-1/2 w-10"
                  : "left-0 translate-x-0 w-[calc(100%-48px)]"
              }`}
            >
              <PopoverPrimitive.Root
                open={!isMobile && syncPopoverOpenValue}
                onOpenChange={handleSyncPopoverOpenChange}
              >
                <PopoverPrimitive.Trigger
                  type="button"
                  disabled={!hasConnectedAccounts}
                  title="Status da sincronização"
                  aria-label="Status da sincronização"
                  onMouseEnter={openSyncPanel}
                  onMouseLeave={scheduleSyncPanelClose}
                  onClick={handleSyncTriggerClick}
                  className={`w-full h-10 flex items-center justify-center font-bold text-xs rounded-2xl border-2 transition-[transform,box-shadow,background-color,border-color] duration-150 select-none ${
                    !hasConnectedAccounts
                      ? "bg-neutral-200 text-neutral-400 border-neutral-300 cursor-not-allowed shadow-none"
                      : "cursor-pointer bg-neo-blue hover:bg-neo-blueHover text-white border-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 focus-visible:ring-offset-paper shadow-[2px_2px_0px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_var(--neo-shadow)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  }`}
                >
                  <RefreshCw
                    className={`w-4 h-4 shrink-0 stroke-[2.5] ${isSyncing || activeSyncStep ? "animate-spin" : ""}`}
                  />
                  <span
                    className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity,margin] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                      isCollapsed
                        ? "max-w-0 opacity-0 ml-0 pointer-events-none"
                        : "max-w-32 opacity-100 ml-1.5"
                    }`}
                  >
                    {isSyncing ? "Sincronizando..." : "Sincronizar"}
                  </span>
                </PopoverPrimitive.Trigger>
                <PopoverPrimitive.Portal>
                  <PopoverPrimitive.Positioner
                    side={isCollapsed ? "right" : "top"}
                    align={isCollapsed ? "center" : "start"}
                    sideOffset={isCollapsed ? 12 : 8}
                    className="z-50"
                  >
                    {syncPanel}
                  </PopoverPrimitive.Positioner>
                </PopoverPrimitive.Portal>
              </PopoverPrimitive.Root>
            </div>

            {/* Sino de Notificações / Prazos */}
            <div
              className={`absolute transition-[top,left,transform] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                isCollapsed
                  ? "top-12 left-1/2 -translate-x-1/2"
                  : "top-0 left-[calc(100%-40px)] translate-x-0"
              }`}
            >
              <DeadlineBell />
            </div>
          </div>

          <div
            className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
              isCollapsed
                ? "max-h-0 opacity-0 mt-0 pointer-events-none"
                : "max-h-6 opacity-100 mt-2"
            }`}
          >
            <p className="text-[11px] text-neutral-500 font-semibold text-center truncate">
              {formatLastSync(lastSyncedAt)}
            </p>
          </div>
        </div>
      </aside>

      {/* Unidade Inferior Mobile: Bottom Sheet "Mais" (arrastável para baixo) + Bottom Tab Bar.
        Quando aberto, a borda superior fica no topo do sheet e não há linha entre o menu e a tabbar. */}
      <div className="fixed bottom-0 inset-x-0 z-40 flex flex-col md:hidden select-none">
        <BottomSheet
          open={isMoreOpen}
          onClose={() => setIsMoreOpen(false)}
          backdrop
          backdropClassName="md:hidden -z-10"
          handleClassName="bg-neutral-50"
          className="relative z-10"
          id="mobile-more-menu"
          role="navigation"
          aria-label="Mais opções de navegação"
        >
              {/* Topo: Botão de Sincronizar (sem popover no mobile) + Progress Verde Contínuo com Checks */}
              <div className="px-4 pt-2 pb-3.5 bg-neutral-50 border-b-2 border-ink space-y-2.5">
                <button
                  type="button"
                  disabled={!hasConnectedAccounts}
                  onClick={() => {
                    if (!hasConnectedAccounts || isSyncing) return;
                    onSync?.();
                  }}
                  className={`w-full h-11 flex items-center justify-center gap-2 font-extrabold text-xs rounded-xl border-2 transition-[transform,box-shadow,background-color,border-color] duration-150 select-none ${
                    !hasConnectedAccounts
                      ? "bg-neutral-200 text-neutral-400 border-neutral-300 cursor-not-allowed shadow-none"
                      : "cursor-pointer bg-neo-blue hover:bg-neo-blueHover text-white border-ink shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2"
                  }`}
                >
                  <RefreshCw
                    className={`w-4 h-4 shrink-0 stroke-[2.5] ${
                      isSyncing || activeSyncStep ? "animate-spin" : ""
                    }`}
                  />
                  <span>{isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMobileSyncDialogOpen(true)}
                  aria-label="Ver status resumido da sincronização"
                  className="cursor-pointer block w-full text-left rounded-xl px-1.5 py-1 hover:bg-black/5 active:bg-black/10 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
                >
                  <Progress
                    value={syncProgressInfo.percent}
                    stepsCount={syncProgressInfo.total}
                    completedSteps={syncProgressInfo.completed}
                    aria-label="Progresso da sincronização"
                  />
                  <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-neutral-600 mt-0.5 px-0.5">
                    <span className="truncate">
                      {isSyncing || activeSyncStep
                        ? `Sincronizando ${activeSyncStep?.label ?? "..."}`
                        : formatLastSync(lastSyncedAt)}
                    </span>
                    <span className="shrink-0 text-blue-ink font-extrabold underline">
                      Ver status
                    </span>
                  </div>
                </button>
              </div>

              {/* Lista de Navegação Expansível (incluindo Carteirinha) */}
              <div className="flex flex-col divide-y-2 divide-black/10 py-1">
                {moreNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  const isSettingsWithUpdate =
                    item.id === "settings" && hasUpdate;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-no-sound={isActive ? "true" : undefined}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => {
                        onSelectTab(item.id);
                        setIsMoreOpen(false);
                      }}
                      className={`cursor-pointer w-full px-5 py-4 text-sm font-extrabold flex items-center gap-3 text-left transition-colors focus-visible:outline-hidden ${
                        isActive
                          ? "text-neo-blue bg-neutral-100"
                          : "text-black hover:bg-neutral-100 hover:text-neo-blue active:bg-neutral-200"
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0 stroke-[2.5]" />
                      <span className="truncate">{item.label}</span>
                      {isSettingsWithUpdate && (
                        <span
                          aria-label="Atualização disponível"
                          className="w-2 h-2 rounded-full shrink-0 ml-auto bg-neo-blue"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
        </BottomSheet>

        {/* Bottom Tab Bar inspirada em SegmentedControl (sem border-t quando o sheet está aberto) */}
        <nav
          aria-label="Navegação principal mobile"
          className={`relative z-10 w-full bg-paper px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] ${
            isMoreOpen ? "border-t-0" : "border-t-2 border-ink"
          }`}
        >
          <div className="relative w-full grid grid-cols-5 gap-1">
            {/* Thumb-adesivo: pill Azul Caneta que desliza até a aba ativa em 150ms ease-out */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 left-0 rounded-xl bg-neo-blue transition-[transform,opacity] duration-150 ease-out ${
                activeMobileIndex === -1 ? "opacity-0" : ""
              }`}
              style={{
                width: "calc((100% - 16px) / 5)",
                transform: `translateX(calc(${Math.max(0, activeMobileIndex) * 100}% + ${Math.max(0, activeMobileIndex) * 4}px))`,
              }}
            />

            {/* 1. Início */}
            <button
              type="button"
              data-no-sound={isHomeActive && !isMoreOpen ? "true" : undefined}
              aria-label="Início"
              aria-current={isHomeActive ? "page" : undefined}
              onClick={() => {
                setIsMoreOpen(false);
                onSelectTab("home");
              }}
              className={`relative z-10 cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[48px] py-2 px-1 rounded-xl text-xs font-extrabold leading-none tracking-tight transition-colors duration-150 active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue ${
                activeMobileIndex === 0
                  ? "text-white"
                  : "text-black hover:bg-neutral-100"
              }`}
            >
              <Home className="w-6 h-6 stroke-[2.5]" />
            </button>

            {/* 2. Disciplinas */}
            <button
              type="button"
              data-no-sound={
                isCoursesActive && !isMoreOpen ? "true" : undefined
              }
              aria-label="Disciplinas"
              aria-current={isCoursesActive ? "page" : undefined}
              onClick={() => {
                setIsMoreOpen(false);
                onSelectTab("courses");
              }}
              className={`relative z-10 cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[48px] py-2 px-1 rounded-xl text-xs font-extrabold leading-none tracking-tight transition-colors duration-150 active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue ${
                activeMobileIndex === 1
                  ? "text-white"
                  : "text-black hover:bg-neutral-100"
              }`}
            >
              <BookOpen className="w-6 h-6 stroke-[2.5]" />
            </button>

            {/* 3. RU */}
            <button
              type="button"
              data-no-sound={isRuActive && !isMoreOpen ? "true" : undefined}
              aria-label="RU"
              aria-current={isRuActive ? "page" : undefined}
              onClick={() => {
                setIsMoreOpen(false);
                onSelectTab("ru");
              }}
              className={`relative z-10 cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[48px] py-2 px-1 rounded-xl text-xs font-extrabold leading-none tracking-tight transition-colors duration-150 active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue ${
                activeMobileIndex === 2
                  ? "text-white"
                  : "text-black hover:bg-neutral-100"
              }`}
            >
              <Utensils className="w-6 h-6 stroke-[2.5]" />
            </button>

            {/* 4. Notificações */}
            <button
              type="button"
              data-no-sound={
                isNotificationsActive && !isMoreOpen ? "true" : undefined
              }
              aria-label="Notificações"
              aria-current={isNotificationsActive ? "page" : undefined}
              onClick={() => {
                setIsMoreOpen(false);
                onSelectTab("notifications");
              }}
              className={`relative z-10 cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[48px] py-2 px-1 rounded-xl text-xs font-extrabold leading-none tracking-tight transition-colors duration-150 active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue ${
                activeMobileIndex === 3
                  ? "text-white"
                  : "text-black hover:bg-neutral-100"
              }`}
            >
              <div className="relative">
                <Bell className="w-6 h-6 stroke-[2.5]" />
                {badgeCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center text-[11px] leading-none font-bold text-white bg-neo-danger border-2 border-ink rounded-full"
                  >
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
              </div>
            </button>

            {/* 5. Mais */}
            <button
              type="button"
              aria-label="Mais"
              aria-expanded={isMoreOpen}
              aria-controls="mobile-more-menu"
              onClick={() => setIsMoreOpen((prev) => !prev)}
              className={`relative z-10 cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[48px] py-2 px-1 rounded-xl text-xs font-extrabold leading-none tracking-tight transition-colors duration-150 active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue ${
                activeMobileIndex === 4
                  ? "text-white"
                  : "text-black hover:bg-neutral-100"
              }`}
            >
              <span className="relative w-5 h-5 inline-flex items-center justify-center">
                <AnimatePresence initial={false}>
                  {showMoreSyncIcon ? (
                    <motion.span
                      key="more-sync"
                      aria-hidden="true"
                      initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.6, rotate: 90 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 inline-flex items-center justify-center"
                    >
                      <RefreshCw className="w-6 h-6 stroke-[2.5] animate-spin" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="more-grid"
                      aria-hidden="true"
                      initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.6, rotate: 90 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 inline-flex items-center justify-center"
                    >
                      <AlignJustify className="w-6 h-6 stroke-[2.5]" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              {hasUpdate && (
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 right-2.5 w-2 h-2 rounded-full ${
                    activeMobileIndex === 4 ? "bg-paper" : "bg-neo-blue"
                  }`}
                />
              )}
            </button>
          </div>
        </nav>
      </div>

      <SyncStatusSummaryDialog
        open={mobileSyncDialogOpen}
        onOpenChange={setMobileSyncDialogOpen}
        steps={syncSteps}
        isSyncing={isSyncing || Boolean(activeSyncStep)}
        lastSyncedAt={lastSyncedAt ?? null}
      />
    </>
  );
};
