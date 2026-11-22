import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../container';
import { InMemoryFeedRepository } from '../infrastructure/in-memory-feed.repo';
import { InMemoryDeadlineNotificationRepository } from '../infrastructure/in-memory-deadline-notification.repo';
import { saveNotificationSettings } from '../infrastructure/notification-settings.service';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../domain/entities/notification-settings';
import type { IOSNotifier, OSNotificationPayload } from '../domain/interfaces/os-notifier.interface';
import type { FeedItem } from '../domain/entities/feed-item';

const NOW = new Date('2026-10-16T12:00:00');
const HOUR_MS = 60 * 60 * 1000;

function makeNotifier(allowed = true) {
  const calls: OSNotificationPayload[] = [];
  const badgeCalls: (number | null | undefined)[] = [];
  const notifier: IOSNotifier & {
    calls: OSNotificationPayload[];
    badgeCalls: (number | null | undefined)[];
  } = {
    calls,
    badgeCalls,
    ensurePermission: async () => allowed,
    notify: async (payload) => {
      calls.push(payload);
    },
    setBadgeCount: async (count) => {
      badgeCalls.push(count);
    },
  };
  return notifier;
}

function assignment(
  id: string,
  hoursFromNow: number,
  overrides: Partial<FeedItem> = {},
): FeedItem {
  return {
    id,
    platform: 'aprender3',
    title: `Tarefa ${id}`,
    content: '',
    courseName: 'Cálculo 1',
    itemType: 'assignment',
    createdAt: new Date(NOW.getTime() - 48 * HOUR_MS).toISOString(),
    dueDate: new Date(NOW.getTime() + hoursFromNow * HOUR_MS).toISOString(),
    isCompleted: false,
    ...overrides,
  };
}

describe('EvaluateDeadlineNotificationsUseCase', () => {
  let feedRepo: InMemoryFeedRepository;

  beforeEach(async () => {
    feedRepo = new InMemoryFeedRepository();
    await saveNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('classifica urgência, monta o painel e dispara um ping por marco novo', async () => {
    const notifier = makeNotifier();
    const container = createContainer({
      repos: {
        feedRepo,
        deadlineNotificationRepo: new InMemoryDeadlineNotificationRepository(),
        osNotifier: notifier,
      },
    });

    await feedRepo.saveItems([
      assignment('urgente', 10),          // hoje
      assignment('amanha', 30),           // amanhã
      assignment('semana', 96),           // próximos dias
      assignment('atrasada', -5),         // atrasada
      assignment('longe', 240),           // fora do painel (>7 dias)
      assignment('concluida', 8, { isCompleted: true }),
      assignment('post', 6, { itemType: 'post' }),
    ]);

    const result = await container.useCases.evaluateDeadlines.execute(NOW);

    expect(result.entries.map((e) => e.item.id)).toEqual([
      'atrasada',
      'urgente',
      'amanha',
      'semana',
    ]);
    expect(result.entries[0].urgency).toBe('overdue');
    expect(result.entries[1].urgency).toBe('today');
    expect(result.entries[2].urgency).toBe('tomorrow');
    expect(result.entries[3].urgency).toBe('week');

    // Badge: todas as pendências da janela do painel (inclui atrasada e semana)
    expect(result.badgeCount).toBe(4);
    expect(notifier.badgeCalls).toEqual([4]);

    // Um ping por tarefa, no marco mais urgente entrado agora
    expect(notifier.calls).toHaveLength(3);
    expect(notifier.calls[0].title).toBe('Prazo encerrado');
    expect(notifier.calls[1].title).toBe('Entrega em menos de 24h');
    expect(notifier.calls[2].title).toBe('Entrega em menos de 48h');
  });

  it('não repete ping em avaliações seguintes (deduplicação por marco)', async () => {
    const notifier = makeNotifier();
    const container = createContainer({
      repos: {
        feedRepo,
        deadlineNotificationRepo: new InMemoryDeadlineNotificationRepository(),
        osNotifier: notifier,
      },
    });

    await feedRepo.saveItems([assignment('unica', 30)]);

    const first = await container.useCases.evaluateDeadlines.execute(NOW);
    expect(first.newPings).toHaveLength(1);

    // Avaliação 7h depois: tarefa cruzou o marco de 24h → novo ping único
    const second = await container.useCases.evaluateDeadlines.execute(
      new Date(NOW.getTime() + 7 * HOUR_MS),
    );
    expect(second.newPings).toHaveLength(1);
    expect(second.newPings[0].title).toBe('Entrega em menos de 24h');

    // Avaliação imediata: nada novo
    const third = await container.useCases.evaluateDeadlines.execute(
      new Date(NOW.getTime() + 7 * HOUR_MS + 1000),
    );
    expect(third.newPings).toHaveLength(0);
    expect(notifier.calls).toHaveLength(2);
  });

  it('agrupa marcos perdidos com o app fechado em um único ping', async () => {
    const notifier = makeNotifier();
    const container = createContainer({
      repos: {
        feedRepo,
        deadlineNotificationRepo: new InMemoryDeadlineNotificationRepository(),
        osNotifier: notifier,
      },
    });

    await feedRepo.saveItems([assignment('abandonada', -30)]);

    const result = await container.useCases.evaluateDeadlines.execute(NOW);
    expect(result.newPings).toHaveLength(1);
    expect(result.newPings[0].title).toBe('Prazo encerrado');
    expect(notifier.calls).toHaveLength(1);
  });

  it('não pinga sem permissão do SO, mas registra os marcos mesmo assim', async () => {
    const notifier = makeNotifier(false);
    const container = createContainer({
      repos: {
        feedRepo,
        deadlineNotificationRepo: new InMemoryDeadlineNotificationRepository(),
        osNotifier: notifier,
      },
    });

    await feedRepo.saveItems([assignment('sem-permissao', 10)]);

    const result = await container.useCases.evaluateDeadlines.execute(NOW);
    expect(result.newPings).toHaveLength(1);
    expect(notifier.calls).toHaveLength(0);

    const again = await container.useCases.evaluateDeadlines.execute(NOW);
    expect(again.newPings).toHaveLength(0);
  });

  it('limpar o feed zera a memória de marcos notificados', async () => {
    const container = createContainer({
      repos: {
        feedRepo,
        deadlineNotificationRepo: new InMemoryDeadlineNotificationRepository(),
        osNotifier: makeNotifier(),
      },
    });

    await feedRepo.saveItems([assignment('qualquer', 10)]);
    await container.useCases.evaluateDeadlines.execute(NOW);

    await container.useCases.getFeed.clear();
    expect(await container.repos.deadlineNotificationRepo.getNotifiedKeys()).toEqual([]);
  });

  it('atualiza o contador do ícone (Dock badge) e remove ao zerar pendências', async () => {
    const notifier = makeNotifier();
    const container = createContainer({
      repos: {
        feedRepo,
        deadlineNotificationRepo: new InMemoryDeadlineNotificationRepository(),
        osNotifier: notifier,
      },
    });

    await feedRepo.saveItems([
      assignment('pendente1', 10),
      assignment('pendente2', 20),
    ]);
    await container.useCases.evaluateDeadlines.execute(NOW);
    expect(notifier.badgeCalls).toEqual([2]);

    await container.useCases.getFeed.markAsCompleted('pendente1', true);
    await container.useCases.evaluateDeadlines.execute(NOW);
    expect(notifier.badgeCalls).toEqual([2, 1]);

    await container.useCases.getFeed.markAsCompleted('pendente2', true);
    await container.useCases.evaluateDeadlines.execute(NOW);
    expect(notifier.badgeCalls).toEqual([2, 1, 0]);
  });

  it('não dispara notificação do SO quando notificações de prazos estão desativadas, mas mantém o painel e registra os marcos', async () => {
    await saveNotificationSettings({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      deadlines: false,
    });

    const notifier = makeNotifier();
    const container = createContainer({
      repos: {
        feedRepo,
        deadlineNotificationRepo: new InMemoryDeadlineNotificationRepository(),
        osNotifier: notifier,
      },
    });

    await feedRepo.saveItems([assignment('silenciada', 10)]);

    const result = await container.useCases.evaluateDeadlines.execute(NOW);
    expect(result.entries).toHaveLength(1);
    expect(result.badgeCount).toBe(1);
    expect(notifier.calls).toHaveLength(0);

    await saveNotificationSettings({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      deadlines: true,
    });

    const again = await container.useCases.evaluateDeadlines.execute(NOW);
    expect(again.newPings).toHaveLength(0);
    expect(notifier.calls).toHaveLength(0);
  });
});
