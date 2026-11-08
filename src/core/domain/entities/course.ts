import type { PlatformType } from './feed-item';

export interface Course {
  id: string;
  code: string;
  name: string;
  semester: string;
  platform: PlatformType;
  professor?: string;
  classroom?: string;
  schedule?: string;
  turma?: string;
  unreadCount?: number;
  pendingAssignmentsCount?: number;
  url?: string;
  absences?: number;
  maxAbsences?: number;
}

export interface CourseAssociation {
  aprenderCourseId: string;
  sigaaCourseId: string | null;
  isIgnored: boolean;
  updatedAt?: string;
}

export interface Discipline {
  id: string;
  code: string;
  name: string;
  semester: string;
  professor?: string;
  classroom?: string;
  schedule?: string;
  turma?: string;
  sigaaCourse?: Course;
  aprenderCourses: Course[];
  teamsCourses: Course[];
  url?: string;
  unreadCount?: number;
  pendingAssignmentsCount?: number;
  absences?: number;
  maxAbsences?: number;
}

export interface CourseCatalogItem {
  id: string;
  name: string;
  degree: string;
  shift: string;
  campus: string;
  modality: string;
  coordinator?: string;
  curriculaIds: string[];
}

export interface CurriculumDiscipline {
  code: string;
  name: string;
  workloadHours: number;
  level?: number;
  nature: 'Obrigatória' | 'Optativa' | 'Complementar';
  prerequisitesRaw?: string;
  prerequisites: string[];
  equivalencesRaw?: string;
  equivalences: string[];
}

export interface CurriculumStructure {
  id: string;
  courseId: string;
  courseName: string;
  code: string;
  createdYear?: string;
  status: string;
  shift?: string;
  totalHours?: number;
  minElectiveHours?: number;
  minComplementaryHours?: number;
  mandatoryDisciplines: CurriculumDiscipline[];
  electiveDisciplines: CurriculumDiscipline[];
  complementaryDisciplines: CurriculumDiscipline[];
}

