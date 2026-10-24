import type { Department, SemesterOption, ScrapedClass, ScrapedDiscipline, ScrapedProfessor, ScheduleOption, SavedGrade } from '../entities/grade';
import type { CourseCatalogItem, CurriculumStructure } from '../entities/course';

export interface IGradeRepository {
  getDepartments(): Promise<Department[]>;
  getSemesters?(): Promise<SemesterOption[]>;
  scrapeDepartmentClasses(deptId: string, year: string, period: string): Promise<ScrapedDiscipline[]>;
  getProfessors?(): Promise<ScrapedProfessor[]>;
  getCoursesCatalog?(): Promise<CourseCatalogItem[]>;
  getCourseCurriculum?(courseId: string): Promise<CurriculumStructure[]>;
  solveSchedules(classes: ScrapedClass[], preferenceShift?: 'M' | 'T' | 'N'): Promise<ScheduleOption[]>;
  checkConflicts(classes: ScrapedClass[]): Promise<string[]>;
  saveGrade(grade: SavedGrade): Promise<void>;
  getSavedGrade(semester?: string): Promise<SavedGrade | null>;
  clearSavedGrade(semester?: string): Promise<void>;
}
