import React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/ui';
import { useCalendar } from '@/hooks/useCalendar';
import {
  CalendarToolbar,
  CalendarMonthGrid,
  CalendarDayAgenda,
  CalendarAgendaView,
  CalendarEventDialog,
  CalendarDeleteDialog,
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
    academicCalendar,
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
  } = useCalendar();

  return (
    <PageContainer>
      {/* Cabeçalho da Página informando Calendário e Ano/Semestre */}
      <PageHeader
        icon={CalendarIcon}
        title={
          <>
            Calendário{" "}
            <span className="text-sm font-bold text-neutral-500">
              ({academicCalendar?.label || '2026 • 2º semestre'})
            </span>
          </>
        }
      />

      <div className="space-y-6">
        {/* Barra de Ferramentas com Navegação, Filtros e Seleção de Matéria */}
        <CalendarToolbar
          currentDate={currentDate}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
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
          onResetFilters={() => {
            setShowAcademic(true);
            setShowManual(true);
            setShowFeedTasks(true);
            setSelectedCourse('all');
          }}
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
    </PageContainer>
  );
};
