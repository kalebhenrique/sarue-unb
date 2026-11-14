import type {
  Department,
  SemesterOption,
  ScrapedClass,
  ScrapedDiscipline,
  ScrapedProfessor,
  ScheduleOption,
  ScheduleSlot,
  SavedGrade,
} from "../domain/entities/grade";
import { generateAcronyms } from "../domain/utils/grade-acronym";
import type {
  CourseCatalogItem,
  CurriculumStructure,
} from "../domain/entities/course";
import type Database from "@tauri-apps/plugin-sql";
import type {
  ScrapedClass as RawScrapedClass,
  ScheduleOption as RawScheduleOption,
  ScheduleSlot as RawScheduleSlot,
} from "./bindings";
import type { IGradeRepository } from "../domain/interfaces/grade-repo.interface";
import { InMemoryGradeRepository } from "./in-memory-grade.repo";
import { getDatabase } from "./sqlite-feed.repo";
import { mapCurriculaDtos } from "./mappers/curriculum.mapper";
import { parseSavedGradeClassesJson } from "./persistence-codec";

const inMemorySavedGrades = new Map<string, SavedGrade>();
let inMemoryLatestGrade: SavedGrade | null = null;
export class TauriGradeRepository implements IGradeRepository {
  private fallbackRepo = new InMemoryGradeRepository();

  private async getDb(): Promise<Database | null> {
    const db = await getDatabase();
    if (!db) return null;
    return db;
  }

  async getDepartments(): Promise<Department[]> {
    try {
      const { commands } = await import("@/core/infrastructure/bindings");
      const response = await commands.getSigaaDepartments();
      if (response.status === "error") {
        throw new Error(response.error);
      }
      if (response.data && response.data.length > 0) {
        return response.data as Department[];
      }
    } catch {
      // Degradação elegante com fallback
    }
    return this.fallbackRepo.getDepartments();
  }

  async getSemesters(): Promise<SemesterOption[]> {
    return this.fallbackRepo.getSemesters();
  }

  async getProfessors(): Promise<ScrapedProfessor[]> {
    try {
      const { commands } = await import("@/core/infrastructure/bindings");
      const response = await commands.getSigaaProfessors();
      if (response.status === "error") {
        throw new Error(response.error);
      }
      if (response.data && response.data.length > 0) {
        return response.data.map((p) => ({
          id: p.id,
          siape: p.siape ?? undefined,
          name: p.name,
          departmentId: p.department_id,
          departmentName: p.department_name,
          departmentIds: p.department_ids || [],
          disciplineCodes: p.discipline_codes || [],
          photoUrl: p.photo_url ?? undefined,
        }));
      }
    } catch {
      // Fallback
    }
    return this.fallbackRepo.getProfessors();
  }

  async getCoursesCatalog(): Promise<CourseCatalogItem[]> {
    try {
      const { commands } = await import("@/core/infrastructure/bindings");
      const response = await commands.getCoursesCatalog();
      if (response.status === "error") {
        throw new Error(response.error);
      }
      if (response.data && response.data.length > 0) {
        return response.data.map((c) => ({
          id: c.id,
          name: c.name,
          degree: c.degree,
          shift: c.shift,
          campus: c.campus,
          modality: c.modality,
          coordinator: c.coordinator ?? undefined,
          curriculaIds: c.curricula_ids || [],
        }));
      }
    } catch {
      // Fallback
    }
    return this.fallbackRepo.getCoursesCatalog();
  }

  async getCourseCurriculum(courseId: string): Promise<CurriculumStructure[]> {
    try {
      const { commands } = await import("@/core/infrastructure/bindings");
      const response = await commands.getCourseCurriculum(courseId);
      if (response.status === "error") {
        throw new Error(response.error);
      }
      if (response.data && response.data.length > 0) {
        return mapCurriculaDtos(response.data);
      }
    } catch {
      // Fallback
    }
    return this.fallbackRepo.getCourseCurriculum(courseId);
  }

  async scrapeDepartmentClasses(
    deptId: string,
    year: string,
    period: string,
  ): Promise<ScrapedDiscipline[]> {
    try {
      const { commands } = await import("@/core/infrastructure/bindings");
      const response = await commands.scrapeSigaaClasses(deptId, year, period);
      if (response.status === "error") {
        throw new Error(response.error);
      }
      const rawDisciplines = response.data;

      if (rawDisciplines && rawDisciplines.length > 0) {
        // Mapeia snake_case para camelCase
        return rawDisciplines.map((d) => {
          const gen = generateAcronyms(d.name);
          return {
            code: d.code,
            name: d.name,
            departmentId: d.department_id || deptId,
            acronym: d.acronym || gen.acronym || undefined,
            acronyms:
              d.acronyms ||
              (gen.acronyms.length > 0 ? gen.acronyms : undefined),
            classes: (d.classes || []).map((c: RawScrapedClass) => ({
              id: c.id,
              disciplineCode: c.discipline_code,
              disciplineName: c.discipline_name,
              classCode: c.class_code,
              teachers: c.teachers || [],
              classroom: c.classroom || "A definir",
              scheduleCode: c.schedule_code,
              scheduleDescription: c.schedule_description ?? undefined,
              dateRange: c.date_range ?? undefined,
              scheduleSlots: (c.schedule_slots || []).map(
                (s: RawScheduleSlot) => ({
                  day: s.day,
                  dayName: s.day_name,
                  shift: s.shift as ScheduleSlot["shift"],
                  period: s.period,
                  timeRange: s.time_range,
                  globalSlotIndex: s.global_slot_index,
                }),
              ),
              vacancies: c.vacancies ?? undefined,
              occupied: c.occupied ?? undefined,
            })),
          };
        });
      }
    } catch {
      // Degradação elegante com fallback
    }
    return this.fallbackRepo.scrapeDepartmentClasses(deptId, year, period);
  }

  async checkConflicts(classes: ScrapedClass[]): Promise<string[]> {
    try {
      const { commands } = await import("@/core/infrastructure/bindings");
      const response = await commands.checkScheduleConflicts(
        classes.map((c) => ({
          id: c.id,
          discipline_code: c.disciplineCode,
          discipline_name: c.disciplineName,
          class_code: c.classCode,
          teachers: c.teachers,
          classroom: c.classroom,
          schedule_code: c.scheduleCode,
          schedule_description: c.scheduleDescription ?? null,
          date_range: c.dateRange ?? null,
          schedule_slots: c.scheduleSlots.map((s) => ({
            day: s.day,
            day_name: s.dayName,
            shift: s.shift,
            period: s.period,
            time_range: s.timeRange,
            global_slot_index: s.globalSlotIndex,
          })),
          vacancies: c.vacancies ?? null,
          occupied: c.occupied ?? null,
        })),
      );
      if (response.status === "ok") return response.data;
    } catch (e) {
      console.warn(
        "[TauriGradeRepository] Falha ao checar conflitos via Tauri, usando solver local:",
        e,
      );
    }

    // Fallback TS delegado ao repositório em memória
    return this.fallbackRepo.checkConflicts(classes);
  }

  async solveSchedules(
    classes: ScrapedClass[],
    preferenceShift?: "M" | "T" | "N",
  ): Promise<ScheduleOption[]> {
    try {
      const { commands } = await import("@/core/infrastructure/bindings");
      const response = await commands.solveSchedules(
        classes.map((c) => ({
          id: c.id,
          discipline_code: c.disciplineCode,
          discipline_name: c.disciplineName,
          class_code: c.classCode,
          teachers: c.teachers,
          classroom: c.classroom,
          schedule_code: c.scheduleCode,
          schedule_description: c.scheduleDescription ?? null,
          date_range: c.dateRange ?? null,
          schedule_slots: c.scheduleSlots.map((s) => ({
            day: s.day,
            day_name: s.dayName,
            shift: s.shift,
            period: s.period,
            time_range: s.timeRange,
            global_slot_index: s.globalSlotIndex,
          })),
          vacancies: c.vacancies ?? null,
          occupied: c.occupied ?? null,
        })),
        preferenceShift ?? null,
      );

      if (response.status === "error") {
        throw new Error(response.error);
      }
      const rawOptions = response.data;

      if (rawOptions && rawOptions.length > 0) {
        return rawOptions.map((opt: RawScheduleOption) => ({
          id: opt.id,
          hasConflict: opt.has_conflict,
          conflicts: opt.conflicts || [],
          score: opt.score || 0,
          classes: (opt.classes || []).map((c: RawScrapedClass) => ({
            id: c.id,
            disciplineCode: c.discipline_code,
            disciplineName: c.discipline_name,
            classCode: c.class_code,
            teachers: c.teachers || [],
            classroom: c.classroom || "A definir",
            scheduleCode: c.schedule_code,
            scheduleDescription: c.schedule_description ?? undefined,
            dateRange: c.date_range ?? undefined,
            scheduleSlots: (c.schedule_slots || []).map(
              (s: RawScheduleSlot) => ({
                day: s.day,
                dayName: s.day_name,
                shift: s.shift as ScheduleSlot["shift"],
                period: s.period,
                timeRange: s.time_range,
                globalSlotIndex: s.global_slot_index,
              }),
            ),
            vacancies: c.vacancies ?? undefined,
            occupied: c.occupied ?? undefined,
          })),
        }));
      }
    } catch (e) {
      console.warn(
        "[TauriGradeRepository] Falha ao resolver grade via Tauri, usando solver local:",
        e,
      );
    }

    return this.fallbackRepo.solveSchedules(classes, preferenceShift);
  }

  async saveGrade(grade: SavedGrade): Promise<void> {
    inMemorySavedGrades.set(grade.semester, grade);
    inMemoryLatestGrade = grade;
    const db = await this.getDb();
    if (db) {
      await db.execute(
        `INSERT OR REPLACE INTO saved_grades (id, name, semester, data, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        [
          grade.id,
          grade.name,
          grade.semester,
          JSON.stringify(grade.selectedClasses),
          grade.updatedAt,
        ],
      );
    }
  }

  async getSavedGrade(semester?: string): Promise<SavedGrade | null> {
    const db = await this.getDb();
    if (db) {
      try {
        const query = semester
          ? `SELECT id, name, semester, data, updated_at FROM saved_grades WHERE semester = $1 ORDER BY updated_at DESC LIMIT 1`
          : `SELECT id, name, semester, data, updated_at FROM saved_grades ORDER BY updated_at DESC LIMIT 1`;
        const params = semester ? [semester] : [];
        const rows = await db.select<
          {
            id: string;
            name: string;
            semester: string;
            data: string;
            updated_at: string;
          }[]
        >(query, params);
        if (rows && rows.length > 0) {
          const row = rows[0];
          const loaded: SavedGrade = {
            id: row.id,
            name: row.name,
            semester: row.semester,
            selectedClasses: parseSavedGradeClassesJson(row.data),
            updatedAt: row.updated_at,
          };
          inMemorySavedGrades.set(loaded.semester, loaded);
          return loaded;
        }
      } catch (e) {
        console.warn("[TauriGradeRepository] Falha ao ler grade do SQLite:", e);
      }
    }
    if (semester) {
      return inMemorySavedGrades.get(semester) ?? null;
    }
    return inMemoryLatestGrade;
  }

  async clearSavedGrade(semester?: string): Promise<void> {
    if (semester) {
      inMemorySavedGrades.delete(semester);
      if (inMemoryLatestGrade?.semester === semester) {
        inMemoryLatestGrade = null;
      }
    } else {
      inMemorySavedGrades.clear();
      inMemoryLatestGrade = null;
    }
    const db = await this.getDb();
    if (db) {
      try {
        if (semester) {
          await db.execute("DELETE FROM saved_grades WHERE semester = $1", [
            semester,
          ]);
        } else {
          await db.execute("DELETE FROM saved_grades");
        }
      } catch (e) {
        console.warn("[TauriGradeRepository] Falha ao limpar saved_grades:", e);
      }
    }
  }
}
