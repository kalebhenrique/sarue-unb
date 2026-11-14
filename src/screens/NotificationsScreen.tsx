import * as React from 'react';
import { Bell, BellOff, ExternalLink } from 'lucide-react';
import { Badge, Card, Checkbox, PageContainer, PageHeader } from '@/components/ui';
import { useDeadlines } from '@/context/DeadlineContext';
import { useSync } from '@/context/SyncContext';
import { useContainer } from '@/context/ContainerContext';
import { cn, openExternalUrl } from '@/lib/utils';
import type { DeadlineEntry, Discipline } from '@/core';

const PLATFORM_LABELS: Record<string, string> = {
  aprender3: 'Aprender 3',
  sigaa: 'Sigaa',
  teams: 'Teams',
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const SECTIONS: {
  urgency: DeadlineEntry['urgency'];
  label: string;
  labelClass: string;
}[] = [
  { urgency: 'overdue', label: 'Atrasadas', labelClass: 'text-ink-error' },
  { urgency: 'today', label: 'Vence hoje', labelClass: 'text-ink-error' },
  { urgency: 'tomorrow', label: 'Amanhã', labelClass: 'text-neutral-500' },
  { urgency: 'week', label: 'Próximos dias', labelClass: 'text-neutral-500' },
];

const NotificationRow: React.FC<{
  entry: DeadlineEntry;
  disciplineLabel?: string;
  isDone?: boolean;
  onComplete: (id: string) => void;
}> = ({ entry, disciplineLabel, isDone, onComplete }) => {
  const item = entry.item;
  const isOverdue = entry.urgency === 'overdue';

  return (
    <li
      className={cn(
        'flex items-start gap-3 px-4 py-3.5 transition-colors duration-150',
        isOverdue
          ? 'bg-pastel-red hover:bg-red-100'
          : 'hover:bg-neutral-200/60',
      )}
    >
      <Checkbox
        checked={isDone}
        onCheckedChange={(checked) => {
          if (checked && !isDone) {
            onComplete(item.id);
          }
        }}
        title={isDone ? 'Concluído' : 'Marcar como concluído'}
        aria-label={isDone ? `Concluído: ${item.title}` : `Concluir: ${item.title}`}
        className="mt-0.5 data-checked:bg-neo-green data-checked:text-ink hover:bg-neutral-100"
      />

      <div className="min-w-0 flex-1">
        <span
          title={item.title}
          className={cn(
            'block truncate text-sm font-bold',
            isDone ? 'text-neutral-600 line-through' : 'text-black',
          )}
        >
          {item.title}
        </span>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 min-w-0 text-[11px] font-semibold text-neutral-500">
          <Badge variant={item.platform} size="sm" className="shrink-0">
            {PLATFORM_LABELS[item.platform] ?? item.platform}
          </Badge>
          {disciplineLabel ? (
            <Badge
              variant="neutral"
              size="sm"
              className="min-w-0 max-w-[160px]"
              title={item.courseName}
            >
              <span className="min-w-0 truncate">
                {disciplineLabel}
                {item.courseCode ? ` · ${item.courseCode}` : ''}
              </span>
            </Badge>
          ) : null}
          <span
            className={cn(
              'shrink-0 whitespace-nowrap',
              isOverdue ? 'text-ink-error' : 'text-neutral-500',
            )}
          >
            {isOverdue ? 'Encerrou em' : 'Entrega'} {formatDate(item.dueDate!)}
          </span>
        </div>
      </div>

      {item.externalUrl ? (
        <button
          type="button"
          onClick={() => openExternalUrl(item.externalUrl!)}
          title={`Abrir no ${PLATFORM_LABELS[item.platform] ?? item.platform}`}
          aria-label={`Abrir no ${PLATFORM_LABELS[item.platform] ?? item.platform}: ${item.title}`}
          className="shrink-0 p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-black/5 cursor-pointer transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
        >
          <ExternalLink className="w-4 h-4 stroke-[2.5]" />
        </button>
      ) : null}
    </li>
  );
};

export const NotificationsScreen: React.FC = () => {
  const { entries, refresh } = useDeadlines();
  const { lastSyncedAt } = useSync();
  const { useCases } = useContainer();

  const [disciplines, setDisciplines] = React.useState<Discipline[]>([]);
  const [pendingDone, setPendingDone] = React.useState<ReadonlySet<string>>(
    new Set(),
  );

  React.useEffect(() => {
    let active = true;
    useCases
      .getCourses.getDisciplines()
      .then((result) => {
        if (active) setDisciplines(result.disciplines);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [useCases]);

  const handleComplete = async (id: string) => {
    setPendingDone((prev) => new Set(prev).add(id));
    await useCases.getFeed.markAsCompleted(id, true);
    void refresh();
  };

  const disciplineNames = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const d of disciplines) {
      if (d.sigaaCourse) map.set(d.sigaaCourse.name, d.name);
      map.set(d.name, d.name);
      for (const ac of d.aprenderCourses) map.set(ac.name, d.name);
      for (const tc of d.teamsCourses ?? []) map.set(tc.name, d.name);
    }
    return map;
  }, [disciplines]);

  const grouped = SECTIONS.map((section) => ({
    ...section,
    entries: entries.filter((e) => e.urgency === section.urgency),
  }));

  return (
    <PageContainer>
      <PageHeader
        icon={Bell}
        title={
          <>
            Notificações{' '}
            {entries.length > 0 ? (
              <span className="text-sm font-bold text-neutral-600">
                ({entries.length} pendência{entries.length > 1 ? 's' : ''})
              </span>
            ) : null}
          </>
        }
      />

      <Card className="p-0 overflow-hidden">
        {entries.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-3">
            <div className="w-12 h-12 mx-auto bg-paper border-2 border-ink rounded-lg shadow-neo-sm flex items-center justify-center">
              <BellOff className="size-6 stroke-[2.5] text-blue-ink" />
            </div>
            <h2 className="text-base font-extrabold text-black">
              Nada vencendo
            </h2>
            <p className="text-xs font-medium text-neutral-600 leading-relaxed max-w-[260px] mx-auto">
              {lastSyncedAt
                ? 'Você está em dia com as entregas dos próximos dias.'
                : 'Sincronize suas plataformas para trazer tarefas e prazos.'}
            </p>
          </div>
        ) : (
          <div className="divide-y-2 divide-black/15">
            {grouped.map(
              (section) =>
                section.entries.length > 0 && (
                  <section key={section.urgency}>
                    <p
                      className={cn(
                        'px-4 pt-3.5 pb-1.5 text-[11px] font-black uppercase tracking-wider',
                        section.labelClass,
                      )}
                    >
                      {section.label} ({section.entries.length})
                    </p>
                    <ul role="list" className="divide-y-2 divide-black/15">
                      {section.entries.map((entry) => (
                        <NotificationRow
                          key={entry.item.id}
                          entry={entry}
                          disciplineLabel={
                            disciplineNames.get(entry.item.courseName) ||
                            entry.item.courseName ||
                            entry.item.courseCode ||
                            undefined
                          }
                          isDone={pendingDone.has(entry.item.id)}
                          onComplete={handleComplete}
                        />
                      ))}
                    </ul>
                  </section>
                ),
            )}
          </div>
        )}
      </Card>
    </PageContainer>
  );
};
