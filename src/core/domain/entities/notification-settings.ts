import type { RuMealType } from '../utils/ru-menu-formatter';

/** Dia da semana seguindo `Date.getDay()`: 0 = Dom, 1 = Seg, ..., 6 = Sáb. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RuMealSelection = Record<RuMealType, boolean>;

export interface RuMenuNotificationSettings {
  enabled: boolean;
  weekdays: Weekday[];
  meals: RuMealSelection;
}

export interface NotificationSettings {
  deadlines: boolean;
  backgroundSync: boolean;
  ruMenu: RuMenuNotificationSettings;
}

export interface WeekdayOption {
  value: Weekday;
  shortLabel: string;
  label: string;
}

export const WEEKDAY_OPTIONS: readonly WeekdayOption[] = [
  { value: 1, shortLabel: 'Seg', label: 'Segunda-feira' },
  { value: 2, shortLabel: 'Ter', label: 'Terça-feira' },
  { value: 3, shortLabel: 'Qua', label: 'Quarta-feira' },
  { value: 4, shortLabel: 'Qui', label: 'Quinta-feira' },
  { value: 5, shortLabel: 'Sex', label: 'Sexta-feira' },
  { value: 6, shortLabel: 'Sáb', label: 'Sábado' },
  { value: 0, shortLabel: 'Dom', label: 'Domingo' },
];

export const DEFAULT_RU_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  deadlines: true,
  backgroundSync: false,
  ruMenu: {
    enabled: false,
    weekdays: [...DEFAULT_RU_WEEKDAYS],
    meals: {
      breakfast: true,
      lunch: true,
      dinner: true,
    },
  },
};

const VALID_WEEKDAYS = new Set<number>([0, 1, 2, 3, 4, 5, 6]);
const WEEKDAY_ORDER = new Map<Weekday, number>(
  WEEKDAY_OPTIONS.map((opt, idx) => [opt.value, idx]),
);

function sortWeekdays(days: Weekday[]): Weekday[] {
  return [...new Set(days)].sort(
    (a, b) => (WEEKDAY_ORDER.get(a) ?? 0) - (WEEKDAY_ORDER.get(b) ?? 0),
  );
}

/**
 * Normaliza entradas parciais ou legadas de configurações de notificações,
 * garantindo valores válidos para booleanos, dias da semana e refeições.
 */
export function normalizeNotificationSettings(
  raw: unknown,
): NotificationSettings {
  if (!raw || typeof raw !== 'object') {
    return {
      deadlines: DEFAULT_NOTIFICATION_SETTINGS.deadlines,
      backgroundSync: DEFAULT_NOTIFICATION_SETTINGS.backgroundSync,
      ruMenu: {
        enabled: DEFAULT_NOTIFICATION_SETTINGS.ruMenu.enabled,
        weekdays: [...DEFAULT_NOTIFICATION_SETTINGS.ruMenu.weekdays],
        meals: { ...DEFAULT_NOTIFICATION_SETTINGS.ruMenu.meals },
      },
    };
  }

  const obj = raw as Record<string, unknown>;
  const rawRu =
    obj.ruMenu && typeof obj.ruMenu === 'object'
      ? (obj.ruMenu as Record<string, unknown>)
      : {};
  const rawMeals =
    rawRu.meals && typeof rawRu.meals === 'object'
      ? (rawRu.meals as Record<string, unknown>)
      : {};

  const weekdays = Array.isArray(rawRu.weekdays)
    ? sortWeekdays(
        rawRu.weekdays.filter(
          (d): d is Weekday =>
            typeof d === 'number' && Number.isInteger(d) && VALID_WEEKDAYS.has(d),
        ),
      )
    : [...DEFAULT_NOTIFICATION_SETTINGS.ruMenu.weekdays];

  return {
    deadlines:
      typeof obj.deadlines === 'boolean'
        ? obj.deadlines
        : DEFAULT_NOTIFICATION_SETTINGS.deadlines,
    backgroundSync:
      typeof obj.backgroundSync === 'boolean'
        ? obj.backgroundSync
        : DEFAULT_NOTIFICATION_SETTINGS.backgroundSync,
    ruMenu: {
      enabled:
        typeof rawRu.enabled === 'boolean'
          ? rawRu.enabled
          : DEFAULT_NOTIFICATION_SETTINGS.ruMenu.enabled,
      weekdays,
      meals: {
        breakfast:
          typeof rawMeals.breakfast === 'boolean'
            ? rawMeals.breakfast
            : DEFAULT_NOTIFICATION_SETTINGS.ruMenu.meals.breakfast,
        lunch:
          typeof rawMeals.lunch === 'boolean'
            ? rawMeals.lunch
            : DEFAULT_NOTIFICATION_SETTINGS.ruMenu.meals.lunch,
        dinner:
          typeof rawMeals.dinner === 'boolean'
            ? rawMeals.dinner
            : DEFAULT_NOTIFICATION_SETTINGS.ruMenu.meals.dinner,
      },
    },
  };
}
