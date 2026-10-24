import React from "react";
import {
  Home,
  BookOpen,
  CalendarDays,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  GraduationCap,
  Star,
} from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { SyncStatusTooltip } from "./SyncStatusTooltip";
import { DeadlineBell } from "./notifications/DeadlineBell";
import { useUpdateAvailable } from "../hooks/useAppUpdater";
import type { SyncStepInfo } from "../context/SyncContext";

export type NavTab =
  | "home"
  | "courses"
  | "grade"
  | "my-course"
  | "evaluations"
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
    { id: "grade" as NavTab, label: "Montar Grade", icon: CalendarDays },
    { id: "my-course" as NavTab, label: "Meu Curso", icon: GraduationCap },
    { id: "evaluations" as NavTab, label: "Avaliar Professor", icon: Star },
    { id: "settings" as NavTab, label: "Configurações", icon: Settings },
  ];

  const isHomeActive = currentTab === "home";

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
    ? ([
        "sigaa",
        "aprender3",
        "myCourse",
        "teams",
        "ghPages",
        "planilha",
      ] as const)
        .map((id) => syncSteps[id])
        .find((s) => s?.status === "syncing")
    : undefined;

  // Painel do popover: status das plataformas + ação de sincronizar
  // (o status mudou de tooltip no hover para popover no clique — persiste até clique fora)
  const syncPanel = (
    <PopoverPrimitive.Popup
      aria-label="Status da sincronização"
      onMouseEnter={clearCloseTimer}
      onMouseLeave={scheduleSyncPanelClose}
      className="w-80 rounded-lg border-2 border-black bg-canvas overflow-hidden outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
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
    <aside
      className={`group h-full bg-white border-r-2 border-black flex flex-col transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] select-none z-20 shrink-0 overflow-x-hidden ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Topo da Sidebar: header e navegação — a navegação rola quando o
          espaço vertical acaba (zoom alto, janela curta); header e rodapé
          ficam sempre fixos (sanduíche) */}
      <div className="min-h-0 flex-1 flex flex-col">
        {/* Header da Sidebar */}
        <div className="shrink-0 p-4 border-b-2 border-black flex items-center justify-between min-h-[69px] overflow-hidden">
          <div className="flex items-center min-w-0 flex-1">
            {/* Logo e Botão de Expandir no hover quando colapsado */}
            <div className="relative shrink-0 flex items-center justify-center">
              <button
                type="button"
                data-sound={isHomeActive ? undefined : "sidebar"}
                data-no-sound={isHomeActive ? "true" : undefined}
                onClick={() => onSelectTab("home")}
                title="Ir para a Home"
                aria-label="Ir para a Home"
                className={`cursor-pointer w-[42px] h-[42px] border-2 border-black rounded-xl overflow-hidden shadow-[2px_2px_0px_0px_#000] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 flex items-center justify-center bg-white transition-opacity duration-200 ${
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
                className={`cursor-pointer absolute inset-0 w-[42px] h-[42px] items-center justify-center border-2 border-black rounded-xl bg-neo-blue hover:bg-neo-blueHover text-white shadow-[2px_2px_0px_0px_#000] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-opacity duration-200 flex ${
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
                data-sound={isHomeActive ? undefined : "sidebar"}
                data-no-sound={isHomeActive ? "true" : undefined}
                onClick={() => onSelectTab("home")}
                title="Ir para a Home"
                className="cursor-pointer text-left block focus-visible:outline-hidden"
              >
                <span className="font-extrabold text-base tracking-tight whitespace-nowrap text-black block truncate">
                  Saruê <span className="text-[#468AFB]">UnB</span>
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
              className="cursor-pointer p-1.5 border-2 border-black rounded-lg bg-white hover:bg-neutral-100 text-black shadow-[2px_2px_0px_0px_#000] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-[transform,box-shadow,background-color,border-color]"
            >
              <PanelLeftClose className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Lista de Navegação com som fofo/macio tátil (apenas ao alternar para aba inativa) */}
        <nav className="min-h-0 overflow-y-auto border-b-2 border-black">
          <ul className="flex flex-col">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              const isSettingsWithUpdate = item.id === "settings" && hasUpdate;

              return (
                <li
                  key={item.id}
                  className="border-b-2 border-black last:border-b-0"
                >
                  <button
                    type="button"
                    data-sound={isActive ? undefined : "sidebar"}
                    data-no-sound={isActive ? "true" : undefined}
                    onClick={() => onSelectTab(item.id)}
                    title={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className={`cursor-pointer w-full flex items-center select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 focus-visible:ring-offset-white transition-colors duration-150 py-3.5 px-4 overflow-hidden ${
                      isActive
                        ? "bg-neo-blue text-white font-black"
                        : "bg-white text-neutral-800 hover:bg-neutral-100 font-bold"
                    }`}
                  >
                    <div className="w-[42px] h-6 shrink-0 flex items-center justify-center relative">
                      <Icon className="w-5 h-5 stroke-[2.5]" />
                      {isSettingsWithUpdate && isCollapsed && (
                        <span
                          aria-hidden="true"
                          className={`absolute top-0.5 right-2 w-2 h-2 rounded-full ${
                            isActive ? "bg-white" : "bg-neo-blue"
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
                            isActive ? "bg-white" : "bg-neo-blue"
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
      <div className="shrink-0 p-4 border-t-2 border-black overflow-hidden">
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
              open={syncPopoverOpenValue}
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
                    : "cursor-pointer bg-neo-blue hover:bg-neo-blueHover text-white border-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 focus-visible:ring-offset-white shadow-[2px_2px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                }`}
              >
                <RefreshCw
                  className={`w-4 h-4 shrink-0 stroke-[2.5] ${isSyncing || activeSyncStep ? "animate-spin" : ""}`}
                />
                <span
                  className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity,margin] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                    isCollapsed ? "max-w-0 opacity-0 ml-0 pointer-events-none" : "max-w-32 opacity-100 ml-1.5"
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
            isCollapsed ? "max-h-0 opacity-0 mt-0 pointer-events-none" : "max-h-6 opacity-100 mt-2"
          }`}
        >
          <p className="text-[11px] text-neutral-500 font-semibold text-center truncate">
            {formatLastSync(lastSyncedAt)}
          </p>
        </div>
      </div>
    </aside>
  );
};
