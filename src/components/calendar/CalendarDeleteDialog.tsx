import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@/components/ui';
import type { UnifiedCalendarEvent } from '@/core';

interface CalendarDeleteDialogProps {
  event: UnifiedCalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
}

export const CalendarDeleteDialog: React.FC<CalendarDeleteDialogProps> = ({
  event,
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}) => {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-correction-red-strong">
            Excluir Evento
          </DialogTitle>
          <DialogDescription>
            Tem certeza de que deseja remover <span className="font-extrabold text-black">"{event.title}"</span> do seu calendário? Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="pt-4">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="md"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Excluindo...' : 'Sim, excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
