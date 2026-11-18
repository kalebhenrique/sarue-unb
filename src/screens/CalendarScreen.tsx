import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Plus, SlidersHorizontal } from 'lucide-react';
import {
  BottomSheet,
  Checkbox,
  FloatingActionButton,
  HeaderIconButton,
  PageContainer,
  PageHeader,
} from '@/components/ui';
import { useCalendar } from '@/hooks/useCalendar';
import {
  CalendarToolbar,
  CalendarMonthGrid,
  CalendarDayAgenda,
  CalendarAgendaView,
  CalendarEventDialog,
  CalendarDeleteDialog,
  buildCourseFilterOptions,
} from '@/components/calendar';

export const CalendarScreen: React.FC = () => {
  const {
    currentDate,
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    filteredEvents,
    eventsForSelectedDate,
    courses,
    monthGridDays,
    isSaving,
    // Filtros
    showAcademic,
    setShowAcademic,
    showManual,
    setShowManual,
    showFeedTasks,
    setShowFeedTasks,
    selectedCourse,
    setSelectedCourse,
    // Navegação
    nextMonth,
    prevMonth,
    goToMonth,
    goToToday,
    // Diálogos e ações
    isEventDialogOpen,
    editingEvent,
    prefilledDate,
    prefilledEndDate,
    openCreateDialog,
    openEditDialog,
    closeEventDialog,
    saveManualEvent,
    eventToDelete,
    setEventToDelete,
    deleteManualEvent,
    toggleFeedTaskCompleted,
  } = useCalendar();

  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);

  const courseOptions = useMemo(
    () => buildCourseFilterOptions(courses),
    [courses],
  );

  const hasActiveFilters =
    !showAcademic ||
    !showManual ||
    !showFeedTasks ||
    (Boolean(selectedCourse) && selectedCourse !== 'all');

  const handleResetFilters = () => {
    setShowAcademic(true);
    setShowManual(true);
    setShowFeedTasks(true);
    setSelectedCourse('all');
  };

  return (
    <PageContainer>
      {/* Cabeçalho da Página */}
      <PageHeader
        icon={CalendarIcon}
        title="Calendário"
        mobileActions={
          <HeaderIconButton
            aria-label="Filtros do calendário"
            hasActiveIndicator={hasActiveFilters}
            active={filtersSheetOpen || hasActiveFilters}
            onClick={() => setFiltersSheetOpen(true)}
          >
            <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
          </HeaderIconButton>
        }
      />

      <div className="space-y-3 md:space-y-6">
        {/* Barra de Ferramentas com Navegação, Filtros e Seleção de Matéria */}
        <CalendarToolbar
          currentDate={currentDate}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onSelectMonth={goToMonth}
          onGoToToday={goToToday}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showAcademic={showAcademic}
          onToggleAcademic={() => setShowAcademic((prev) => !prev)}
          showManual={showManual}
          onToggleManual={() => setShowManual((prev) => !prev)}
          showFeedTasks={showFeedTasks}
          onToggleFeedTasks={() => setShowFeedTasks((prev) => !prev)}
          courses={courses}
          selectedCourse={selectedCourse}
          onCourseChange={setSelectedCourse}
          onOpenCreateDialog={() => openCreateDialog()}
          onResetFilters={handleResetFilters}
        />

        {/* Conteúdo Principal do Calendário */}
        {viewMode === 'month' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Grade Mensal (7 colunas do grid do Tailwind) */}
            <div className="lg:col-span-7 xl:col-span-8">
              <CalendarMonthGrid
                days={monthGridDays}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onAddEventOnDate={(startDate, endDate) => openCreateDialog(startDate, endDate)}
                onEventClick={openEditDialog}
              />
            </div>

            {/* Painel Lateral da Agenda do Dia Selecionado (5 colunas) */}
            <div className="lg:col-span-5 xl:col-span-4 sticky top-6">
              <CalendarDayAgenda
                selectedDate={selectedDate}
                events={eventsForSelectedDate}
                onAddEvent={(date) => openCreateDialog(date)}
                onEditEvent={openEditDialog}
                onDeleteEvent={setEventToDelete}
                onToggleFeedTask={toggleFeedTaskCompleted}
              />
            </div>
          </div>
        ) : (
          /* Visão Completa de Linha do Tempo / Agenda */
          <div className="w-full">
            <CalendarAgendaView
              events={filteredEvents}
              onAddEvent={() => openCreateDialog()}
              onEditEvent={openEditDialog}
              onDeleteEvent={setEventToDelete}
              onToggleFeedTask={toggleFeedTaskCompleted}
            />
          </div>
        )}
      </div>

      {/* Modal de Criação / Edição de Evento */}
      <CalendarEventDialog
        open={isEventDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeEventDialog();
        }}
        event={editingEvent}
        prefilledDate={prefilledDate}
        prefilledEndDate={prefilledEndDate}
        courses={courses}
        onSave={saveManualEvent}
        isSaving={isSaving}
      />

      {/* Modal de Confirmação de Exclusão */}
      <CalendarDeleteDialog
        open={Boolean(eventToDelete)}
        onOpenChange={(open) => {
          if (!open) setEventToDelete(null);
        }}
        event={eventToDelete}
        onConfirm={async () => {
          if (eventToDelete) {
            await deleteManualEvent(eventToDelete.id);
          }
        }}
        isDeleting={isSaving}
      />
      {/* Bottom Sheet de filtros no mobile */}
      <BottomSheet
        open={filtersSheetOpen}
        onClose={() => setFiltersSheetOpen(false)}
        role="dialog"
        aria-label="Filtros do calendário"
        backdrop
        backdropClassName="z-40 md:hidden"
        className="fixed inset-x-0 bottom-0 w-full z-50 md:hidden"
        portal
        dragOnlyOnHandle
      >
        <div className="px-4 max-h-[calc(85dvh-2rem)] overflow-y-auto overflow-x-hidden pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-2 pb-3 border-b-2 border-ink/10">
            <h2 className="text-base font-extrabold tracking-tight text-black">
              Filtros do calendário
            </h2>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="cursor-pointer text-xs font-bold text-neutral-600 underline hover:text-black"
              >
                Limpar filtros
              </button>
            ) : null}
          </div>

          <div className="space-y-4 pt-3 pb-2">
            <div className="space-y-2.5">
              <span className="text-xs font-extrabold uppercase tracking-wide text-neutral-600">
                Fontes de eventos
              </span>
              <div className="space-y-2.5">
                <label className="cursor-pointer flex items-center gap-2.5 text-sm font-bold text-black select-none">
                  <Checkbox
                    checked={showAcademic}
                    onCheckedChange={() => setShowAcademic((prev) => !prev)}
                    className="data-checked:bg-[#468AFB] data-checked:text-white"
                  />
                  <span>Calendário Acadêmico (UnB)</span>
                </label>

                <label className="cursor-pointer flex items-center gap-2.5 text-sm font-bold text-black select-none">
                  <Checkbox
                    checked={showManual}
                    onCheckedChange={() => setShowManual((prev) => !prev)}
                    className="data-checked:bg-neo-green data-checked:text-ink"
                  />
                  <span>Meus Eventos</span>
                </label>

                <label className="cursor-pointer flex items-center gap-2.5 text-sm font-bold text-black select-none">
                  <Checkbox
                    checked={showFeedTasks}
                    onCheckedChange={() => setShowFeedTasks((prev) => !prev)}
                    className="data-checked:bg-neo-yellow data-checked:text-ink"
                  />
                  <span>Tarefas do Feed</span>
                </label>
              </div>
            </div>

            {courseOptions.length > 1 ? (
              <div className="space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wide text-neutral-600">
                  Disciplina
                </span>
                <div className="flex flex-wrap gap-2">
                  {courseOptions.map((opt) => {
                    const selected = (selectedCourse || 'all') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedCourse(opt.value)}
                        className={`cursor-pointer px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-ink text-left max-w-full truncate transition-colors ${
                          selected
                            ? 'bg-neo-blue text-white'
                            : 'bg-paper text-black hover:bg-neutral-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </BottomSheet>

      <FloatingActionButton
        variant="primary"
        icon={Plus}
        aria-label="Novo evento pessoal"
        title="Novo evento pessoal"
        onClick={() => openCreateDialog()}
        className="md:hidden"
      />
    </PageContainer>
  );
};
