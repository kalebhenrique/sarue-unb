import type { StudentAcademicProfile } from '../domain/entities/academic-profile';
import type { CurriculumDiscipline, CurriculumStructure } from '../domain/entities/course';
import type { ScrapedClass, ScheduleSlot } from '../domain/entities/grade';
import type { IraScenario, IraScenarioDiscipline, IraScenarioSemester } from '../domain/entities/ira-scenario';

function asArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? val : [];
}

function asString(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

function asOptionalString(val: unknown): string | undefined {
  return typeof val === 'string' ? val : undefined;
}

function asNumber(val: unknown, fallback = 0): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

function asOptionalNumber(val: unknown): number | undefined {
  return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
}

export function normalizeCurriculumDiscipline(raw: unknown): CurriculumDiscipline | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const code = asString(d.code);
  const name = asString(d.name);
  if (!code || !name) return null;

  return {
    code,
    name,
    workloadHours: asNumber(d.workloadHours ?? d.workload_hours, 0),
    level: asOptionalNumber(d.level),
    nature:
      d.nature === 'Optativa' || d.nature === 'Complementar'
        ? d.nature
        : 'Obrigatória',
    prerequisitesRaw: asOptionalString(d.prerequisitesRaw ?? d.prerequisites_raw),
    prerequisites: asArray<unknown>(d.prerequisites).filter((x): x is string => typeof x === 'string'),
    equivalencesRaw: asOptionalString(d.equivalencesRaw ?? d.equivalences_raw),
    equivalences: asArray<unknown>(d.equivalences).filter((x): x is string => typeof x === 'string'),
  };
}

export function normalizeCurriculumStructure(raw: unknown): CurriculumStructure | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const id = asString(c.id);
  const courseId = asString(c.courseId ?? c.course_id);
  const courseName = asString(c.courseName ?? c.course_name);
  const code = asString(c.code);
  if (!id || !courseId || !courseName) return null;

  const mapList = (list: unknown): CurriculumDiscipline[] =>
    asArray<unknown>(list)
      .map(normalizeCurriculumDiscipline)
      .filter((item): item is CurriculumDiscipline => item !== null);

  return {
    id,
    courseId,
    courseName,
    code: code || id,
    createdYear: asOptionalString(c.createdYear ?? c.created_year),
    status: asString(c.status, 'Ativa'),
    shift: asOptionalString(c.shift),
    totalHours: asOptionalNumber(c.totalHours ?? c.total_hours),
    minElectiveHours: asOptionalNumber(c.minElectiveHours ?? c.min_elective_hours),
    minComplementaryHours: asOptionalNumber(c.minComplementaryHours ?? c.min_complementary_hours),
    mandatoryDisciplines: mapList(c.mandatoryDisciplines ?? c.mandatory_disciplines),
    electiveDisciplines: mapList(c.electiveDisciplines ?? c.elective_disciplines),
    complementaryDisciplines: mapList(c.complementaryDisciplines ?? c.complementary_disciplines),
  };
}

export function parseCurriculumListJson(json: string): CurriculumStructure[] {
  try {
    const parsed = JSON.parse(json);
    return asArray<unknown>(parsed)
      .map(normalizeCurriculumStructure)
      .filter((c): c is CurriculumStructure => c !== null);
  } catch {
    return [];
  }
}

export function parseAcademicProfileJson(json: string): StudentAcademicProfile | null {
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as Record<string, unknown>;
    const matricula = asString(p.matricula).trim();
    if (!matricula) return null;

    const customCurr = p.customCurriculum
      ? normalizeCurriculumStructure(p.customCurriculum) ?? undefined
      : undefined;

    return {
      matricula,
      trancadaEvents: Array.isArray(p.trancadaEvents)
        ? p.trancadaEvents
            .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object' && typeof (t as Record<string, unknown>).code === 'string'))
            .map((t) => ({
              code: asString(t.code),
              period: asOptionalString(t.period),
            }))
        : undefined,
      studentName: asOptionalString(p.studentName),
      courseName: asString(p.courseName, 'CURSO NÃO IDENTIFICADO'),
      degree: asOptionalString(p.degree),
      shift: asOptionalString(p.shift),
      level: asString(p.level, 'GRADUAÇÃO'),
      admissionYear: asString(p.admissionYear, ''),
      curriculumCode: asOptionalString(p.curriculumCode),
      curriculumId: asOptionalString(p.curriculumId),
      nativeCourseName: asOptionalString(p.nativeCourseName),
      nativeCurriculumCode: asOptionalString(p.nativeCurriculumCode),
      nativeCurriculumId: asOptionalString(p.nativeCurriculumId),
      userSelectedCurriculumCode: asOptionalString(p.userSelectedCurriculumCode),
      userSelectedCurriculumId: asOptionalString(p.userSelectedCurriculumId),
      userSelectedCourseName: asOptionalString(p.userSelectedCourseName),
      customCurriculum: customCurr,
      completedDisciplines: asArray<unknown>(p.completedDisciplines ?? p.completed_disciplines)
        .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === 'object' && typeof (d as Record<string, unknown>).code === 'string'))
        .map((d) => ({
          code: asString(d.code),
          name: asString(d.name, asString(d.code)),
          workloadHours: asOptionalNumber(d.workloadHours ?? d.workload_hours),
          period: asOptionalString(d.period),
          grade: asOptionalString(d.grade),
          situation: asOptionalString(d.situation),
          isCompleted: Boolean(d.isCompleted ?? d.is_completed ?? true),
          classCode: asOptionalString(d.classCode ?? d.class_code),
        })),
      manualCompletedCodes: asArray<unknown>(p.manualCompletedCodes ?? p.manual_completed_codes).filter(
        (c): c is string => typeof c === 'string',
      ),
      manualUncompletedCodes: asArray<unknown>(p.manualUncompletedCodes ?? p.manual_uncompleted_codes).filter(
        (c): c is string => typeof c === 'string',
      ),
      updatedAt: asString(p.updatedAt ?? p.updated_at, new Date(0).toISOString()),
      ira: asOptionalNumber(p.ira),
      mp: asOptionalNumber(p.mp),
      chObrigatoriaPendente: asOptionalNumber(p.chObrigatoriaPendente),
      chOptativaPendente: asOptionalNumber(p.chOptativaPendente),
      chTotalCurriculo: asOptionalNumber(p.chTotalCurriculo),
      chComplementarPendente: asOptionalNumber(p.chComplementarPendente),
      percentualIntegralizado: asOptionalNumber(p.percentualIntegralizado),
    };
  } catch {
    return null;
  }
}

export function parseSavedGradeClassesJson(json: string): ScrapedClass[] {
  try {
    const raw = JSON.parse(json);
    return asArray<unknown>(raw)
      .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
      .map((c) => {
        const disciplineCode = asString(c.disciplineCode ?? c.discipline_code);
        const classCode = asString(c.classCode ?? c.class_code);
        const id = asString(c.id, classCode ? `${disciplineCode}-${classCode}` : disciplineCode);
        const slots = asArray<unknown>(c.scheduleSlots ?? c.schedule_slots)
          .filter(
            (s): s is Record<string, unknown> =>
              Boolean(
                s &&
                  typeof s === 'object' &&
                  typeof (s as Record<string, unknown>).day === 'number' &&
                  typeof (s as Record<string, unknown>).period === 'number' &&
                  ((s as Record<string, unknown>).shift === 'M' ||
                    (s as Record<string, unknown>).shift === 'T' ||
                    (s as Record<string, unknown>).shift === 'N'),
              ),
          )
          .map((s): ScheduleSlot => ({
            day: s.day as number,
            dayName: asString(s.dayName ?? s.day_name, ''),
            shift: s.shift as ScheduleSlot['shift'],
            period: s.period as number,
            timeRange: asString(s.timeRange ?? s.time_range, ''),
            globalSlotIndex: asNumber(s.globalSlotIndex ?? s.global_slot_index, 0),
          }));

        return {
          id,
          disciplineCode,
          disciplineName: asString(c.disciplineName ?? c.discipline_name, disciplineCode),
          classCode,
          teachers: asArray<unknown>(c.teachers).filter((t): t is string => typeof t === 'string'),
          classroom: asString(c.classroom, 'A definir'),
          scheduleCode: asString(c.scheduleCode ?? c.schedule_code, ''),
          scheduleDescription: asOptionalString(c.scheduleDescription ?? c.schedule_description),
          dateRange: asOptionalString(c.dateRange ?? c.date_range),
          scheduleSlots: slots,
          vacancies: asOptionalNumber(c.vacancies),
          occupied: asOptionalNumber(c.occupied),
        };
      })
      .filter((c) => Boolean(c.disciplineCode && c.classCode));
  } catch {
    return [];
  }
}

export function parseIraScenarioJson(json: string): IraScenario | null {
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    if (!Array.isArray(s.semesters)) return null;

    const semesters: IraScenarioSemester[] = s.semesters
      .filter((sem): sem is Record<string, unknown> => Boolean(sem && typeof sem === 'object'))
      .map((sem, idx) => ({
        id: asString(sem.id, `sem-${idx + 1}`),
        label: asString(sem.label, `${idx + 1}º Semestre`),
        period: asOptionalString(sem.period),
        kind:
          sem.kind === 'unknown' || sem.kind === 'current' || sem.kind === 'future'
            ? sem.kind
            : 'history',
        disciplines: asArray<unknown>(sem.disciplines)
          .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === 'object'))
          .map((d, dIdx): IraScenarioDiscipline => ({
            id: asString(d.id, `disc-${idx}-${dIdx}`),
            code: asOptionalString(d.code),
            name: asString(d.name, typeof d.code === 'string' ? d.code : 'Disciplina'),
            credits: asNumber(d.credits, 4),
            workloadHours: asOptionalNumber(d.workloadHours),
            mention:
              d.mention === 'SS' ||
              d.mention === 'MS' ||
              d.mention === 'MM' ||
              d.mention === 'MI' ||
              d.mention === 'II' ||
              d.mention === 'SR'
                ? d.mention
                : null,
            nature:
              d.nature === 'Obrigatória' || d.nature === 'Optativa' || d.nature === 'Complementar'
                ? d.nature
                : undefined,
            origin: d.origin === 'added' ? 'added' : 'history',
          })),
      }));

    return {
      semesters,
      baseTrancadasObrigatorias: asNumber(s.baseTrancadasObrigatorias, 0),
      baseTrancadasOptativas: asNumber(s.baseTrancadasOptativas, 0),
      extraTrancadasObrigatorias: asNumber(s.extraTrancadasObrigatorias, 0),
      extraTrancadasOptativas: asNumber(s.extraTrancadasOptativas, 0),
      profileSignature: asOptionalString(s.profileSignature),
      updatedAt: asString(s.updatedAt, new Date(0).toISOString()),
    };
  } catch {
    return null;
  }
}
