import type { FeedItem } from '../domain/entities/feed-item';
import type {
  DeadlineEntry,
  DeadlineMarco,
  DeadlineUrgency,
} from '../domain/entities/deadline-notification';
import type { IFeedRepository } from '../domain/interfaces/feed-repo.interface';
import type { IDeadlineNotificationRepository } from '../domain/interfaces/deadline-notification-repo.interface';
import type {
  IOSNotifier,
  OSNotificationPayload,
} from '../domain/interfaces/os-notifier.interface';

const HOUR_MS = 1000 * 60 * 60;

/** Janela do painel: atrasadas até 14 dias e vencimentos até 7 dias à frente. */
const PANEL_OVERDUE_LIMIT_DAYS = 14;
const PANEL_AHEAD_LIMIT_HOURS = 7 * 24;

/** Ordem de urgência: menor = mais urgente (define o ping quando vários marcos entram juntos). */
const MARCO_RANK: Record<DeadlineMarco, number> = {
  atrasada: 0,
  '24h': 1,
  '48h': 2,
};

const MARCO_COPY: Record<DeadlineMarco, (item: FeedItem) => OSNotificationPayload> = {
  atrasada: (item) => ({
    title: 'Prazo encerrado',
    body: `"${item.title}" em ${item.courseName} foi encerrada.`,
  }),
  '24h': (item) => ({
    title: 'Entrega em menos de 24h',
    body: `"${item.title}" vence em ${item.courseName} em menos de um dia.`,
  }),
  '48h': (item) => ({
    title: 'Entrega em menos de 48h',
    body: `"${item.title}" vence em ${item.courseName} nos próximos dois dias.`,
  }),
};

/**
 * Marcos que uma tarefa já cruzou, dados os horas restantes. Cada marco é
 * notificado uma única vez por tarefa.
 */
function enteredMarcos(hoursRemaining: number): DeadlineMarco[] {
  if (hoursRemaining < 0) return ['atrasada', '24h', '48h'];
  if (hoursRemaining <= 24) return ['24h', '48h'];
  if (hoursRemaining <= 48) return ['48h'];
  return [];
}

function urgencyFor(due: Date, now: Date): DeadlineUrgency {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayMs = 24 * HOUR_MS;
  const today = startOfDay(now).getTime();

  if (due.getTime() < now.getTime()) return 'overdue';
  if (due.getTime() < today + dayMs) return 'today';
  if (due.getTime() < today + 2 * dayMs) return 'tomorrow';
  return 'week';
}

export function deadlineKey(itemId: string, marco: DeadlineMarco): string {
  return `${itemId}:${marco}`;
}

export interface DeadlineEvaluationResult {
  entries: DeadlineEntry[];
  /** Pendências na janela do painel (atrasadas até 14 dias, futuras até 7 dias) — mesma contagem da lista. */
  badgeCount: number;
  newPings: OSNotificationPayload[];
}

/**
 * Avalia os prazos do feed e dispara as notificações de marco. A checagem
 * acontece ao abrir o app e após cada sync — não há processo em fundo.
 */
export class EvaluateDeadlineNotificationsUseCase {
  constructor(
    private readonly feedRepo: IFeedRepository,
    private readonly deadlineRepo: IDeadlineNotificationRepository,
    private readonly notifier: IOSNotifier,
    private readonly isNotificationEnabled: () => boolean = () => true,
  ) {}

  async execute(now: Date = new Date()): Promise<DeadlineEvaluationResult> {
    const items = await this.feedRepo.getItems();

    const nowMs = now.getTime();
    const entries: DeadlineEntry[] = [];

    for (const item of items) {
      if (item.itemType !== 'assignment' || !item.dueDate || item.isCompleted) {
        continue;
      }

      const due = new Date(item.dueDate);
      if (Number.isNaN(due.getTime())) continue;

      const hoursRemaining = (due.getTime() - nowMs) / HOUR_MS;

      // Painel é buffer curto: atrasadas antigas saem, futuro distante também.
      if (
        hoursRemaining < -PANEL_OVERDUE_LIMIT_DAYS * 24 ||
        hoursRemaining > PANEL_AHEAD_LIMIT_HOURS
      ) {
        continue;
      }

      entries.push({
        item,
        hoursRemaining,
        urgency: urgencyFor(due, now),
        enteredMarcos: enteredMarcos(hoursRemaining),
      });
    }

    entries.sort((a, b) => a.hoursRemaining - b.hoursRemaining);

    // Deduplicação: cada tarefa avisa uma vez por marco, mesmo com o app
    // fechado por dias (os marcos perdidos entram juntos e viram um ping só).
    const notified = new Set(await this.deadlineRepo.getNotifiedKeys());
    const newPings: OSNotificationPayload[] = [];

    for (const entry of entries) {
      const fresh = entry.enteredMarcos
        .filter((marco) => !notified.has(deadlineKey(entry.item.id, marco)))
        .sort((a, b) => MARCO_RANK[a] - MARCO_RANK[b]);

      if (fresh.length === 0) continue;

      newPings.push(MARCO_COPY[fresh[0]](entry.item));

      for (const marco of fresh) {
        const key = deadlineKey(entry.item.id, marco);
        notified.add(key);
        await this.deadlineRepo.markNotified(key);
      }
    }

    if (
      newPings.length > 0 &&
      this.isNotificationEnabled() &&
      (await this.notifier.ensurePermission())
    ) {
      for (const ping of newPings) {
        await this.notifier.notify(ping);
      }
    }

    // Badge espelha o painel: toda pendência da janela conta, para o número
    // do sino bater com o que a lista mostra ao abrir.
    const badgeCount = entries.length;

    await this.notifier.setBadgeCount(badgeCount);

    return { entries, badgeCount, newPings };
  }
}
