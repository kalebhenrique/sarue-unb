export interface DisciplineColor {
  bg: string;
  border: string;
  text: string;
  hex: string;
}

export const DISCIPLINE_COLORS: DisciplineColor[] = [
  { bg: 'bg-pastel-blue', border: 'border-[#468AFB]', text: 'text-ink-disc-blue', hex: '#468AFB' },
  { bg: 'bg-pastel-green', border: 'border-[#16A34A]', text: 'text-ink-disc-green', hex: '#16A34A' },
  { bg: 'bg-pastel-yellow', border: 'border-[#EAB308]', text: 'text-ink-disc-yellow', hex: '#EAB308' },
  { bg: 'bg-pastel-purple', border: 'border-[#A855F7]', text: 'text-ink-disc-purple', hex: '#A855F7' },
  { bg: 'bg-pastel-orange', border: 'border-[#F97316]', text: 'text-ink-disc-orange', hex: '#F97316' },
  { bg: 'bg-pastel-sky', border: 'border-[#0EA5E9]', text: 'text-ink-disc-sky', hex: '#0EA5E9' },
];

export const DAYS_HEADER = [
  { id: 2, label: 'Segunda', short: 'Seg' },
  { id: 3, label: 'Terça', short: 'Ter' },
  { id: 4, label: 'Quarta', short: 'Qua' },
  { id: 5, label: 'Quinta', short: 'Qui' },
  { id: 6, label: 'Sexta', short: 'Sex' },
  { id: 7, label: 'Sábado', short: 'Sáb' },
];

export const TIME_ROWS = [
  { shift: 'M', period: 1, range: '08:00–08:55', globalIndex: 0 },
  { shift: 'M', period: 2, range: '08:55–09:50', globalIndex: 1 },
  { shift: 'M', period: 3, range: '10:00–10:55', globalIndex: 2 },
  { shift: 'M', period: 4, range: '10:55–11:50', globalIndex: 3 },
  { shift: 'M', period: 5, range: '12:00–12:55', globalIndex: 4 },
  { shift: 'T', period: 1, range: '12:55–13:50', globalIndex: 5 },
  { shift: 'T', period: 2, range: '14:00–14:55', globalIndex: 6 },
  { shift: 'T', period: 3, range: '14:55–15:50', globalIndex: 7 },
  { shift: 'T', period: 4, range: '16:00–16:55', globalIndex: 8 },
  { shift: 'T', period: 5, range: '16:55–17:50', globalIndex: 9 },
  { shift: 'T', period: 6, range: '18:00–18:55', globalIndex: 10 },
  { shift: 'N', period: 1, range: '19:00–19:50', globalIndex: 11 },
  { shift: 'N', period: 2, range: '19:50–20:40', globalIndex: 12 },
  { shift: 'N', period: 3, range: '20:50–21:40', globalIndex: 13 },
  { shift: 'N', period: 4, range: '21:40–22:30', globalIndex: 14 },
];

export const SHIFT_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'M', label: 'Manhã' },
  { value: 'T', label: 'Tarde' },
  { value: 'N', label: 'Noite' },
];
