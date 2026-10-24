import type {
  Department,
  SemesterOption,
  ScrapedClass,
  ScrapedDiscipline,
  ScrapedProfessor,
  ScheduleOption,
  ScheduleSlot,
  SavedGrade,
} from '../domain/entities/grade';
import { generateAcronyms } from '../domain/grade-acronym';
import type {
  CourseCatalogItem,
  CurriculumStructure,
} from '../domain/entities/course';
import type { IGradeRepository } from '../domain/interfaces/grade-repo.interface';

// Dados de demonstração para prévia no navegador (sem Tauri) e testes,
// com IDs oficiais do SIGAA UnB. O container só instancia este repository
// fora do runtime Tauri; o app empacotado nunca os usa.
const DEMO_DEPARTMENTS: Department[] = [
  { id: '508', name: 'DEPTO CIÊNCIAS DA COMPUTAÇÃO - CIC' },
  { id: '518', name: 'DEPARTAMENTO DE MATEMÁTICA - MAT' },
  { id: '514', name: 'DEPTO ESTATÍSTICA - EST' },
  { id: '443', name: 'DEPTO ENGENHARIA ELÉTRICA - ENE' },
  { id: '449', name: 'DEPARTAMENTO DE ENGENHARIA MECÂNICA - ENM' },
  { id: '440', name: 'DEPARTAMENTO DE ENGENHARIA CIVIL E AMBIENTAL - ENC' },
  { id: '524', name: 'INSTITUTO DE FÍSICA - IF' },
  { id: '610', name: 'INSTITUTO DE QUÍMICA - IQ' },
  { id: '327', name: 'DEPTO ADMINISTRAÇÃO - ADM' },
  { id: '333', name: 'DEPTO CIÊNCIAS CONTÁBEIS ATUARIAIS - CCA' },
  { id: '335', name: 'DEPTO ECONOMIA - ECO' },
  { id: '673', name: 'CAMPUS UNB GAMA - FGA' },
  { id: '672', name: 'CAMPUS UNB CEILÂNDIA - FCE' },
  { id: '675', name: 'CAMPUS UNB PLANALTINA - FUP' },
  { id: '401', name: 'FACULDADE DE DIREITO - FD' },
  { id: '379', name: 'FACULDADE DE MEDICINA - FM' },
];

function parseScheduleCodeTS(scheduleStr: string): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  const regex = /(\d+)([MTN])(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(scheduleStr)) !== null) {
    const daysPart = match[1];
    const shift = match[2] as 'M' | 'T' | 'N';
    const periodsPart = match[3];

    for (const dayCh of daysPart) {
      const day = parseInt(dayCh, 10);
      const dayName =
        day === 2
          ? 'Seg'
          : day === 3
          ? 'Ter'
          : day === 4
          ? 'Qua'
          : day === 5
          ? 'Qui'
          : day === 6
          ? 'Sex'
          : 'Sáb';

      for (const periodCh of periodsPart) {
        const period = parseInt(periodCh, 10);
        let timeRange = '';
        let globalSlotIndex = 0;

        if (shift === 'M') {
          globalSlotIndex = period - 1;
          timeRange =
            period === 1
              ? '08:00 - 08:55'
              : period === 2
              ? '08:55 - 09:50'
              : period === 3
              ? '10:00 - 10:55'
              : period === 4
              ? '10:55 - 11:50'
              : '12:00 - 12:55';
        } else if (shift === 'T') {
          globalSlotIndex = 5 + (period - 1);
          timeRange =
            period === 1
              ? '12:55 - 13:50'
              : period === 2
              ? '14:00 - 14:55'
              : period === 3
              ? '14:55 - 15:50'
              : period === 4
              ? '16:00 - 16:55'
              : period === 5
              ? '16:55 - 17:50'
              : '18:00 - 18:55';
        } else {
          globalSlotIndex = 11 + (period - 1);
          timeRange =
            period === 1
              ? '19:00 - 19:50'
              : period === 2
              ? '19:50 - 20:40'
              : period === 3
              ? '20:50 - 21:40'
              : '21:40 - 22:30';
        }

        const slot: ScheduleSlot = {
          day,
          dayName,
          shift,
          period,
          timeRange,
          globalSlotIndex,
        };

        if (
          !slots.some(
            (s) => s.day === slot.day && s.globalSlotIndex === slot.globalSlotIndex
          )
        ) {
          slots.push(slot);
        }
      }
    }
  }

  return slots;
}

const DEMO_DISCIPLINES: Record<string, ScrapedDiscipline[]> = {
  '508': [
    {
      code: 'CIC0004',
      name: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
      departmentId: '508',
      classes: [
        {
          id: 'CIC0004-01',
          disciplineCode: 'CIC0004',
          disciplineName: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
          classCode: '01',
          teachers: ['Prof. Carla Rocha'],
          classroom: 'PJC BT 110',
          scheduleCode: '24M34',
          scheduleSlots: parseScheduleCodeTS('24M34'),
          vacancies: 40,
          occupied: 38,
        },
        {
          id: 'CIC0004-02',
          disciplineCode: 'CIC0004',
          disciplineName: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
          classCode: '02',
          teachers: ['Prof. Vinicius Ruela'],
          classroom: 'ICC SUL AT 55',
          scheduleCode: '35T23',
          scheduleSlots: parseScheduleCodeTS('35T23'),
          vacancies: 45,
          occupied: 42,
        },
        {
          id: 'CIC0004-03',
          disciplineCode: 'CIC0004',
          disciplineName: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
          classCode: '03',
          teachers: ['Prof. Frank Ned'],
          classroom: 'PAT AT 04/10',
          scheduleCode: '24N12',
          scheduleSlots: parseScheduleCodeTS('24N12'),
          vacancies: 35,
          occupied: 30,
        },
      ],
    },
    {
      code: 'CIC0090',
      name: 'ESTRUTURAS DE DADOS',
      departmentId: '508',
      classes: [
        {
          id: 'CIC0090-01',
          disciplineCode: 'CIC0090',
          disciplineName: 'ESTRUTURAS DE DADOS',
          classCode: '01',
          teachers: ['Prof. Carlos Eduardo'],
          classroom: 'PJC BT 112',
          scheduleCode: '24T23',
          scheduleSlots: parseScheduleCodeTS('24T23'),
          vacancies: 40,
          occupied: 39,
        },
        {
          id: 'CIC0090-02',
          disciplineCode: 'CIC0090',
          disciplineName: 'ESTRUTURAS DE DADOS',
          classCode: '02',
          teachers: ['Prof. Tiago Alves'],
          classroom: 'ICC SUL BT 22',
          scheduleCode: '35M12',
          scheduleSlots: parseScheduleCodeTS('35M12'),
          vacancies: 40,
          occupied: 37,
        },
      ],
    },
    {
      code: 'CIC0097',
      name: 'BANCOS DE DADOS',
      departmentId: '508',
      classes: [
        {
          id: 'CIC0097-01',
          disciplineCode: 'CIC0097',
          disciplineName: 'BANCOS DE DADOS',
          classCode: '01',
          teachers: ['Prof. Maristela Holanda'],
          classroom: 'PJC BT 114',
          scheduleCode: '24M12',
          scheduleSlots: parseScheduleCodeTS('24M12'),
          vacancies: 35,
          occupied: 35,
        },
        {
          id: 'CIC0097-02',
          disciplineCode: 'CIC0097',
          disciplineName: 'BANCOS DE DADOS',
          classCode: '02',
          teachers: ['Prof. Sergio Lifschitz'],
          classroom: 'ICC SUL AT 40',
          scheduleCode: '35T45',
          scheduleSlots: parseScheduleCodeTS('35T45'),
          vacancies: 35,
          occupied: 30,
        },
      ],
    },
  ],
  '518': [
    {
      code: 'MAT0025',
      name: 'CÁLCULO 1',
      departmentId: '518',
      classes: [
        {
          id: 'MAT0025-01',
          disciplineCode: 'MAT0025',
          disciplineName: 'CÁLCULO 1',
          classCode: '01',
          teachers: ['Prof. Luciana Maria'],
          classroom: 'ICC CENTRO AT 10',
          scheduleCode: '246M12',
          scheduleSlots: parseScheduleCodeTS('246M12'),
          vacancies: 60,
          occupied: 58,
        },
        {
          id: 'MAT0025-02',
          disciplineCode: 'MAT0025',
          disciplineName: 'CÁLCULO 1',
          classCode: '02',
          teachers: ['Prof. Marcos Paulo'],
          classroom: 'PAT AT 01',
          scheduleCode: '246T23',
          scheduleSlots: parseScheduleCodeTS('246T23'),
          vacancies: 60,
          occupied: 55,
        },
        {
          id: 'MAT0025-03',
          disciplineCode: 'MAT0025',
          disciplineName: 'CÁLCULO 1',
          classCode: '03',
          teachers: ['Prof. Ricardo Ramos'],
          classroom: 'PJC BT 201',
          scheduleCode: '246N12',
          scheduleSlots: parseScheduleCodeTS('246N12'),
          vacancies: 50,
          occupied: 48,
        },
      ],
    },
    {
      code: 'MAT0031',
      name: 'ÁLGEBRA LINEAR',
      departmentId: '518',
      classes: [
        {
          id: 'MAT0031-01',
          disciplineCode: 'MAT0031',
          disciplineName: 'ÁLGEBRA LINEAR',
          classCode: '01',
          teachers: ['Prof. Yuri Dumaresq'],
          classroom: 'ICC CENTRO AT 12',
          scheduleCode: '35M34',
          scheduleSlots: parseScheduleCodeTS('35M34'),
          vacancies: 50,
          occupied: 47,
        },
        {
          id: 'MAT0031-02',
          disciplineCode: 'MAT0031',
          disciplineName: 'ÁLGEBRA LINEAR',
          classCode: '02',
          teachers: ['Prof. Daniela Amorim'],
          classroom: 'PAT AT 03',
          scheduleCode: '35T23',
          scheduleSlots: parseScheduleCodeTS('35T23'),
          vacancies: 50,
          occupied: 45,
        },
      ],
    },
  ],
};


const inMemorySavedGrades = new Map<string, SavedGrade>();
let inMemoryLatestGrade: SavedGrade | null = null;

export class InMemoryGradeRepository implements IGradeRepository {
  private departmentsCache: Department[] | null = null;
  private semestersCache: SemesterOption[] | null = null;
  private classesCache: ScrapedDiscipline[] | null = null;
  private coursesCache: CourseCatalogItem[] | null = null;
  private curriculaCache: CurriculumStructure[] | null = null;
  private professorsCache: ScrapedProfessor[] | null = null;

  private isUnitTest(): boolean {
    return (
      typeof process !== 'undefined' &&
      Boolean(process.env?.VITEST || process.env?.NODE_ENV === 'test')
    );
  }

  /**
   * Dentro do Tauri (WebKitGTK), fetch do webview para hosts externos pende
   * até o loader interno desistir: o fallback remoto nunca deve rodar aqui —
   * o comando Rust correspondente é o caminho canônico e o /data local basta.
   */
  private isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  async getDepartments(): Promise<Department[]> {
    if (this.departmentsCache && this.departmentsCache.length > 0) {
      return this.departmentsCache;
    }

    if (typeof fetch !== 'undefined' && !this.isUnitTest()) {
      const urls = this.isTauriRuntime()
        ? ['/data/departments.json']
        : [
            '/data/departments.json',
            'https://kalebhenrique.github.io/sarue-unb/data/departments.json',
            'https://raw.githubusercontent.com/kalebhenrique/sarue-unb/gh-pages/data/departments.json',
          ];
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = (await res.json()) as Department[];
            if (Array.isArray(data) && data.length > 0) {
              this.departmentsCache = data;
              return data;
            }
          }
        } catch {}
      }
    }

    return DEMO_DEPARTMENTS;
  }

  async getSemesters(): Promise<SemesterOption[]> {
    if (this.semestersCache && this.semestersCache.length > 0) {
      return this.semestersCache;
    }

    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/data/semesters.json');
        if (res.ok) {
          const raw = (await res.json()) as Array<{
            value: string;
            year: string;
            period: string;
            label: string;
            isCurrent?: boolean;
            is_current?: boolean;
          }>;
          if (Array.isArray(raw) && raw.length > 0) {
            // Remove períodos inválidos como 3 (inexistente na UnB)
            const clean = raw
              .filter((d) => d.period !== '3')
              .map((d) => ({
                value: d.value,
                year: d.year,
                period: d.period,
                label: d.label,
                isCurrent: d.isCurrent ?? d.is_current ?? false,
              }));
            if (clean.length > 0) {
              this.semestersCache = clean;
              return clean;
            }
          }
        }
      } catch {}
    }

    return [
      { value: '2026-2', year: '2026', period: '2', label: '2026 • 2º semestre', isCurrent: true },
      { value: '2027-1', year: '2027', period: '1', label: '2027 • 1º semestre' },
    ];
  }

  async scrapeDepartmentClasses(
    deptId: string,
    _year: string,
    _period: string
  ): Promise<ScrapedDiscipline[]> {
    if (!this.classesCache && typeof fetch !== 'undefined' && !this.isUnitTest()) {
      const candidateUrls = this.isTauriRuntime()
        ? ['/data/classes.json']
        : [
            '/data/classes.json',
            'https://kalebhenrique.github.io/sarue-unb/data/classes.json',
            'https://raw.githubusercontent.com/kalebhenrique/sarue-unb/gh-pages/data/classes.json',
          ];
      for (const url of candidateUrls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const raw = (await res.json()) as Array<{
              code: string;
              name: string;
              department_id: string;
              acronym?: string;
              acronyms?: string[];
              classes: Array<{
                id: string;
                discipline_code: string;
                discipline_name: string;
                class_code: string;
                teachers?: string[];
                classroom?: string;
                schedule_code: string;
                schedule_description?: string;
                date_range?: string;
                schedule_slots?: Array<{
                  day: number;
                  day_name?: string;
                  dayName?: string;
                  shift: ScheduleSlot['shift'];
                  period: number;
                  time_range?: string;
                  timeRange?: string;
                  global_slot_index?: number;
                  globalSlotIndex?: number;
                }>;
                vacancies?: number;
                occupied?: number;
              }>;
            }>;

            if (Array.isArray(raw) && raw.length > 0) {
              this.classesCache = raw.map((d) => {
                const gen = generateAcronyms(d.name);
                return {
                  code: d.code,
                  name: d.name,
                  departmentId: d.department_id || deptId,
                  acronym: d.acronym || gen.acronym || undefined,
                  acronyms: d.acronyms || (gen.acronyms.length > 0 ? gen.acronyms : undefined),
                  classes: (d.classes || []).map((c) => {
                    const vacancies =
                      c.vacancies !== undefined
                        ? c.vacancies
                        : c.occupied !== undefined
                        ? c.occupied
                        : undefined;
                    const occupied =
                      c.vacancies !== undefined ? c.occupied : c.occupied !== undefined ? 0 : undefined;

                    return {
                      id: c.id,
                      disciplineCode: c.discipline_code,
                      disciplineName: c.discipline_name,
                      classCode: c.class_code,
                      teachers: c.teachers || [],
                      classroom: c.classroom || 'A definir',
                      scheduleCode: c.schedule_code,
                      scheduleDescription: c.schedule_description,
                      dateRange: c.date_range,
                      scheduleSlots: (c.schedule_slots || []).map((s) => ({
                        day: s.day,
                        dayName: s.dayName || s.day_name || '',
                        shift: s.shift,
                        period: s.period,
                        timeRange: s.timeRange || s.time_range || '',
                        globalSlotIndex:
                          s.globalSlotIndex !== undefined
                            ? s.globalSlotIndex
                            : s.global_slot_index || 0,
                      })),
                      vacancies,
                      occupied,
                    };
                  }),
                };
              });
              break;
            }
          }
        } catch {}
      }
    }

    if (this.classesCache) {
      if (!deptId || deptId.toUpperCase() === 'ALL' || deptId === '*') {
        return this.classesCache;
      }
      const filtered = this.classesCache.filter((d) => d.departmentId === deptId);
      if (filtered.length > 0) {
        return filtered;
      }
    }

    const fallbackList = DEMO_DISCIPLINES[deptId] || [
      {
        code: 'EST0023',
        name: 'PROBABILIDADE E ESTATÍSTICA',
        departmentId: deptId,
        classes: [
          {
            id: 'EST0023-01',
            disciplineCode: 'EST0023',
            disciplineName: 'PROBABILIDADE E ESTATÍSTICA',
            classCode: '01',
            teachers: ['Prof. Maria Antonia'],
            classroom: 'ICC ALA SUL AT 30',
            scheduleCode: '24T45',
            scheduleSlots: parseScheduleCodeTS('24T45'),
            vacancies: 45,
            occupied: 40,
          },
        ],
      },
    ];

    return fallbackList.map((d) => {
      const gen = generateAcronyms(d.name);
      return {
        ...d,
        acronym: d.acronym || gen.acronym || undefined,
        acronyms: d.acronyms || (gen.acronyms.length > 0 ? gen.acronyms : undefined),
      };
    });
  }

  async getProfessors(): Promise<ScrapedProfessor[]> {
    if (this.professorsCache && this.professorsCache.length > 0) {
      return this.professorsCache;
    }

    if (typeof fetch !== 'undefined' && !this.isUnitTest()) {
      const candidateUrls = this.isTauriRuntime()
        ? ['/data/professors.json']
        : [
            '/data/professors.json',
            'https://kalebhenrique.github.io/sarue-unb/data/professors.json',
            'https://raw.githubusercontent.com/kalebhenrique/sarue-unb/gh-pages/data/professors.json',
          ];
      for (const url of candidateUrls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const raw = (await res.json()) as Array<{
              id: string;
              siape?: string;
              name: string;
              department_id: string;
              department_name: string;
              department_ids?: string[];
              discipline_codes?: string[];
              photo_url?: string;
              public_url?: string;
            }>;
            if (Array.isArray(raw) && raw.length > 0) {
              this.professorsCache = raw.map((p) => ({
                id: p.id,
                siape: p.siape,
                name: p.name,
                departmentId: p.department_id,
                departmentName: p.department_name,
                departmentIds: p.department_ids || [],
                disciplineCodes: p.discipline_codes || [],
                photoUrl: p.photo_url,
                publicUrl: p.public_url,
              }));
              return this.professorsCache;
            }
          }
        } catch {}
      }
    }

    // Sintetiza a partir de scrapeDepartmentClasses('ALL')
    const allDisciplines = await this.scrapeDepartmentClasses('ALL', '2026', '2');
    const allDepts = await this.getDepartments();
    const deptNameMap = new Map(allDepts.map((d) => [d.id, d.name]));
    const byName = new Map<string, ScrapedProfessor>();

    for (const disc of allDisciplines) {
      const deptName = deptNameMap.get(disc.departmentId) || 'UnB';
      for (const cls of disc.classes || []) {
        for (const t of cls.teachers || []) {
          const clean = t.replace(/^Prof\.?\s+/i, '').trim();
          if (!clean || clean.toUpperCase() === 'A DEFINIR') continue;
          const key = clean.toUpperCase();
          const existing = byName.get(key);
          if (existing) {
            if (!existing.disciplineCodes.includes(disc.code)) {
              existing.disciplineCodes.push(disc.code);
            }
            if (!existing.departmentIds.includes(disc.departmentId)) {
              existing.departmentIds.push(disc.departmentId);
            }
          } else {
            byName.set(key, {
              id: `prof-${disc.departmentId}-${key.replace(/\s+/g, '-')}`,
              name: clean.toUpperCase(),
              departmentId: disc.departmentId,
              departmentName: deptName,
              departmentIds: [disc.departmentId],
              disciplineCodes: [disc.code],
            });
          }
        }
      }
    }

    this.professorsCache = Array.from(byName.values());
    return this.professorsCache;
  }

  async checkConflicts(classes: ScrapedClass[]): Promise<string[]> {
    const conflicts: string[] = [];
    const slotMap = new Map<string, ScrapedClass>();

    for (const c of classes) {
      for (const slot of c.scheduleSlots) {
        const key = `${slot.day}-${slot.globalSlotIndex}`;
        const existing = slotMap.get(key);
        if (existing) {
          if (existing.disciplineCode !== c.disciplineCode) {
            const desc = `Conflito na ${slot.dayName} (${slot.timeRange}) entre ${existing.disciplineCode} e ${c.disciplineCode}`;
            if (!conflicts.includes(desc)) conflicts.push(desc);
          }
        } else {
          slotMap.set(key, c);
        }
      }
    }

    return conflicts;
  }

  async solveSchedules(
    classes: ScrapedClass[],
    preferenceShift?: 'M' | 'T' | 'N'
  ): Promise<ScheduleOption[]> {
    const byDiscipline = new Map<string, ScrapedClass[]>();
    for (const c of classes) {
      const list = byDiscipline.get(c.disciplineCode) || [];
      list.push(c);
      byDiscipline.set(c.disciplineCode, list);
    }

    const groups = Array.from(byDiscipline.values());
    if (groups.length === 0) return [];

    let combinations: ScrapedClass[][] = [[]];
    for (const group of groups) {
      const next: ScrapedClass[][] = [];
      for (const curr of combinations) {
        for (const opt of group) {
          next.push([...curr, opt]);
        }
      }
      combinations = next.slice(0, 100);
    }

    const validOptions: ScheduleOption[] = [];
    for (let i = 0; i < combinations.length; i++) {
      const comb = combinations[i];
      const conflicts = await this.checkConflicts(comb);
      if (conflicts.length === 0) {
        let score = 100;
        if (preferenceShift) {
          for (const c of comb) {
            for (const s of c.scheduleSlots) {
              score += s.shift === preferenceShift ? 10 : -5;
            }
          }
        }
        validOptions.push({
          id: `opt-${i + 1}`,
          classes: comb,
          hasConflict: false,
          conflicts: [],
          score,
        });
      }
    }

    validOptions.sort((a, b) => b.score - a.score);
    return validOptions;
  }

  async getCoursesCatalog(): Promise<CourseCatalogItem[]> {
    if (this.coursesCache && this.coursesCache.length > 0) {
      return this.coursesCache;
    }

    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/data/courses.json');
        if (res.ok) {
          const raw = (await res.json()) as Array<{
            id: string;
            name: string;
            degree: string;
            shift: string;
            campus: string;
            modality: string;
            coordinator?: string | null;
            curricula_ids?: string[];
          }>;
          if (Array.isArray(raw)) {
            const mapped: CourseCatalogItem[] = raw.map((c) => ({
              id: c.id,
              name: c.name,
              degree: c.degree,
              shift: c.shift,
              campus: c.campus,
              modality: c.modality,
              coordinator: c.coordinator ?? undefined,
              curriculaIds: c.curricula_ids || [],
            }));
            this.coursesCache = mapped;
            return mapped;
          }
        }
      } catch {}
    }

    return [
      {
        id: '414112',
        name: 'ADMINISTRAÇÃO',
        degree: 'Bacharelado',
        shift: 'DIURNO',
        campus: 'BRASÍLIA',
        modality: 'Presencial',
        coordinator: 'CARLA PEIXOTO BORGES',
        curriculaIds: ['456'],
      },
      {
        id: '414002',
        name: 'CIÊNCIA DA COMPUTAÇÃO',
        degree: 'Bacharelado',
        shift: 'DIURNO',
        campus: 'BRASÍLIA',
        modality: 'Presencial',
        coordinator: 'Coordenação CIC',
        curriculaIds: ['508'],
      },
    ];
  }

  async getCourseCurriculum(courseId: string): Promise<CurriculumStructure[]> {
    if (!this.curriculaCache && typeof fetch !== 'undefined') {
      const candidateUrls = this.isTauriRuntime()
        ? ['/data/curricula.json']
        : [
            '/data/curricula.json',
            'https://kalebhenrique.github.io/sarue-unb/data/curricula.json',
            'https://raw.githubusercontent.com/kalebhenrique/sarue-unb/gh-pages/data/curricula.json',
          ];

      for (const url of candidateUrls) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;

          interface RawCurriculumDiscipline {
            code: string;
            name: string;
            workload_hours: number;
            level?: number | null;
            nature: 'Obrigatória' | 'Optativa' | 'Complementar';
            prerequisites_raw?: string | null;
            prerequisites?: string[];
            equivalences_raw?: string | null;
            equivalences?: string[];
          }

          interface RawCurriculumStructure {
            id: string;
            course_id: string;
            course_name: string;
            code: string;
            created_year?: string | null;
            status: string;
            shift?: string | null;
            total_hours?: number | null;
            mandatory_disciplines?: RawCurriculumDiscipline[];
            elective_disciplines?: RawCurriculumDiscipline[];
            complementary_disciplines?: RawCurriculumDiscipline[];
          }

          const raw = (await res.json()) as RawCurriculumStructure[];
          if (Array.isArray(raw) && raw.length > 0) {
            const mapDisc = (d: RawCurriculumDiscipline) => ({
              code: d.code,
              name: d.name,
              workloadHours: d.workload_hours,
              level: d.level ?? undefined,
              nature: d.nature,
              prerequisitesRaw: d.prerequisites_raw ?? undefined,
              prerequisites: d.prerequisites || [],
              equivalencesRaw: d.equivalences_raw ?? undefined,
              equivalences: d.equivalences || [],
            });

            this.curriculaCache = raw.map((curr) => ({
              id: curr.id,
              courseId: curr.course_id,
              courseName: curr.course_name,
              code: curr.code,
              createdYear: curr.created_year ?? undefined,
              status: curr.status,
              shift: curr.shift ?? undefined,
              totalHours: curr.total_hours ?? undefined,
              mandatoryDisciplines: (curr.mandatory_disciplines || []).map(mapDisc),
              electiveDisciplines: (curr.elective_disciplines || []).map(mapDisc),
              complementaryDisciplines: (curr.complementary_disciplines || []).map(mapDisc),
            }));
            break;
          }
        } catch {}
      }
    }

    if (this.curriculaCache) {
      const filtered = this.curriculaCache.filter((c) => c.courseId === courseId);
      if (filtered.length > 0) {
        return filtered;
      }
    }

    return [
      {
        id: `${courseId}-demo`,
        courseId,
        courseName: 'Curso UnB Demo',
        code: '1/2026',
        createdYear: '2026',
        status: 'Ativa',
        shift: 'Diurno',
        totalHours: 3000,
        mandatoryDisciplines: [
          {
            code: 'CIC0004',
            name: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
            workloadHours: 60,
            level: 1,
            nature: 'Obrigatória',
            prerequisites: [],
            equivalences: [],
          },
          {
            code: 'MAT0025',
            name: 'CÁLCULO 1',
            workloadHours: 90,
            level: 1,
            nature: 'Obrigatória',
            prerequisites: [],
            equivalences: [],
          },
        ],
        electiveDisciplines: [],
        complementaryDisciplines: [],
      },
    ];
  }

  async saveGrade(grade: SavedGrade): Promise<void> {
    inMemorySavedGrades.set(grade.semester, grade);
    inMemoryLatestGrade = grade;
  }

  async getSavedGrade(semester?: string): Promise<SavedGrade | null> {
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
  }
}
