import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  RU_NOTIFICATION_ID_MAX,
  RU_NOTIFICATION_ID_MIN,
  buildRuMealNotificationPayload,
  findDueRuMealsForTimestamp,
  getRuNotificationId,
  normalizeNotificationSettings,
  planMobileRuSchedules,
  ruMealNotificationKey,
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
});
