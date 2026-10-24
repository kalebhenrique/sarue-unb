import React, { useState } from 'react';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { CoursesScreen } from './screens/CoursesScreen';
import { GradeBuilderScreen } from './screens/GradeBuilderScreen';
import { MyCourseScreen } from './screens/MyCourseScreen';
import { ProfessorEvaluationsScreen } from './screens/ProfessorEvaluationsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Sidebar, type NavTab } from './components/Sidebar';
import { TooltipProvider, Toaster, ErrorBoundary } from '@/components/ui';
import { useCredentials } from './hooks/useCredentials';
import { useUpdateAvailable } from './hooks/useAppUpdater';
import { SyncProvider, useSync } from './context/SyncContext';
import { DeadlineProvider } from './context/DeadlineContext';
import { WelcomeSyncDialog } from './components/onboarding/WelcomeSyncDialog';
import { WithdrawalDeadlineDialog } from './components/notifications/WithdrawalDeadlineDialog';
import { useContainer } from './context/ContainerContext';
import type { AcademicCalendar } from './core';
import { NAVIGATE_EVENT } from './lib/utils';
import { initSoundEffectsListener } from './lib/sound-effects';
import { AccessibilityProvider } from './context/AccessibilityContext';

type AppStep = 'onboarding' | 'main';

const AppShell: React.FC = () => {
  const { repos, useCases } = useContainer();
  const { hasCredentials, isLoading: isCheckingAuth, allCredentials } = useCredentials();
  const { syncAll, isSyncing, lastSyncedAt, steps: syncSteps } = useSync();
  const hasUpdateAvailable = useUpdateAvailable();

  // Plataformas de fato conectadas (ordem do cofre), para o dialog de boas-vindas
  const connectedPlatforms = [
    allCredentials.sigaa ? 'SIGAA' : null,
    allCredentials.aprender3 ? 'Aprender 3' : null,
    allCredentials.teams?.isConnected ? 'Microsoft Teams' : null,
  ].filter((p): p is string => Boolean(p));

  const [step, setStep] = useState<AppStep>('onboarding');
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
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
  }, [repos]);

  // Usuário recorrente pula o onboarding na abertura do app: credenciais salvas
  // (entra sincronizando) ou, como fallback, dados locais de uso anterior (modo
  // local: reconectar contas em Configurações). Roda uma vez no boot apenas:
  // conectar uma plataforma durante o onboarding não deve ejectar o usuário
  // para o app principal no meio do wizard.
  const bootstrapped = React.useRef(false);
  React.useEffect(() => {
    if (isCheckingAuth || hasLocalData === null || bootstrapped.current) return;
    bootstrapped.current = true;
    if (hasCredentials) {
      setStep('main');
      // Sessão restabelecida: atualiza os dados locais em segundo plano
      void syncAll();
    } else if (hasLocalData) {
      setStep('main');
    }
  }, [isCheckingAuth, hasLocalData, hasCredentials, syncAll]);

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

  // A tela de verificação existe só para o arranque do app. Depois do boot, o
  // loadAll disparado por um save (ex.: conectar SIGAA no onboarding) acende
  // isLoading nesta instância também — renderizar o loading aqui desmontaria
  // o wizard e resetaria o onboarding para o passo 1.
  if ((isCheckingAuth || hasLocalData === null) && !bootstrapped.current) {
    return (
      <div className="min-h-full bg-canvas bg-grid flex flex-col items-center justify-center space-y-4">
        <img
          src="/sarue-logo.png"
          alt="Saruê UnB"
          className="w-12 h-12 object-cover border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_#000]"
        />
        <div className="inline-block animate-spin border-2 border-black border-t-transparent rounded-full h-6 w-6" />
        <p className="text-xs font-bold text-neutral-700">
          Verificando Cofre Seguro...
        </p>
      </div>
    );
  }

  // Fluxo 1: Onboarding animado em 4 passos (bem-vindo, funcionalidades, segurança, login)
  // Sem teste de hasCredentials aqui: conectar uma plataforma dentro do wizard acende
  // hasCredentials e, se o gate testasse, renderizaria o app principal por cima do wizard.
  if (step === 'onboarding') {
    return (
      <OnboardingScreen
        onComplete={() => {
          setStep('main');
          // Ritual pós-cadastro: dialog abre; popover abre quando o dialog é dispensado
          setWelcomeOpen(true);
          syncAll();
        }}
        onExplore={() => setStep('main')}
      />
    );
  }

  // Fluxo 3: Aplicação Principal (Dashboard com Sidebar Colapsável)
  return (
    <DeadlineProvider>
    <div className="flex h-full bg-canvas bg-grid overflow-hidden">
      {/* Sidebar Colapsável com Botão de Sincronização no Canto Inferior */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        isSyncing={isSyncing}
        onSync={syncAll}
        lastSyncedAt={lastSyncedAt}
        hasConnectedAccounts={Boolean(hasCredentials)}
        hasUpdateAvailable={hasUpdateAvailable}
        syncSteps={syncSteps}
        syncPopoverOpen={syncPopoverOpen}
        onSyncPopoverOpenChange={setSyncPopoverOpen}
      />

      {/* Área Central de Conteúdo (Sem Header global, títulos direto no corpo) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <ErrorBoundary key={currentTab} onReset={() => setCurrentTab('home')}>
            {currentTab === 'home' && <DashboardScreen />}
            {currentTab === 'courses' && <CoursesScreen />}
            {currentTab === 'grade' && <GradeBuilderScreen />}
            {currentTab === 'my-course' && <MyCourseScreen />}
            {currentTab === 'evaluations' && <ProfessorEvaluationsScreen />}
            {currentTab === 'settings' && (
              <SettingsScreen
                onResetCredentials={() => {
                  setStep('onboarding');
                  setCurrentTab('home');
                }}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>
      <WelcomeSyncDialog
        open={welcomeOpen}
        onOpenChange={(open) => {
          setWelcomeOpen(open);
          if (!open) setSyncPopoverOpen(true);
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
    <SyncProvider>
      <TooltipProvider delay={150}>
        <Toaster />
        <AppShell />
      </TooltipProvider>
    </SyncProvider>
  </AccessibilityProvider>
);

export { App };
