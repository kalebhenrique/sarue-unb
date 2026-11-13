import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Bell, BellOff, ExternalLink } from 'lucide-react';
import { Badge, Button, Checkbox } from '@/components/ui';
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

/* Seções na ordem de urgência; só aparecem quando têm itens. */
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

/**
 * Linha do painel de prazos: check de conclusão, título, meta inline e
 * atalho para a plataforma de origem. Mesma física de check do feed.
 */
const DeadlineRow: React.FC<{
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
        'flex items-start gap-2.5 px-4 py-3 transition-colors duration-150',
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

        <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[11px] font-semibold text-neutral-500">
          <Badge variant={item.platform} size="sm" className="shrink-0">
            {PLATFORM_LABELS[item.platform] ?? item.platform}
          </Badge>
          {disciplineLabel ? (
            <Badge
              variant="neutral"
              size="sm"
              className="min-w-0 max-w-[128px]"
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
          <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      ) : null}
    </li>
  );
};

/**
 * Sino de prazos no header de conteúdo: badge com as pendências da janela do
 * painel (mesma contagem da lista) e painel-inbox ancorado, agrupado por urgência.
 */
export const DeadlineBell: React.FC<{ className?: string }> = ({ className }) => {
  const { entries, badgeCount, refresh } = useDeadlines();
  const { lastSyncedAt } = useSync();
  const { useCases } = useContainer();

  const [open, setOpen] = React.useState(false);
  const [disciplines, setDisciplines] = React.useState<Discipline[]>([]);
  /* Snapshot congelado na abertura: itens concluídos ficam visíveis (com check)
     até o popup fechar, quando o refresh sincroniza lista e badge. */
  const [snapshot, setSnapshot] = React.useState<DeadlineEntry[]>([]);
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
    // Persiste a conclusão, mas o item só sai da lista quando o popup fechar.
    setPendingDone((prev) => new Set(prev).add(id));
    await useCases.getFeed.markAsCompleted(id, true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setSnapshot(entries);
      setPendingDone(new Set());
    } else {
      void refresh();
    }
    setOpen(nextOpen);
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
    entries: snapshot.filter((e) => e.urgency === section.urgency),
  }));

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={
              badgeCount > 0
                ? `Prazos: ${badgeCount} pendência(s)`
                : 'Prazos'
            }
            className={cn('relative h-10 w-10 rounded-xl', className)}
          />
        }
      >
        <Bell className="size-5 stroke-[2.5]" />
        {badgeCount > 0 ? (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-[11px] leading-none font-bold text-white bg-neo-danger border-2 border-ink rounded-full"
            aria-hidden
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        ) : null}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50"
        >
          <PopoverPrimitive.Popup
            aria-label="Prazos próximos"
            className="w-[min(420px,calc(100vw-2rem))] max-h-[min(28rem,var(--available-height))] flex flex-col overflow-hidden rounded-lg border-2 border-ink bg-canvas outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
          >
            {/* Cabeçalho do painel */}
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-ink/15 shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="size-4 stroke-[2.5] text-blue-ink" />
                <h3 className="text-sm font-extrabold tracking-tight text-black">
                  Prazos
                </h3>
              </div>
              {snapshot.length > 0 ? (
                <Badge variant="urgent" size="sm">
                  {snapshot.length} pendência{snapshot.length > 1 ? 's' : ''}
                </Badge>
              ) : lastSyncedAt ? (
                <Badge variant="neutral" size="sm">Em dia</Badge>
              ) : null}
            </div>

            {/* Seções de urgência */}
            <div className="overflow-y-auto overflow-x-hidden overscroll-contain">
              {snapshot.length === 0 ? (
                <div className="px-6 py-10 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto bg-paper border-2 border-ink rounded-lg shadow-[2px_2px_0px_0px_var(--neo-shadow)] flex items-center justify-center">
                    <BellOff className="size-6 stroke-[2.5] text-blue-ink" />
                  </div>
                  <h4 className="text-base font-bold text-black">Nada vencendo</h4>
                  <p className="text-xs font-medium text-neutral-600 leading-relaxed max-w-[260px] mx-auto">
                    {lastSyncedAt
                      ? 'Você está em dia com as entregas dos próximos dias.'
                      : 'Sincronize suas plataformas na barra lateral para trazer tarefas e prazos.'}
                  </p>
                </div>
              ) : (
                grouped.map(
                  (section) =>
                    section.entries.length > 0 && (
                      <section key={section.urgency}>
                        <p
                          className={cn(
                            'px-4 pt-3 pb-1.5 text-[11px] font-black uppercase tracking-wider',
                            section.labelClass,
                          )}
                        >
                          {section.label} ({section.entries.length})
                        </p>
                        <ul role="list" className="divide-y-2 divide-black/15">
                          {section.entries.map((entry) => (
                            <DeadlineRow
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
                )
              )}
            </div>

          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
