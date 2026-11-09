import React, { useState } from 'react';
import { ArrowLeft, Calculator, Plus, RotateCcw, Settings } from 'lucide-react';
import { useMyCourse } from '@/hooks/useMyCourse';
import { useContainer } from '@/context/ContainerContext';
import {
  PageContainer,
  PageHeader,
  Button,
  EmptyState,
} from '@/components/ui';
import { MyCourseSkeleton } from '@/components/course';
import {
  IraResultPanel,
  IraSemesterCard,
} from '@/components/ira';
import type {
  IraMention,
  IraScenario,
} from '@/core';
import {
  CalculateIraUseCase,
  MAX_DISCIPLINES_PER_SEMESTER,
  MAX_FUTURE_SEMESTERS,
  scenarioProfileSignature,
} from '@/core';

const IRA_CALCULATOR_INSTANCE = new CalculateIraUseCase();

function stripScenario(s: IraScenario | null | undefined): string {
  if (!s) return "";
  return JSON.stringify({
    semesters: s.semesters || [],
    baseTrancadasObrigatorias: s.baseTrancadasObrigatorias || 0,
    baseTrancadasOptativas: s.baseTrancadasOptativas || 0,
    extraTrancadasObrigatorias: s.extraTrancadasObrigatorias || 0,
    extraTrancadasOptativas: s.extraTrancadasOptativas || 0,
  });
}

/**
 * Cache de sessão do cenário: reabrir a calculadora na mesma sessão renderiza
 * na hora (mesma receita do cachedViewMode do Meu Curso); o bootstrap segue
 * validando contra o storage e troca o conteúdo no lugar, sem flash.
 */
let cachedIraScenario: IraScenario | null = null;

export interface IraCalculatorScreenProps {
  onBack: () => void;
  /** Abre a aba de Configurações (o estado vazio sem histórico ganha porta de saída). */
  onOpenSettings?: () => void;
}

export const IraCalculatorScreen: React.FC<IraCalculatorScreenProps> = ({ onBack, onOpenSettings }) => {
  const { profile, curriculum, isLoading } = useMyCourse();
  const { useCases } = useContainer();

  const [scenario, setScenario] = useState<IraScenario | null>(cachedIraScenario);
  const [hydrated, setHydrated] = useState(false);
  const [hasSavedScenario, setHasSavedScenario] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Carrega o cenário salvo uma única vez; sem cenário salvo, monta o cenário
  // real do histórico. Espera o perfil carregar (useMyCourse com cache quente
  // resolve na hora, sem skeleton).
  React.useEffect(() => {
    if (bootstrapped || isLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await useCases.manageIraScenario.get();
        if (cancelled) return;
        // Cenário salvo só vale se veio do mesmo conteúdo de histórico; perfil
        // novo (menções, trancadas, períodos) reconstrói o cenário real.
        if (
          saved &&
          Array.isArray(saved.semesters) &&
          profile &&
          saved.profileSignature === scenarioProfileSignature(profile)
        ) {
          setScenario(saved);
          setHasSavedScenario(true);
        } else if (profile) {
          setScenario(useCases.buildIraScenario.execute(profile, curriculum));
        }
      } catch (err) {
        console.warn('[IraCalculatorScreen] Erro ao carregar cenário:', err);
        if (profile) {
          try {
            setScenario(useCases.buildIraScenario.execute(profile, curriculum));
          } catch (buildErr) {
            console.warn('[IraCalculatorScreen] Erro ao reconstruir cenário real:', buildErr);
          }
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
          setBootstrapped(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapped, isLoading, profile, curriculum, useCases]);

  // Cenário real do perfil — referência para detectar edição e restaurar.
  const realScenario = React.useMemo(() => {
    if (!profile) return null;
    return useCases.buildIraScenario.execute(profile, curriculum);
  }, [profile, curriculum, useCases]);

  const isSimulation = React.useMemo(
    () =>
      Boolean(scenario && realScenario && stripScenario(scenario) !== stripScenario(realScenario)),
    [scenario, realScenario],
  );

  // Auto-save com debounce quando o cenário difere do histórico real; ao
  // voltar ao cenário real, o cenário salvo sai do dispositivo — sem isso,
  // remover o planejamento inteiro "reaparecia" depois de recarregar.
  React.useEffect(() => {
    if (!hydrated || !scenario) return;
    if (!isSimulation) {
      if (hasSavedScenario) {
        useCases.manageIraScenario.clear();
        setHasSavedScenario(false);
      }
      return;
    }
    const t = setTimeout(() => {
      useCases.manageIraScenario.save(scenario);
      setHasSavedScenario(true);
    }, 600);
    return () => clearTimeout(t);
  }, [scenario, hydrated, isSimulation, hasSavedScenario, useCases]);

  // Fator de correção baseado no IRA oficial do discente que veio do histórico do SIGAA
  const correctionOffset = React.useMemo(() => {
    if (profile?.ira == null || !Number.isFinite(profile.ira) || !realScenario) return 0;
    const baseCalc = IRA_CALCULATOR_INSTANCE.execute(realScenario, 0);
    if (baseCalc.rawIra == null || !Number.isFinite(baseCalc.rawIra)) return 0;
    return profile.ira - baseCalc.rawIra;
  }, [profile?.ira, realScenario]);

  const calculation = React.useMemo(
    () => (scenario ? IRA_CALCULATOR_INSTANCE.execute(scenario, correctionOffset) : null),
    [scenario, correctionOffset],
  );

  // Contagem de semestres futuros já planejados (limita o tile de adicionar).
  const futureCount = scenario?.semesters.filter((s) => s.kind === 'future').length ?? 0;
  const canAddFutureSemester = futureCount < MAX_FUTURE_SEMESTERS;

  // Cache de sessão sempre espelha o cenário atual.
  React.useEffect(() => {
    cachedIraScenario = scenario;
  }, [scenario]);

  // --- Handlers do cenário (atualizações imutáveis) ---

  const updateScenario = React.useCallback(
    (updater: (prev: IraScenario) => IraScenario) => {
      setScenario((prev) => (prev ? updater(prev) : prev));
    },
    [],
  );

  const handleMentionChange = React.useCallback(
    (disciplineId: string, mention: IraMention) => {
      updateScenario((prev) => ({
        ...prev,
        semesters: prev.semesters.map((sem) => ({
          ...sem,
          disciplines: sem.disciplines.map((d) =>
            d.id === disciplineId ? { ...d, mention } : d,
          ),
        })),
      }));
    },
    [updateScenario],
  );

  const handleRemoveDiscipline = React.useCallback(
    (disciplineId: string) => {
      updateScenario((prev) => ({
        ...prev,
        semesters: prev.semesters.map((sem) => ({
          ...sem,
          disciplines: sem.disciplines.filter((d) => d.id !== disciplineId),
        })),
      }));
    },
    [updateScenario],
  );

  const handleUpdateCredits = React.useCallback(
    (disciplineId: string, credits: number) => {
      updateScenario((prev) => ({
        ...prev,
        semesters: prev.semesters.map((sem) => ({
          ...sem,
          disciplines: sem.disciplines.map((d) =>
            d.id === disciplineId ? { ...d, credits } : d,
          ),
        })),
      }));
    },
    [updateScenario],
  );

  const handleAddDiscipline = React.useCallback(
    (semesterId: string) => {
      updateScenario((prev) => {
        const target = prev.semesters.find((sem) => sem.id === semesterId);
        if (!target || target.disciplines.length >= MAX_DISCIPLINES_PER_SEMESTER) return prev;
        return {
          ...prev,
          semesters: prev.semesters.map((sem) =>
            sem.id === semesterId
              ? {
                  ...sem,
                  disciplines: [
                    ...sem.disciplines,
                    {
                      id: `added:${Date.now()}`,
                      name: 'Disciplina',
                      credits: 4,
                      mention: null,
                      origin: 'added' as const,
                    },
                  ],
                }
              : sem,
          ),
        };
      });
    },
    [updateScenario],
  );

  const handleAddFutureSemester = React.useCallback(() => {
    updateScenario((prev) => {
      const futureCount = prev.semesters.filter((s) => s.kind === 'future').length;
      return {
        ...prev,
        semesters: [
          ...prev.semesters,
          {
            id: `future:${Date.now()}`,
            label: futureCount === 0 ? 'Próximo semestre' : `Semestre futuro ${futureCount + 1}`,
            kind: 'future' as const,
            disciplines: [],
          },
        ],
      };
    });
  }, [updateScenario]);

  const handleRemoveFutureSemester = React.useCallback(
    (semesterId: string) => {
      updateScenario((prev) => ({
        ...prev,
        semesters: prev.semesters.filter(
          (s) => !(s.id === semesterId && s.kind === 'future'),
        ),
      }));
    },
    [updateScenario],
  );

  const handleRetryBootstrap = React.useCallback(() => {
    setScenario(null);
    setHydrated(false);
    setBootstrapped(false);
  }, []);

  const handleRestore = React.useCallback(async () => {
    await useCases.manageIraScenario.clear();
    setScenario(useCases.buildIraScenario.execute(profile!, curriculum));
    setHasSavedScenario(false);
  }, [useCases, profile, curriculum]);

  // --- Render ---

  const backButton = (
    <Button variant="outline" size="sm" onClick={onBack}>
      <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
      Voltar para Meu Curso
    </Button>
  );

  if (isLoading && !profile) {
    return (
      <PageContainer>
        <MyCourseSkeleton />
      </PageContainer>
    );
  }

  if (!profile) {
    return (
      <PageContainer>
        <PageHeader title="Calculadora de IRA" icon={Calculator} actions={backButton} />
        <EmptyState
          title="Nenhum Perfil Acadêmico Carregado"
          description={
            <>
              Sincronize com o SIGAA na aba <strong>Configurações</strong> para
              carregar seu histórico e calcular seu IRA.
            </>
          }
          action={
            onOpenSettings ? (
              <Button variant="primary" size="sm" onClick={onOpenSettings}>
                <Settings className="w-4 h-4 stroke-[2.5]" />
                Abrir Configurações
              </Button>
            ) : undefined
          }
          className="mb-6"
        />
      </PageContainer>
    );
  }

  // Bootstrap em andamento (cenário frio na primeira entrada): skeleton da
  // tela, nunca flash de estado vazio.
  if (!hydrated && !scenario) {
    return (
      <PageContainer>
        <MyCourseSkeleton />
      </PageContainer>
    );
  }

  // Cenário ausente ou falha de construção (bootstrap já concluiu): estado de
  // erro com retry, nunca página em branco nem flash.
  if (hydrated && (!scenario || !calculation)) {
    return (
      <PageContainer>
        <PageHeader title="Calculadora de IRA" icon={Calculator} actions={backButton} />
        <EmptyState
          title="Não foi possível montar o cenário"
          description="Ocorreu um erro ao construir o cenário a partir do seu histórico. Seus dados continuam salvos — tente carregar de novo."
          action={
            <Button variant="outline" size="sm" onClick={handleRetryBootstrap}>
              <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
              Tentar novamente
            </Button>
          }
          className="mb-6"
        />
      </PageContainer>
    );
  }

  // Grade de semestres + tile de semestre futuro — o corpo principal
  return (
    <PageContainer>
      <PageHeader
        title="Calculadora de IRA"
        icon={Calculator}
        actions={backButton}
      />

      <IraResultPanel
        calculation={calculation}
        sigaaIra={profile.ira}
        isSimulation={isSimulation}
        canRestore={hasSavedScenario && isSimulation}
        onRestore={handleRestore}
      />

      {/* Grade de semestres: 4 colunas no desktop (padrão lg da plataforma) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {scenario.semesters.map((sem) => (
          <IraSemesterCard
            key={sem.id}
            semester={sem}
            semesterIra={calculation.semesterIras[sem.id] ?? null}
            onMentionChange={handleMentionChange}
            onRemoveDiscipline={handleRemoveDiscipline}
            onUpdateCredits={handleUpdateCredits}
            onAddDiscipline={() => handleAddDiscipline(sem.id)}
            onRemoveSemester={sem.kind === 'future' ? () => handleRemoveFutureSemester(sem.id) : undefined}
          />
        ))}

        <button
          type="button"
          onClick={handleAddFutureSemester}
          disabled={!canAddFutureSemester}
          title={canAddFutureSemester ? undefined : `Limite de ${MAX_FUTURE_SEMESTERS} semestres futuros`}
          className="min-h-[8rem] rounded-lg border-2 border-dashed border-black/15 bg-neutral-50 hover:bg-neutral-100 cursor-pointer text-[11px] font-black text-neutral-600 hover:text-black transition-[background-color,transform] inline-flex flex-col items-center justify-center gap-1.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-50 disabled:hover:text-neutral-600 disabled:active:translate-y-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          Adicionar semestre futuro
        </button>
      </div>
    </PageContainer>
  );
};
