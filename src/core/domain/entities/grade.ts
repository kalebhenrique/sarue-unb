export interface Department {
  id: string;
  name: string;
}

export interface ScheduleSlot {
  day: number; // 2..=7 (2 = Seg, 3 = Ter, 4 = Qua, 5 = Qui, 6 = Sex, 7 = Sab)
  dayName: string;
  shift: 'M' | 'T' | 'N';
  period: number;
  timeRange: string;
  globalSlotIndex: number; // 0..=14
}

export interface ScrapedClass {
  id: string;
  disciplineCode: string;
  disciplineName: string;
  classCode: string;
  teachers: string[];
  classroom: string;
  scheduleCode: string;
  scheduleDescription?: string;
  dateRange?: string;
  scheduleSlots: ScheduleSlot[];
  vacancies?: number;
  occupied?: number;
}

export interface SemesterOption {
  value: string;
  year: string;
  period: string;
  label: string;
  isCurrent?: boolean;
}

export interface ScrapedDiscipline {
  code: string;
  name: string;
  departmentId: string;
  classes: ScrapedClass[];
  acronym?: string;
  acronyms?: string[];
}

export interface ScrapedProfessor {
  id: string;
  siape?: string;
  name: string;
  departmentId: string;
  departmentName: string;
  departmentIds: string[];
  disciplineCodes: string[];
  photoUrl?: string;
  publicUrl?: string;
}

export interface ScheduleOption {
  id: string;
  classes: ScrapedClass[];
  hasConflict: boolean;
  conflicts: string[];
  score: number;
}

export interface SavedGrade {
  id: string;
  name: string;
  semester: string;
  selectedClasses: ScrapedClass[];
  updatedAt: string;
}
