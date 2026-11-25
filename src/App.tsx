import React, { useState } from 'react';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { CoursesScreen } from './screens/CoursesScreen';
import { GradeBuilderScreen } from './screens/GradeBuilderScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { MyCourseScreen } from './screens/MyCourseScreen';
import { ProfessorEvaluationsScreen } from './screens/ProfessorEvaluationsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { RuScreen } from './screens/RuScreen';
import { WalletScreen } from './screens/WalletScreen';
import { Sidebar, type NavTab } from './components/Sidebar';
import { AppBootSkeleton } from './components/boot/AppBootSkeleton';
import { TooltipProvider, Toaster, ErrorBoundary } from '@/components/ui';
import { useCredentials } from './hooks/useCredentials';
import { useUpdateAvailable } from './hooks/useAppUpdater';
import { useDesktopRuSidebar } from './hooks/useDesktopRuSidebar';
import { useMediaQuery } from './hooks/useMediaQuery';
import { SyncProvider, useSync } from './context/SyncContext';
import { DeadlineProvider } from './context/DeadlineContext';
import { WelcomeSyncDialog } from './components/onboarding/WelcomeSyncDialog';
import { FeedbackWidget } from './components/feedback/FeedbackWidget';
import { WithdrawalDeadlineDialog } from './components/notifications/WithdrawalDeadlineDialog';
import { useContainer } from './context/ContainerContext';
import {
  setOnboardingNotificationsBlocked,
  isDemoModeActive,
  type AcademicCalendar,
} from './core';
import { NAVIGATE_EVENT } from './lib/utils';
import { initSoundEffectsListener } from './lib/sound-effects';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { ThemeProvider } from './context/ThemeContext';

type AppStep = 'onboarding' | 'main';

/** Nome em pt-BR de cada aba — vai nos dados opt-in do feedback. */
const SCREEN_LABELS: Record<NavTab, string> = {
  home: 'Início',
  courses: 'Disciplinas',
  ru: 'Cardápio RU',
  wallet: 'Carteirinha',
  grade: 'Montar Grade',
  calendar: 'Calendário',
  evaluations: 'Docentes',
  'my-course': 'Meu Curso',
  notifications: 'Notificações',
  settings: 'Configurações',
};

const AppShell: React.FC = () => {
  const { repos, useCases } = useContainer();
  const { hasCredentials, isLoading: isCheckingAuth, allCredentials } = useCredentials();
  const { syncAll, isSyncing, isSlowConnection, lastSyncedAt, steps: syncSteps } = useSync();
  const hasUpdateAvailable = useUpdateAvailable();

  // Plataformas de fato conectadas (ordem do cofre), para o dialog de boas-vindas
  const connectedPlatforms = [
    allCredentials.sigaa ? 'SIGAA' : null,
    allCredentials.aprender3 ? 'Aprender 3' : null,
    allCredentials.teams?.isConnected ? 'Microsoft Teams' : null,
  ].filter((p): p is string => Boolean(p));

  const [step, setStep] = useState<AppStep>('onboarding');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { isHidden: isRuHiddenInDesktop } = useDesktopRuSidebar();
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const mainRef = React.useRef<HTMLElement | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [currentCalendar, setCurrentCalendar] = useState<AcademicCalendar | null>(null);
  // Indica se o app já foi usado antes: perfil acadêmico salvo ou cursos no
  // feed (SQLite persistente) provam uma sessão anterior, mesmo que o cofre
  // de credenciais esteja vazio ou indisponível.
  const [hasLocalData, setHasLocalData] = useState<boolean | null>(null);
  // Ritual pós-cadastro: dialog de boas-vindas abre ao entrar; ao dispensá-lo,
  // o popover de andamento abre ancorado no botão de Sincronização da Sidebar.
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false);
  // Modo Demonstração: entrado pelo botão do onboarding ou restaurado no boot
  // (fast-path de dados locais) para o badge da Sidebar e o banner de Settings.
  const [isDemoMode, setIsDemoMode] = useState(() => isDemoModeActive());

  // Inicializa o feedback sonoro de cliques mecânicos
  React.useEffect(() => {
    return initSoundEffectsListener();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const calendars = await useCases.getAcademicCalendar.execute();
        if (!cancelled && calendars.length > 0) {
          const current = calendars.find((c) => c.isCurrent) || calendars[0];
          setCurrentCalendar(current);
        }

        const profile = await repos.academicProfileRepo.getProfile();
        if (cancelled) return;
        if (profile) {
          setHasLocalData(true);
          return;
        }
        const courses = await repos.feedRepo.getCourses();
        if (!cancelled) setHasLocalData(courses.length > 0);
      } catch {
        if (!cancelled) setHasLocalData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repos, useCases.getAcademicCalendar]);

  React.useEffect(() => {
    setOnboardingNotificationsBlocked(step === 'onboarding');
  }, [step]);

  // Carteirinha é exclusiva do mobile; Cardápio RU pode ser ocultado na sidebar desktop
  React.useEffect(() => {
    if (!isMobile && currentTab === 'wallet') {
      setCurrentTab('home');
    } else if (!isMobile && isRuHiddenInDesktop && currentTab === 'ru') {
      setCurrentTab('home');
    }
  }, [isMobile, isRuHiddenInDesktop, currentTab]);

  // Usuário recorrente pula o onboarding na abertura do app: credenciais salvas
  // ou dados locais de uso anterior entram direto em 'main' usando o cache do
  // SQLite, sem forçar sync imediato (confia no ciclo de 6h e no botão manual).
  // Roda uma vez no boot apenas: conectar uma plataforma durante o onboarding
  // não deve ejectar o usuário para o app principal no meio do wizard.
  // Fast-path Tauri 2: se o SQLite já confirmou dados locais (hasLocalData === true),
  // entra em 'main' imediatamente sem ficar preso no AppBootSkeleton esperando o
  // Argon2id do Stronghold terminar.
  // useLayoutEffect: a decisão de entrar em 'main' precisa acontecer antes do
  // paint. Com useEffect, o frame em que hasLocalData vira false (mas
  // hasCredentials ainda é true) pintaria o OnboardingScreen por um instante
  // (flick) antes do efeito rodar.
  const bootstrapped = React.useRef(false);
  React.useLayoutEffect(() => {
    if (bootstrapped.current) return;
    if (hasLocalData === true) {
      bootstrapped.current = true;
      setOnboardingNotificationsBlocked(false);
      setStep('main');
      return;
    }
    if (isCheckingAuth || hasLocalData === null) return;
    bootstrapped.current = true;
    if (hasCredentials) {
      setOnboardingNotificationsBlocked(false);
      setStep('main');
    }
  }, [isCheckingAuth, hasLocalData, hasCredentials]);

  // Reseta o scroll do container <main> antes do paint sempre que a aba muda
  React.useLayoutEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentTab, step]);

  const handleSelectTab = React.useCallback(
    (tab: NavTab) => {
      if (tab === currentTab) {
        mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setCurrentTab(tab);
    },
    [currentTab],
  );

  // Navegação disparada por componentes fora da árvore de tabs (ex.: sino de prazos)
  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string }>).detail;
      if (detail?.tab) {
        setCurrentTab(detail.tab as NavTab);
      }
    };
    window.addEventListener(NAVIGATE_EVENT, handler);
    return () => window.removeEventListener(NAVIGATE_EVENT, handler);
  }, []);

  // A tela de verificação existe só para o arranque do app. Com o fast-path,
  // se o SQLite já encontrou dados locais (hasLocalData === true), não bloqueia
  // esperando o Argon2id do Stronghold.
  if (!bootstrapped.current && (hasLocalData === null || (hasLocalData === false && isCheckingAuth))) {
    return <AppBootSkeleton />;
  }

  // Fluxo 1: Onboarding animado em 4 passos (bem-vindo, funcionalidades, segurança, login)
  // Sem teste de hasCredentials aqui: conectar uma plataforma dentro do wizard acende
  // hasCredentials e, se o gate testasse, renderizaria o app principal por cima do wizard.
  if (step === 'onboarding') {
    return (
      <OnboardingScreen
        onComplete={() => {
          setOnboardingNotificationsBlocked(false);
          setIsDemoMode(isDemoModeActive());
          setStep('main');
          // Ritual pós-cadastro: dialog abre; no desktop o popover abre ao dispensar o dialog
          setWelcomeOpen(true);
          syncAll();
        }}
        onExplore={() => {
          setOnboardingNotificationsBlocked(false);
          setIsDemoMode(isDemoModeActive());
          setStep('main');
        }}
      />
    );
  }

  // Fluxo 3: Aplicação Principal (Dashboard com Sidebar Colapsável)
  return (
    <DeadlineProvider>
    <Toaster />
    <div className="flex flex-col md:flex-row h-full bg-canvas bg-grid overflow-hidden">
      {/* Sidebar Colapsável com Botão de Sincronização no Canto Inferior */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        isSyncing={isSyncing}
        isSlowConnection={isSlowConnection}
        onSync={syncAll}
        lastSyncedAt={lastSyncedAt}
        hasConnectedAccounts={Boolean(hasCredentials) || isDemoMode}
        hasUpdateAvailable={hasUpdateAvailable}
        isDemoMode={isDemoMode}
        syncSteps={syncSteps}
        syncPopoverOpen={!isMobile && syncPopoverOpen}
        onSyncPopoverOpenChange={setSyncPopoverOpen}
      />

      {/* Área Central de Conteúdo (Sem Header global, títulos direto no corpo) */}
      <div className="order-1 md:order-none flex-1 flex flex-col min-h-0 overflow-hidden">
        <main ref={mainRef} className="flex-1 overflow-y-auto px-2.5 pt-3 pb-6 md:px-4 md:py-8">
          <ErrorBoundary key={currentTab} onReset={() => setCurrentTab('home')}>
            {currentTab === 'home' && <DashboardScreen />}
            {currentTab === 'courses' && <CoursesScreen />}
            {currentTab === 'ru' && <RuScreen />}
            {currentTab === 'wallet' && isMobile && <WalletScreen />}
            {currentTab === 'grade' && <GradeBuilderScreen />}
            {currentTab === 'calendar' && <CalendarScreen />}
            {currentTab === 'my-course' && <MyCourseScreen onOpenSettings={() => setCurrentTab('settings')} />}
            {currentTab === 'evaluations' && <ProfessorEvaluationsScreen />}
            {currentTab === 'notifications' && <NotificationsScreen />}
            {currentTab === 'settings' && (
              <SettingsScreen
                onResetCredentials={() => {
                  setOnboardingNotificationsBlocked(true);
                  setSyncPopoverOpen(false);
                  setWelcomeOpen(false);
                  setIsDemoMode(isDemoModeActive());
                  setStep('onboarding');
                  setCurrentTab('home');
                }}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>
      {/* Feedback flutuante: adesivo de ação no canto inferior direito */}
      <FeedbackWidget screen={SCREEN_LABELS[currentTab]} />
      <WelcomeSyncDialog
        open={welcomeOpen}
        onOpenChange={(open) => {
          setWelcomeOpen(open);
          if (!open && !isMobile) setSyncPopoverOpen(true);
        }}
        platforms={connectedPlatforms}
      />
      <WithdrawalDeadlineDialog calendar={currentCalendar} />
    </div>
    </DeadlineProvider>
  );
};

const App: React.FC = () => (
  <AccessibilityProvider>
    <ThemeProvider>
      <SyncProvider>
        <TooltipProvider delay={150}>
          <AppShell />
        </TooltipProvider>
      </SyncProvider>
    </ThemeProvider>
  </AccessibilityProvider>
);

export { App };
