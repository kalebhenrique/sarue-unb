import React from 'react';
import { Bell } from 'lucide-react';
import { Card, PageContainer, PageHeader, Skeleton } from '@/components/ui';

interface SkeletonRowSpec {
  title: string;
  discipline: string;
  due: string;
  hasLink: boolean;
}

interface SkeletonSectionSpec {
  labelWidth: string;
  rows: readonly SkeletonRowSpec[];
}

// Larguras determinísticas por seção e linha — lista viva, não fileira de blocos iguais
const SKELETON_SECTIONS: readonly SkeletonSectionSpec[] = [
  {
    labelWidth: 'w-28',
    rows: [
      { title: 'w-3/5', discipline: 'w-28', due: 'w-28', hasLink: true },
      { title: 'w-2/5', discipline: 'w-24', due: 'w-24', hasLink: true },
    ],
  },
  {
    labelWidth: 'w-36',
    rows: [
      { title: 'w-2/3', discipline: 'w-32', due: 'w-28', hasLink: true },
      { title: 'w-1/2', discipline: 'w-20', due: 'w-24', hasLink: false },
      { title: 'w-3/4', discipline: 'w-28', due: 'w-28', hasLink: true },
    ],
  },
];

/**
 * Placeholder da lista de notificações: espelha as seções de urgência e as
 * linhas de NotificationRow (checkbox, título, badges de plataforma/disciplina,
 * data e atalho externo) sem bordas nos blocos — A Regra do Bloco Sem Borda.
 */
export const NotificationsSkeleton: React.FC = () => (
  <div role="status" aria-busy="true">
    <span className="sr-only">Carregando notificações...</span>
    <Card className="p-0 overflow-hidden" aria-hidden="true">
      <div className="divide-y-2 divide-black/15">
        {SKELETON_SECTIONS.map((section, sectionIndex) => (
          <section key={sectionIndex}>
            <div className="px-4 pt-3.5 pb-2">
              <Skeleton className={`h-3 ${section.labelWidth}`} />
            </div>
            <ul role="list" className="divide-y-2 divide-black/15">
              {section.rows.map((row, rowIndex) => (
                <li
                  key={rowIndex}
                  className="flex items-start gap-3 px-4 py-3.5"
                >
                  <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded-md" />

                  <div className="min-w-0 flex-1">
                    <Skeleton className={`h-4 ${row.title}`} />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 min-w-0">
                      <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                      <Skeleton
                        className={`h-5 shrink-0 rounded-full ${row.discipline}`}
                      />
                      <Skeleton className={`h-2.5 ${row.due} rounded-full`} />
                    </div>
                  </div>

                  {row.hasLink ? (
                    <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  </div>
);

/**
 * Skeleton de página inteira para a tela de Notificações (primeira carga e Suspense).
 */
export const NotificationsPageSkeleton: React.FC = () => (
  <PageContainer>
    <PageHeader icon={Bell} title="Notificações" />
    <NotificationsSkeleton />
  </PageContainer>
);
