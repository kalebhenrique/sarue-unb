import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  RU_NOTIFICATION_ID_MAX,
  RU_NOTIFICATION_ID_MIN,
  buildRuMealNotificationPayload,
  checkAndDisableRuNotificationsOnSemesterEnd,
  findDueRuMealsForTimestamp,
  getNotificationSettings,
  getRuNotificationId,
  loadNotifiedRuMealKeys,
  normalizeNotificationSettings,
  planMobileRuSchedules,
  reconcileFiredMobileRuSchedules,
  ruMealNotificationKey,
  saveNotificationSettings,
  type AcademicCalendar,
  type RawRuDailyMenu,
} from '../index';

const SAMPLE_MENUS: RawRuDailyMenu[] = [
  // Segunda-feira 2026-11-16
  {
    date: '2026-11-16',
    breakfast: [
      { key: 'breakfast_complement', label: 'Complemento padrão', items: ['Ovos mexidos'] },
      { key: 'vegan_complement', label: 'Complemento vegetariano estrito', items: ['Homus'] },
      { key: 'bakery', label: 'Panificação', items: ['Pão francês'] },
      { key: 'fruit', label: 'Fruta', items: ['Mamão'] },
    ],
    lunch: [
      { key: 'main_dish', label: 'Prato principal padrão', items: ['Frango assado'] },
      { key: 'ovolacto_dish', label: 'Opção ovolactovegetariana', items: ['Fricassê com queijo'] },
      { key: 'vegan_dish', label: 'Opção vegetariana estrita', items: ['Moqueca de tofu'] },
      { key: 'side_dish', label: 'Guarnição', items: ['Purê de batata'] },
      { key: 'dessert', label: 'Sobremesa', items: ['Abacaxi'] },
    ],
    dinner: [
      { key: 'main_dish', label: 'Prato principal padrão', items: ['Picadinho bovino'] },
      { key: 'soup', label: 'Sopa', items: ['Canja de legumes'] },
    ],
  },
  // Sábado 2026-11-21
  {
    date: '2026-11-21',
    breakfast: [],
    lunch: [{ key: 'main_dish', label: 'Prato principal padrão', items: ['Feijoada'] }],
    dinner: [],
  },
];

describe('NotificationSettings & RU Menu Notifications', () => {
  it('normaliza entradas parciais e ordena dias da semana corretamente', () => {
    expect(normalizeNotificationSettings(null)).toEqual(
      DEFAULT_NOTIFICATION_SETTINGS,
    );

    const normalized = normalizeNotificationSettings({
      backgroundSync: true,
      ruMenu: {
        enabled: true,
        weekdays: [5, 0, 1, 99, -1, 1],
        meals: { breakfast: false, dinner: false },
      },
    });

    expect(normalized).toEqual({
      deadlines: true,
      backgroundSync: true,
      ruMenu: {
        enabled: true,
        weekdays: [1, 5, 0],
        meals: { breakfast: false, lunch: true, dinner: false },
      },
    });
  });

  it('gera payload formatado e retorna null para refeições vazias', () => {
    const lunchPayload = buildRuMealNotificationPayload(
      SAMPLE_MENUS[0],
      'lunch',
      'Darcy Ribeiro',
    );
    expect(lunchPayload).not.toBeNull();
    expect(lunchPayload?.title).toBe('Almoço no RU · Darcy Ribeiro');
    expect(lunchPayload?.body).toContain('Padrão: Frango assado');
    expect(lunchPayload?.body).toContain('Ovolacto: Fricassê com queijo');
    expect(lunchPayload?.body).toContain('Vegano: Moqueca de tofu');
    expect(lunchPayload?.largeBody).toContain('Guarnição: Purê de batata');
    expect(lunchPayload?.largeBody).toContain('Sobremesa: Abacaxi');

    expect(
      buildRuMealNotificationPayload(SAMPLE_MENUS[1], 'dinner', 'Darcy Ribeiro'),
    ).toBeNull();
  });

  it('detecta refeição devida apenas dentro da janela de Brasília, nos dias/refeições ativos e sem duplicar', () => {
    const settings = {
      enabled: true,
      weekdays: [1, 2, 3, 4, 5] as const,
      meals: { breakfast: true, lunch: true, dinner: false },
    };

    // 10:30 BRT — antes da janela do almoço (10:45)
    expect(
      findDueRuMealsForTimestamp(
        SAMPLE_MENUS,
        { ...settings, weekdays: [...settings.weekdays] },
        'Darcy Ribeiro',
        new Set(),
        new Date('2026-11-16T10:30:00-03:00'),
      ),
    ).toHaveLength(0);

    // 10:45 BRT — dentro da janela do almoço na segunda-feira
    const dueLunch = findDueRuMealsForTimestamp(
      SAMPLE_MENUS,
      { ...settings, weekdays: [...settings.weekdays] },
      'Darcy Ribeiro',
      new Set(),
      new Date('2026-11-16T10:45:00-03:00'),
    );
    expect(dueLunch).toHaveLength(1);
    expect(dueLunch[0].meal).toBe('lunch');
    expect(dueLunch[0].dateIso).toBe('2026-11-16');

    // Deduplicado após envio
    expect(
      findDueRuMealsForTimestamp(
        SAMPLE_MENUS,
        { ...settings, weekdays: [...settings.weekdays] },
        'Darcy Ribeiro',
        new Set([ruMealNotificationKey('Darcy Ribeiro', '2026-11-16', 'lunch')]),
        new Date('2026-11-16T11:30:00-03:00'),
      ),
    ).toHaveLength(0);

    // 17:00 BRT — jantar está desabilitado nas configurações
    expect(
      findDueRuMealsForTimestamp(
        SAMPLE_MENUS,
        { ...settings, weekdays: [...settings.weekdays] },
        'Darcy Ribeiro',
        new Set(),
        new Date('2026-11-16T17:00:00-03:00'),
      ),
    ).toHaveLength(0);

    // Sábado 11:00 BRT — fora dos dias selecionados (Seg-Sex)
    expect(
      findDueRuMealsForTimestamp(
        SAMPLE_MENUS,
        { ...settings, weekdays: [...settings.weekdays] },
        'Darcy Ribeiro',
        new Set(),
        new Date('2026-11-21T11:00:00-03:00'),
      ),
    ).toHaveLength(0);
  });

  it('planeja agendamentos futuros mobile respeitando dias, refeições, horários de Brasília e IDs únicos', () => {
    const planned = planMobileRuSchedules(
      SAMPLE_MENUS,
      {
        enabled: true,
        weekdays: [1, 6],
        meals: { breakfast: true, lunch: true, dinner: true },
      },
      'Gama',
      new Date('2026-11-16T08:00:00-03:00'),
    );

    // Segunda desjejum (06:45) já passou; sábado desjejum/jantar são vazios -> restam segunda almoço, segunda jantar, sábado almoço
    expect(planned.map((p) => `${p.dateIso}:${p.meal}`)).toEqual([
      '2026-11-16:lunch',
      '2026-11-16:dinner',
      '2026-11-21:lunch',
    ]);

    for (const item of planned) {
      expect(item.id).toBeGreaterThanOrEqual(RU_NOTIFICATION_ID_MIN);
      expect(item.id).toBeLessThanOrEqual(RU_NOTIFICATION_ID_MAX);
      expect(item.payload.title).toContain('Gama');
    }

    expect(new Set(planned.map((p) => p.id)).size).toBe(planned.length);
    expect(getRuNotificationId('2026-11-16', 'lunch')).not.toBe(
      getRuNotificationId('2026-11-16', 'dinner'),
    );
  });

  it('evita notificação duplicada às 10:57 quando o alarme agendado para 10:45 já disparou no SO mobile', () => {
    const store = new Map<string, string>();
    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
          return store.size;
        },
      },
    } as unknown as Window & typeof globalThis;

    try {
      const lunchKey = ruMealNotificationKey('Darcy Ribeiro', '2026-11-16', 'lunch');
      const dinnerKey = ruMealNotificationKey('Darcy Ribeiro', '2026-11-16', 'dinner');

      // Simula agendamento prévio no SO para 10:45 e 16:45
      store.set(
        STORAGE_KEYS.RU_SCHEDULED_MEAL_TIMES,
        JSON.stringify({
          [lunchKey]: new Date('2026-11-16T10:45:00-03:00').toISOString(),
          [dinnerKey]: new Date('2026-11-16T16:45:00-03:00').toISOString(),
        }),
      );

      // Usuário abre o app às 10:57 (após o alarme das 10:45 já ter disparado no Android)
      const now1057 = new Date('2026-11-16T10:57:00-03:00');
      reconcileFiredMobileRuSchedules(now1057);

      const notified = loadNotifiedRuMealKeys();
      expect(notified.has(lunchKey)).toBe(true);
      expect(notified.has(dinnerKey)).toBe(false);

      // findDueRuMealsForTimestamp às 10:57 não deve retornar almoço novamente
      const dueAt1057 = findDueRuMealsForTimestamp(
        SAMPLE_MENUS,
        {
          enabled: true,
          weekdays: [1],
          meals: { breakfast: true, lunch: true, dinner: true },
        },
        'Darcy Ribeiro',
        notified,
        now1057,
      );
      expect(dueAt1057).toHaveLength(0);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('desativa notificações do RU ao encerrar o período de aulas (periodoAulas.fim) e permite reativar manualmente nas férias', async () => {
    const store = new Map<string, string>();
    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
          return store.size;
        },
      },
    } as unknown as Window & typeof globalThis;

    try {
      await saveNotificationSettings({
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ruMenu: {
          enabled: true,
          weekdays: [1, 2, 3, 4, 5],
          meals: { breakfast: false, lunch: true, dinner: true },
        },
      });

      const calendar: AcademicCalendar = {
        semester: '2026.2',
        year: '2026',
        period: '2',
        label: '2026 • 2º semestre',
        isCurrent: true,
        periodoAulas: {
          inicio: '2026-08-10',
          fim: '2026-12-14',
          raw: '10/08/2026 a 14/12/2026',
        },
      };

      // No último dia de aula (14/12/2026) ainda não desativa
      const onLastDay = await checkAndDisableRuNotificationsOnSemesterEnd(
        calendar,
        new Date('2026-12-14T12:00:00-03:00'),
      );
      expect(onLastDay).toBe(false);
      expect(getNotificationSettings().ruMenu.enabled).toBe(true);

      // No dia seguinte ao fim das aulas (15/12/2026), desativa automaticamente
      const afterEnd = await checkAndDisableRuNotificationsOnSemesterEnd(
        calendar,
        new Date('2026-12-15T09:00:00-03:00'),
      );
      expect(afterEnd).toBe(true);
      expect(getNotificationSettings().ruMenu.enabled).toBe(false);

      // Se o estudante reativar manualmente nas férias, não desativa novamente no mesmo semestre
      await saveNotificationSettings({
        ...getNotificationSettings(),
        ruMenu: {
          ...getNotificationSettings().ruMenu,
          enabled: true,
        },
      });
      const secondCheck = await checkAndDisableRuNotificationsOnSemesterEnd(
        calendar,
        new Date('2026-12-16T09:00:00-03:00'),
      );
      expect(secondCheck).toBe(false);
      expect(getNotificationSettings().ruMenu.enabled).toBe(true);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
