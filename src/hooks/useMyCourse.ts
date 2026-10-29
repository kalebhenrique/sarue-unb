import { useState, useEffect, useCallback, useMemo } from 'react';
import { useContainer } from '../context/ContainerContext';
import { useCredentials } from './useCredentials';
import { toast } from '@/components/ui';
import {
  preferShiftCompatible,
  resolveCourseIdFromCatalog,
  resolveCurriculumByAdmissionYear,
  shiftFamilyFromSigaaToken,
} from '@/core';
import type {
  StudentAcademicProfile,
  FlowchartData,
  CurriculumStructure,
  IGradeRepository,
} from '@/core';

const myCourseListeners = new Set<() => void>();

export function notifyMyCourseListeners() {
  myCourseListeners.forEach((fn) => fn());
}

/** Resolve o course_id no catálogo com desambiguação de turno. */
export async function resolveCourseIdForProfile(
  profile: StudentAcademicProfile,
  gradeRepo: IGradeRepository,
): Promise<string | null> {
  if (!profile.courseName) return null;
  try {
    const catalog = (await gradeRepo.getCoursesCatalog?.()) || [];
    return resolveCourseIdFromCatalog(catalog, profile.courseName, profile.shift);
  } catch (e) {
    console.warn('[useMyCourse] Não foi possível resolver o curso no catálogo:', e);
    return null;
  }
}

// Cache de sessão para navegação instantânea
let cachedCurricula: CurriculumStructure[] | null = null;
let cachedCurriculaScope: string | null = null;
let cachedProfile: StudentAcademicProfile | null | undefined;
let cachedSelectedCurriculum: CurriculumStructure | null = null;

export function resetMyCourseCache() {
  cachedProfile = null;
  cachedSelectedCurriculum = null;
  notifyMyCourseListeners();
}

export function useMyCourse() {
  const { useCases, repos } = useContainer();
  const { allCredentials } = useCredentials();

  const [profile, setProfile] = useState<StudentAcademicProfile | null>(() => cachedProfile ?? null);
  const [allCurricula, setAllCurricula] = useState<CurriculumStructure[]>(() => cachedCurricula ?? []);
  const [selectedCurriculum, setSelectedCurriculum] = useState<CurriculumStructure | null>(
    () => cachedSelectedCurriculum,
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => cachedProfile === undefined);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const currentProfile = await useCases.manageAcademicProfile.getProfile();

      // Baixa matrizes específicas do curso quando logado
      let curricula: CurriculumStructure[] = [];
      let curriculaScope: string | null = null;
      if (currentProfile) {
        const courseId = await resolveCourseIdForProfile(currentProfile, repos.gradeRepo);
        if (courseId) {
          if (cachedCurricula && cachedCurriculaScope === courseId) {
            curricula = cachedCurricula;
            curriculaScope = courseId;
          } else {
            curricula = await useCases.manageAcademicProfile.getCurriculaForCourse(courseId);
            curriculaScope = curricula.length > 0 ? courseId : null;
          }
        }
      }
      if (curricula.length === 0) {
        curricula =
          cachedCurriculaScope === 'ALL' && cachedCurricula
            ? cachedCurricula
            : await useCases.manageAcademicProfile.getAllCurricula();
        curriculaScope = 'ALL';
      }

      // Fallback: recarrega catálogo completo se a matriz não constar no arquivo do curso
      const curriculumPrefix = currentProfile?.curriculumCode?.match(/^(\d{3,5})\//)?.[1];
      if (
        curriculaScope !== 'ALL' &&
        curriculumPrefix &&
        curricula.length > 0 &&
        !curricula.some((c) => c.code.startsWith(curriculumPrefix))
      ) {
        try {
          curricula = await useCases.manageAcademicProfile.getAllCurricula();
          curriculaScope = 'ALL';
        } catch (e) {
          console.warn('[useMyCourse] Auto-cura com catálogo completo falhou:', e);
        }
      }

      cachedCurricula = curricula;
      cachedCurriculaScope = curriculaScope;
      cachedProfile = currentProfile;
      setAllCurricula(curricula);

      if (currentProfile && curricula.length > 0) {
        // Recupera nomes oficiais para disciplinas sem nome
        let healed = false;
        const missingNameItems = currentProfile.completedDisciplines.filter(
          (cd) => !cd.name || cd.name === cd.code,
        );

        if (missingNameItems.length > 0) {
          const { sharedDisciplineNameMap } = await import(
            '@/core/infrastructure/in-memory-academic-profile.repo'
          );

          for (const cd of missingNameItems) {
            const cachedName = sharedDisciplineNameMap.get(cd.code);
            if (cachedName) {
              cd.name = cachedName;
              healed = true;
            }
          }

          const stillUnresolved = new Set(
            currentProfile.completedDisciplines
              .filter((cd) => !cd.name || cd.name === cd.code)
              .map((cd) => cd.code),
          );

          if (stillUnresolved.size > 0) {
            const catalogNameMap = new Map<string, string>();
            for (const c of curricula) {
              for (const list of [
                c.mandatoryDisciplines,
                c.electiveDisciplines,
                c.complementaryDisciplines,
              ]) {
                if (!list) continue;
                for (const d of list) {
                  if (d.code && d.name && stillUnresolved.has(d.code)) {
                    catalogNameMap.set(d.code, d.name);
                    stillUnresolved.delete(d.code);
                    if (stillUnresolved.size === 0) break;
                  }
                }
                if (stillUnresolved.size === 0) break;
              }
              if (stillUnresolved.size === 0) break;
            }

            for (const cd of currentProfile.completedDisciplines) {
              if (!cd.name || cd.name === cd.code) {
                const realName = catalogNameMap.get(cd.code);
                if (realName) {
                  cd.name = realName;
                  healed = true;
                }
              }
            }
          }
        }

        const stillMissing = currentProfile.completedDisciplines.some((cd) => !cd.name || cd.name === cd.code);
        if (stillMissing && typeof fetch !== 'undefined') {
          try {
            const res = await fetch('/data/classes.json');
            if (res.ok) {
              const classesData = (await res.json()) as Array<{ code: string; name: string }>;
              const classMap = new Map<string, string>();
              for (const cl of classesData) {
                if (cl.code && cl.name && !classMap.has(cl.code)) {
                  classMap.set(cl.code, cl.name);
                }
              }
              for (const cd of currentProfile.completedDisciplines) {
                if (!cd.name || cd.name === cd.code) {
                  const realName = classMap.get(cd.code);
                  if (realName) {
                    cd.name = realName;
                    healed = true;
                  }
                }
              }
            }
          } catch {}
        }

        if (healed) {
          await useCases.manageAcademicProfile.saveProfile(currentProfile);
        }

        setProfile(currentProfile);

        // Resolução de matriz com prioridade para seleção manual
        let matched: CurriculumStructure | undefined;

        if (currentProfile.userSelectedCurriculumCode) {
          matched = curricula.find(
            (c) =>
              c.code === currentProfile.userSelectedCurriculumCode ||
              (currentProfile.userSelectedCurriculumId && c.id === currentProfile.userSelectedCurriculumId)
          );
        }

        if (!matched) {
          if (currentProfile.curriculumCode) {
            matched = curricula.find((c) => c.code === currentProfile.curriculumCode);
          }

          if (matched && currentProfile.chTotalCurriculo) {
            const prefix = currentProfile.curriculumCode!.split('/')[0];
            const byHours = curricula.find(
              (c) => c.code.startsWith(`${prefix}/`) && c.totalHours === currentProfile.chTotalCurriculo,
            );
            if (byHours && matched.totalHours !== currentProfile.chTotalCurriculo) {
              matched = byHours;
            }
          }

          if (!matched && currentProfile.curriculumCode) {
            const prefix = currentProfile.curriculumCode.split('/')[0];
            const candidates = preferShiftCompatible(
              curricula.filter((c) => c.code.startsWith(`${prefix}/`) || c.code.startsWith(prefix)),
              shiftFamilyFromSigaaToken(currentProfile.shift)
            );

            if (currentProfile.chTotalCurriculo) {
              matched = candidates.find((c) => c.totalHours === currentProfile.chTotalCurriculo);
            }

            if (!matched && currentProfile.admissionYear) {
              matched = resolveCurriculumByAdmissionYear(candidates, currentProfile.admissionYear);
            }

            if (!matched) {
              matched =
                candidates.find((c) => c.status === 'Ativa') ||
                candidates[0];
            }
          }

          if (!matched && currentProfile.courseName) {
            const normCourse = currentProfile.courseName.toUpperCase().trim();
            const byName = preferShiftCompatible(
              curricula.filter((c) => c.courseName.toUpperCase().includes(normCourse)),
              shiftFamilyFromSigaaToken(currentProfile.shift)
            );
            if (currentProfile.chTotalCurriculo) {
              matched = byName.find((c) => c.totalHours === currentProfile.chTotalCurriculo);
            }
            if (!matched && currentProfile.admissionYear) {
              matched = resolveCurriculumByAdmissionYear(byName, currentProfile.admissionYear);
            }
            if (!matched) {
              matched = byName.find((c) => c.status === 'Ativa') || byName[0];
            }
          }
        }

        cachedSelectedCurriculum = matched || curricula[0];
        setSelectedCurriculum(cachedSelectedCurriculum);
      } else {
        setProfile(currentProfile);
        if (curricula.length > 0) {
          cachedSelectedCurriculum = curricula[0];
          setSelectedCurriculum(cachedSelectedCurriculum);
        }
      }
    } catch (e) {
      console.error('[useMyCourse] Erro ao carregar dados:', e);
      toast.add({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar a matriz curricular.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [useCases, repos]);

  useEffect(() => {
    loadData();

    const listener = () => {
      loadData();
    };
    myCourseListeners.add(listener);

    return () => {
      myCourseListeners.delete(listener);
    };
  }, [loadData]);

  const activeCurriculum = useMemo(() => {
    if (profile?.customCurriculum) {
      return profile.customCurriculum;
    }
    return selectedCurriculum;
  }, [profile?.customCurriculum, selectedCurriculum]);

  const flowchartData: FlowchartData | null = useMemo(() => {
    if (!activeCurriculum || !profile) return null;
    return useCases.getFlowchart.execute(activeCurriculum, profile, allCurricula);
  }, [activeCurriculum, profile, allCurricula, useCases]);

  const disciplineNames: Map<string, string> = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allCurricula) {
      for (const d of [
        ...(c.mandatoryDisciplines || []),
        ...(c.electiveDisciplines || []),
        ...(c.complementaryDisciplines || []),
      ]) {
        if (!map.has(d.code)) map.set(d.code, d.name);
      }
    }
    if (activeCurriculum) {
      for (const d of [
        ...(activeCurriculum.mandatoryDisciplines || []),
        ...(activeCurriculum.electiveDisciplines || []),
        ...(activeCurriculum.complementaryDisciplines || []),
      ]) {
        map.set(d.code, d.name);
      }
    }
    for (const d of profile?.completedDisciplines || []) {
      if (d.name && d.name !== d.code) map.set(d.code, d.name);
    }
    return map;
  }, [allCurricula, activeCurriculum, profile]);

  const toggleDiscipline = useCallback(async (code: string, isEffectivelyCompleted?: boolean) => {
    try {
      const updated = await useCases.manageAcademicProfile.toggleDiscipline(code, isEffectivelyCompleted);
      cachedProfile = updated;
      setProfile(updated);
      notifyMyCourseListeners();
      toast.add({
        title: 'Disciplina atualizada',
        description: `Status de ${code} atualizado no seu fluxograma.`,
        type: 'info',
        timeout: 2500,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao alternar disciplina';
      toast.add({
        title: 'Erro',
        description: msg,
        type: 'error',
      });
    }
  }, [useCases]);

  const resetOverrides = useCallback(async () => {
    try {
      const updated = await useCases.manageAcademicProfile.resetManualOverrides();
      cachedProfile = updated;
      setProfile(updated);
      notifyMyCourseListeners();
      toast.add({
        title: 'Marcações redefinidas',
        description: 'Todas as marcações manuais foram desfeitas.',
        type: 'success',
      });
    } catch {
      toast.add({
        title: 'Erro ao redefinir',
        description: 'Não foi possível redefinir as marcações.',
        type: 'error',
      });
    }
  }, [useCases]);

  const syncSigaa = useCallback(async () => {
    const creds = allCredentials.sigaa;
    if (!creds || !creds.matricula || !creds.senha) {
      toast.add({
        title: 'Credenciais do SIGAA não configuradas',
        description: 'Configure sua matrícula e senha nas Configurações para sincronizar.',
        type: 'warning',
      });
      return;
    }

    setIsSyncing(true);
    try {
      const res = await useCases.manageAcademicProfile.syncWithSigaa(creds);
      cachedProfile = res.profile;
      setProfile(res.profile);
      if (res.matchedCurriculum) {
        cachedSelectedCurriculum = res.matchedCurriculum || null;
        setSelectedCurriculum(cachedSelectedCurriculum);
      }
      notifyMyCourseListeners();
      toast.add({
        title: 'Histórico sincronizado com sucesso!',
        description: `${res.profile.courseName} (${res.profile.completedDisciplines.length} disciplinas identificadas).`,
        type: 'success',
        timeout: 5000,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha na conexão com o SIGAA';
      toast.add({
        title: 'Falha ao sincronizar histórico',
        description: msg,
        type: 'error',
        timeout: 6000,
      });
    } finally {
      setIsSyncing(false);
    }
  }, [allCredentials.sigaa, useCases]);

  const selectCurriculum = useCallback(async (curr: CurriculumStructure) => {
    try {
      const updated = await useCases.manageAcademicProfile.setCurriculum(curr);
      cachedProfile = updated;
      setProfile(updated);
      cachedSelectedCurriculum = curr;
      setSelectedCurriculum(curr);
      notifyMyCourseListeners();
      toast.add({
        title: 'Matriz Curricular alterada',
        description: `${curr.courseName} (${curr.code})`,
        type: 'info',
      });
    } catch {
      toast.add({
        title: 'Erro ao alterar matriz',
        description: 'Não foi possível selecionar esta matriz.',
        type: 'error',
      });
    }
  }, [useCases]);

  const saveCustomCurriculum = useCallback(async (curr: CurriculumStructure) => {
    try {
      const updated = await useCases.manageAcademicProfile.saveCustomCurriculum(curr);
      cachedProfile = updated;
      setProfile(updated);
      notifyMyCourseListeners();
      toast.add({
        title: 'Currículo atualizado',
        description: 'Suas alterações no currículo foram salvas com sucesso.',
        type: 'success',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar currículo';
      toast.add({
        title: 'Erro ao salvar currículo',
        description: msg,
        type: 'error',
      });
    }
  }, [useCases]);

  const resetCustomCurriculum = useCallback(async () => {
    try {
      const updated = await useCases.manageAcademicProfile.resetCustomCurriculum();
      cachedProfile = updated;
      setProfile(updated);
      notifyMyCourseListeners();
      toast.add({
        title: 'Currículo restaurado',
        description: 'Seu currículo foi restaurado para a matriz original da UnB.',
        type: 'info',
      });
    } catch {
      toast.add({
        title: 'Erro ao restaurar',
        description: 'Não foi possível restaurar a matriz original.',
        type: 'error',
      });
    }
  }, [useCases]);

  const hoverRelations = useMemo(() => {
    if (!hoveredCode || !flowchartData) {
      return { prereqs: new Set<string>(), postreqs: new Set<string>() };
    }

    const allDiscs: typeof flowchartData.semesters[0]['disciplines'] = [];
    for (const sem of flowchartData.semesters) {
      allDiscs.push(...sem.disciplines);
    }

    const current = allDiscs.find((d) => d.code === hoveredCode);
    const prereqs = new Set(current?.prerequisites || []);
    const postreqs = new Set(current?.unlockedDisciplines || []);

    return { prereqs, postreqs };
  }, [hoveredCode, flowchartData]);

  return {
    profile,
    curriculum: activeCurriculum,
    originalCurriculum: selectedCurriculum,
    hasCustomCurriculum: Boolean(profile?.customCurriculum),
    allCurricula,
    flowchartData,
    disciplineNames,
    isLoading,
    isSyncing,
    hoveredCode,
    setHoveredCode,
    hoverRelations,
    toggleDiscipline,
    resetOverrides,
    saveCustomCurriculum,
    resetCustomCurriculum,
    syncSigaa,
    selectCurriculum,
    reload: loadData,
  };
}
