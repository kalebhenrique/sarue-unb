import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Checkbox,
} from '@/components/ui';
import { Bell } from 'lucide-react';
import type {
  UserCalendarEvent,
  CalendarEventCategory,
  CreateUserEventDTO,
  UpdateUserEventDTO,
  Course,
} from '@/core';

interface CalendarEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: (UserCalendarEvent & { isReadOnly?: boolean }) | null;
  prefilledDate?: string;
  prefilledEndDate?: string;
  courses?: Course[];
  onSave: (dto: CreateUserEventDTO | UpdateUserEventDTO) => Promise<void>;
  isSaving?: boolean;
}

export const CalendarEventDialog: React.FC<CalendarEventDialogProps> = ({
  open,
  onOpenChange,
  event,
  prefilledDate,
  prefilledEndDate,
  courses = [],
  onSave,
  isSaving = false,
}) => {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('__none__');
  const [notify, setNotify] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Deduplica disciplinas pelo código/nome
  const uniqueCourses = useMemo(() => {
    if (!courses || courses.length === 0) return [];
    const map = new Map<string, Course>();
    for (const c of courses) {
      const key = c.code || c.name;
      if (!map.has(key)) {
        map.set(key, c);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.code || a.name).localeCompare(b.code || b.name)
    );
  }, [courses]);

  const courseSelectItems = useMemo(() => {
    const items = [
      { value: '__none__', label: 'Nenhuma matéria vinculada (Geral)' },
      ...uniqueCourses.map((c) => {
        const hasValidCode = Boolean(
          c.code &&
          c.code !== c.name &&
          c.code.length <= 12 &&
          !c.name.startsWith(c.code)
        );
        return {
          value: c.id,
          label: hasValidCode ? `${c.code} • ${c.name}` : c.name,
        };
      }),
    ];
    return items;
  }, [uniqueCourses]);

  useEffect(() => {
    if (open) {
      setError(null);
      if (event) {
        setTitle(event.title);
        setStartDate(event.date);
        setEndDate(event.endDate || event.date);

        // Tenta encontrar o curso associado
        if (event.courseId) {
          setSelectedCourseId(event.courseId);
        } else if (event.courseCode) {
          const matched = uniqueCourses.find(
            (c) => c.code?.toLowerCase() === event.courseCode?.toLowerCase()
          );
          setSelectedCourseId(matched ? matched.id : '__none__');
        } else {
          setSelectedCourseId('__none__');
        }

        setNotify(event.notify !== false);
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        const initialStart = prefilledDate || todayStr;
        const initialEnd = prefilledEndDate || initialStart;

        setTitle('');
        setStartDate(initialStart);
        setEndDate(initialEnd);
        setSelectedCourseId('__none__');
        setNotify(true);
      }
    }
  }, [open, event, prefilledDate, prefilledEndDate, uniqueCourses]);

  const isReadOnly = Boolean(event?.isReadOnly);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      onOpenChange(false);
      return;
    }
    if (!title.trim()) {
      setError('Informe o título do evento.');
      return;
    }
    if (!startDate) {
      setError('Informe a data de início.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('A data de término não pode ser anterior à data de início.');
      return;
    }

    const isRange = Boolean(endDate && endDate > startDate);
    const selectedCourse = uniqueCourses.find((c) => c.id === selectedCourseId);
    const resolvedCategory: CalendarEventCategory = event
      ? event.category
      : selectedCourse
      ? 'class'
      : 'personal';

    try {
      const dtoData = {
        title: title.trim(),
        date: startDate,
        endDate: isRange ? endDate : undefined,
        allDay: true,
        category: resolvedCategory,
        courseId: selectedCourse?.id,
        courseCode: selectedCourse?.code,
        courseName: selectedCourse?.name,
        notify,
      };

      if (event) {
        await onSave({
          id: event.id,
          ...dtoData,
        });
      } else {
        await onSave(dtoData);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar evento.';
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg min-w-0 max-w-[calc(100vw-2rem)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {isReadOnly
              ? 'Detalhes do Evento'
              : event
              ? 'Editar Evento'
              : 'Novo Evento no Calendário'}
          </DialogTitle>
          <DialogDescription>
            {isReadOnly
              ? 'Informações do evento registradas no calendário.'
              : 'Defina o título, a matéria associada e o período do compromisso.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2 min-w-0 max-w-full">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg border-2 border-ink bg-pastel-red text-black text-xs font-bold"
            >
              {error}
            </div>
          )}

          {/* Título do Evento */}
          <div className="space-y-1 min-w-0">
            <label
              htmlFor="event-title-input"
              className="text-xs font-black uppercase tracking-wider text-black block"
            >
              Título do Evento {!isReadOnly && <span className="text-correction-red-strong">*</span>}
            </label>
            <textarea
              id="event-title-input"
              rows={2}
              required={!isReadOnly}
              disabled={isReadOnly}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: P1 de Algoritmos, Trabalho Final, Seminário..."
              className="w-full min-w-0 px-3.5 py-2 text-sm font-medium rounded-xl border-2 border-ink bg-paper focus:outline-hidden focus:ring-2 focus:ring-neo-blue text-black resize-none disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>

          {/* Seleção de Matéria / Disciplina via Select */}
          <div className="space-y-1.5 min-w-0">
            <label
              htmlFor="event-course-select"
              className="text-xs font-black uppercase tracking-wider text-black block"
            >
              Matéria / Disciplina
            </label>
            <Select
              value={selectedCourseId}
              items={courseSelectItems}
              disabled={isReadOnly}
              onValueChange={(val) => {
                if (val) setSelectedCourseId(val);
              }}
            >
              <SelectTrigger id="event-course-select" className="w-full min-w-0 bg-paper disabled:opacity-75 disabled:cursor-not-allowed">
                <SelectValue placeholder="Selecione a matéria">
                  {(() => {
                    if (selectedCourseId === '__none__') {
                      return (
                        <span className="text-xs font-bold text-neutral-500 truncate">
                          Nenhuma matéria vinculada (Geral)
                        </span>
                      );
                    }
                    const current = uniqueCourses.find((c) => c.id === selectedCourseId);
                    if (!current) {
                      return (
                        <span className="text-xs font-bold text-neutral-500 truncate">
                          Selecione a matéria
                        </span>
                      );
                    }
                    const hasValidCode = Boolean(
                      current.code &&
                      current.code !== current.name &&
                      current.code.length <= 12 &&
                      !current.name.startsWith(current.code)
                    );
                    const label = hasValidCode
                      ? `${current.code} - ${current.name}`
                      : current.name;
                    return (
                      <span className="font-bold text-xs truncate min-w-0">{label}</span>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" label="Nenhuma matéria vinculada (Geral)">
                  <span className="text-xs font-bold text-neutral-500">
                    Nenhuma matéria vinculada (Geral)
                  </span>
                </SelectItem>
                {uniqueCourses.map((c) => {
                  const hasValidCode = Boolean(
                    c.code &&
                    c.code !== c.name &&
                    c.code.length <= 12 &&
                    !c.name.startsWith(c.code)
                  );
                  const label = hasValidCode ? `${c.code} - ${c.name}` : c.name;
                  return (
                    <SelectItem
                      key={c.id}
                      value={c.id}
                      label={label}
                    >
                      <span className="font-bold text-xs truncate min-w-0">{label}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Período (Date Range) */}
          <div className="space-y-1.5 min-w-0">
            <label className="text-xs font-black uppercase tracking-wider text-black block">
              Período do Evento {!isReadOnly && <span className="text-correction-red-strong">*</span>}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center min-w-0">
              <div className="space-y-1 min-w-0">
                <label
                  htmlFor="event-start-date"
                  className="text-[11px] font-bold text-neutral-700 block"
                >
                  Data de Início
                </label>
                <input
                  id="event-start-date"
                  type="date"
                  required={!isReadOnly}
                  disabled={isReadOnly}
                  value={startDate}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setStartDate(newStart);
                    if (!endDate || endDate < newStart) {
                      setEndDate(newStart);
                    }
                  }}
                  className="w-full min-w-0 px-3 py-2 text-sm font-medium rounded-xl border-2 border-ink bg-paper focus:outline-hidden focus:ring-2 focus:ring-neo-blue text-black disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1 min-w-0">
                <label
                  htmlFor="event-end-date"
                  className="text-[11px] font-bold text-neutral-700 block"
                >
                  Data de Término
                </label>
                <input
                  id="event-end-date"
                  type="date"
                  required={!isReadOnly}
                  disabled={isReadOnly}
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full min-w-0 px-3 py-2 text-sm font-medium rounded-xl border-2 border-ink bg-paper focus:outline-hidden focus:ring-2 focus:ring-neo-blue text-black disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Descrição oficial (quando disponível) */}
          {event?.description && (
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-black uppercase tracking-wider text-black block">
                Descrição
              </span>
              <p className="text-xs text-neutral-800 leading-relaxed font-medium bg-neutral-100 dark:bg-neutral-800 p-2.5 rounded-xl border border-ink/15 whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}

          {/* Opção de Notificação */}
          {!isReadOnly && (
            <div className="flex items-center gap-2.5 pt-1">
              <Checkbox
                id="event-notify-checkbox"
                checked={notify}
                onCheckedChange={(checked) => setNotify(Boolean(checked))}
                className="data-checked:bg-neo-blue data-checked:text-white"
              />
              <label
                htmlFor="event-notify-checkbox"
                className="cursor-pointer text-xs font-bold text-black select-none flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5 stroke-[2.5] text-neo-blue" />
                <span>Notificar sobre este evento</span>
              </label>
            </div>
          )}

          <DialogFooter className="pt-3">
            {isReadOnly ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer font-bold"
              >
                Fechar
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => onOpenChange(false)}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSaving}
                  className="min-w-[120px]"
                >
                  {isSaving ? 'Salvando...' : event ? 'Salvar Alterações' : 'Criar Evento'}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
