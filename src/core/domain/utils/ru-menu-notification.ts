import type {
  RuMenuNotificationSettings,
  Weekday,
} from '../entities/notification-settings';
import {
  MEAL_METADATA,
  formatMealMenu,
  getBrasiliaDateParts,
  type RawRuDailyMenu,
  type RuCampus,
  type RuMealType,
} from './ru-menu-formatter';

export const RU_MEAL_ORDER: readonly RuMealType[] = [
  'breakfast',
  'lunch',
  'dinner',
];

/**
 * Horário-alvo da notificação de cada refeição em Brasília (15 min antes da
 * abertura do refeitório) e fim da janela de serviço para envio no dia.
 */
export const RU_MEAL_NOTIFICATION_TIMES: Record<
  RuMealType,
  { hour: number; minute: number; endHour: number; endMinute: number; label: string }
> = {
  breakfast: { hour: 6, minute: 45, endHour: 9, endMinute: 30, label: '06:45' },
  lunch: { hour: 10, minute: 45, endHour: 14, endMinute: 30, label: '10:45' },
  dinner: { hour: 16, minute: 45, endHour: 19, endMinute: 30, label: '16:45' },
};

export const RU_NOTIFICATION_ID_MIN = 840000;
export const RU_NOTIFICATION_ID_MAX = 859999;

export interface RuMealNotificationPayload {
  title: string;
  body: string;
  largeBody: string;
}

export interface DueRuMealNotification {
  dedupeKey: string;
  dateIso: string;
  meal: RuMealType;
  payload: RuMealNotificationPayload;
}

export interface PlannedMobileRuNotification {
  id: number;
  dateIso: string;
  meal: RuMealType;
  fireAt: Date;
  payload: RuMealNotificationPayload;
}

/** Retorna o dia da semana atual em Brasília (`0 = Dom ... 6 = Sáb`). */
export function getBrasiliaWeekday(now: Date = new Date()): Weekday {
  const { year, month, day } = getBrasiliaDateParts(now);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay() as Weekday;
}

/** Extrai o dia da semana (`0 = Dom ... 6 = Sáb`) de uma data `YYYY-MM-DD`. */
export function getIsoDateWeekday(dateIso: string): Weekday | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(utc.getTime())) return null;
  return utc.getUTCDay() as Weekday;
}

/** Constrói `Date` correspondente ao horário de Brasília (`America/Sao_Paulo`, -03:00). */
export function buildBrasiliaScheduleDate(
  dateIso: string,
  hour: number,
  minute: number,
): Date {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${dateIso}T${hh}:${mm}:00-03:00`);
}

/** Gera identificador inteiro determinístico para agendamentos de cardápio no mobile. */
export function getRuNotificationId(dateIso: string, meal: RuMealType): number {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(dateIso);
  const month = match ? Number(match[1]) : 0;
  const day = match ? Number(match[2]) : 0;
  const mealIdx = RU_MEAL_ORDER.indexOf(meal);
  return RU_NOTIFICATION_ID_MIN + (month * 100 + day) * 10 + Math.max(0, mealIdx);
}

/** Chave única por campus, data e refeição para deduplicação de envios no dia. */
export function ruMealNotificationKey(
  campus: RuCampus,
  dateIso: string,
  meal: RuMealType,
): string {
  return `${campus}:${dateIso}:${meal}`;
}

/**
 * Monta título, resumo curto e corpo expandido para a notificação de uma refeição.
 * Retorna `null` caso a refeição não tenha itens publicados no dia.
 */
export function buildRuMealNotificationPayload(
  dayMenu: RawRuDailyMenu,
  meal: RuMealType,
  campus: RuCampus,
): RuMealNotificationPayload | null {
  const formatted = formatMealMenu(meal, dayMenu[meal]);
  if (formatted.isEmpty) return null;

  const meta = MEAL_METADATA[meal];
  const title = `${meta.title} no RU · ${campus}`;

  const variationLines: string[] = [];
  const compactParts: string[] = [];
  for (const v of formatted.variations) {
    const joined = v.items.join(' / ');
    if (!joined) continue;
    const shortTag =
      v.diet === 'standard'
        ? 'Padrão'
        : v.diet === 'ovolacto'
          ? 'Ovolacto'
          : 'Vegano';
    compactParts.push(`${shortTag}: ${joined}`);
    variationLines.push(`${shortTag}: ${joined}`);
  }

  const pickGroup = (cat: string) =>
    formatted.composition.find((g) => g.category === cat);
  const dessert = pickGroup('dessert') ?? pickGroup('fruit');
  const side = pickGroup('side_dish');
  const bakery = pickGroup('bakery');
  const soup = pickGroup('soup');

  const extraLines: string[] = [...variationLines];
  if (side && side.items.length > 0) {
    extraLines.push(`Guarnição: ${side.items.map((a) => a.join(' / ')).join(', ')}`);
  }
  if (soup && soup.items.length > 0) {
    extraLines.push(`Sopa: ${soup.items.map((a) => a.join(' / ')).join(', ')}`);
  }
  if (meal === 'breakfast' && bakery && bakery.items.length > 0) {
    extraLines.push(`Panificação: ${bakery.items.map((a) => a.join(' / ')).join(', ')}`);
  }
  if (dessert && dessert.items.length > 0) {
    const label = dessert.category === 'fruit' ? 'Fruta' : 'Sobremesa';
    const value = dessert.items.map((a) => a.join(' / ')).join(', ');
    extraLines.push(`${label}: ${value}`);
    if (compactParts.length < 3) {
      compactParts.push(`${label}: ${value}`);
    }
  }

  const fallbackText =
    extraLines[0] ?? `Confira o cardápio completo de ${meta.title.toLowerCase()} no app.`;
  const body = compactParts.length > 0 ? compactParts.join(' • ') : fallbackText;
  const largeBody = extraLines.length > 0 ? extraLines.join('\n') : body;

  return { title, body, largeBody };
}

/**
 * Avalia quais refeições do dia estão na janela de notificação e ainda não
 * foram enviadas neste dispositivo (usado no desktop e quando o app está aberto).
 */
export function findDueRuMealsForTimestamp(
  menus: readonly RawRuDailyMenu[],
  settings: RuMenuNotificationSettings,
  campus: RuCampus,
  notifiedKeys: ReadonlySet<string>,
  now: Date = new Date(),
): DueRuMealNotification[] {
  if (!settings.enabled || settings.weekdays.length === 0) return [];

  const parts = getBrasiliaDateParts(now);
  const todayIso = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const weekday = getBrasiliaWeekday(now);
  if (!settings.weekdays.includes(weekday)) return [];

  const todayMenu = menus.find((m) => m.date === todayIso);
  if (!todayMenu) return [];

  const currentMinutes = parts.hour * 60 + parts.minute;
  const due: DueRuMealNotification[] = [];

  for (const meal of RU_MEAL_ORDER) {
    if (!settings.meals[meal]) continue;
    const timing = RU_MEAL_NOTIFICATION_TIMES[meal];
    const startMinutes = timing.hour * 60 + timing.minute;
    const endMinutes = timing.endHour * 60 + timing.endMinute;
    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) continue;

    const dedupeKey = ruMealNotificationKey(campus, todayIso, meal);
    if (notifiedKeys.has(dedupeKey)) continue;

    const payload = buildRuMealNotificationPayload(todayMenu, meal, campus);
    if (!payload) continue;

    due.push({ dedupeKey, dateIso: todayIso, meal, payload });
  }

  return due;
}

/**
 * Planeja todas as notificações futuras agendáveis no sistema operacional mobile
 * a partir dos cardápios já em cache para os dias e refeições habilitados.
 */
export function planMobileRuSchedules(
  menus: readonly RawRuDailyMenu[],
  settings: RuMenuNotificationSettings,
  campus: RuCampus,
  now: Date = new Date(),
): PlannedMobileRuNotification[] {
  if (!settings.enabled || settings.weekdays.length === 0) return [];

  const nowMs = now.getTime();
  const planned: PlannedMobileRuNotification[] = [];

  for (const dayMenu of menus) {
    const weekday = getIsoDateWeekday(dayMenu.date);
    if (weekday === null || !settings.weekdays.includes(weekday)) continue;

    for (const meal of RU_MEAL_ORDER) {
      if (!settings.meals[meal]) continue;

      const timing = RU_MEAL_NOTIFICATION_TIMES[meal];
      const fireAt = buildBrasiliaScheduleDate(
        dayMenu.date,
        timing.hour,
        timing.minute,
      );
      if (Number.isNaN(fireAt.getTime()) || fireAt.getTime() <= nowMs) {
        continue;
      }

      const payload = buildRuMealNotificationPayload(dayMenu, meal, campus);
      if (!payload) continue;

      planned.push({
        id: getRuNotificationId(dayMenu.date, meal),
        dateIso: dayMenu.date,
        meal,
        fireAt,
        payload,
      });
    }
  }

  planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return planned;
}
