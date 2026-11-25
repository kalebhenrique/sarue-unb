import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../container';
import {
  DEMO_COURSES,
  DEMO_FEED_ITEMS,
  DEMO_SAVED_GRADE,
} from '../seeds/demo-data.seed';

describe('EnterDemoModeUseCase - Modo Demonstracao', () => {
  let container: ReturnType<typeof createContainer>;

  beforeEach(async () => {
    container = createContainer();
    await container.repos.feedRepo.clear();
  });

  it('semeia turmas e itens do feed com os dados ficticios', async () => {
    await container.useCases.enterDemoMode.execute();

    const courses = await container.repos.feedRepo.getCourses();
    expect(courses.map((c) => c.id).sort()).toEqual(
      DEMO_COURSES.map((c) => c.id).sort()
    );

    const items = await container.repos.feedRepo.getItems();
    expect(items.map((i) => i.id).sort()).toEqual(
      DEMO_FEED_ITEMS.map((i) => i.id).sort()
    );
  });

  it('semeia perfil academico, cenario de IRA e grade salva', async () => {
    await container.useCases.enterDemoMode.execute();

    const profile = await container.repos.academicProfileRepo.getProfile();
    expect(profile?.matricula).toBe('202000000');
    expect(profile?.studentName).toBe('Discente Demonstração');
    expect((profile?.completedDisciplines.length ?? 0)).toBeGreaterThan(0);

    const scenario = await container.repos.iraScenarioRepo.getScenario();
    expect(scenario?.semesters.length).toBeGreaterThan(0);
    expect(scenario?.profileSignature).toBeTruthy();

    const grade = await container.repos.gradeRepo.getSavedGrade(
      DEMO_SAVED_GRADE.semester
    );
    expect(grade?.id).toBe('demo-grade-current');
    expect(grade?.selectedClasses.length).toBeGreaterThan(0);
  });
});

describe('isDemoSigaaCredentials - porta do revisor', () => {
  it('aceita o par de credenciais de teste e recusa as demais', async () => {
    const { isDemoSigaaCredentials } = await import('../infrastructure/demo-mode.service');
    expect(isDemoSigaaCredentials('123456789', '#SarueTest123@')).toBe(true);
    expect(isDemoSigaaCredentials(' 123456789 ', '#SarueTest123@')).toBe(true);
    expect(isDemoSigaaCredentials('123456789', 'senha-errada')).toBe(false);
    expect(isDemoSigaaCredentials('202012345', '#SarueTest123@')).toBe(false);
  });
});
