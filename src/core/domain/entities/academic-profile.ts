import type { CurriculumStructure } from './course';

export type DisciplineFlowStatus = 'completed' | 'in_progress' | 'available' | 'locked';

export interface CompletedDiscipline {
  code: string;
  name: string;
  workloadHours?: number;
  period?: string;
  grade?: string;
  situation?: string;
  isCompleted: boolean;
  classCode?: string;
}

/** Um evento de trancamento no histórico (conta mesmo se aprovado depois). */
export interface TrancadaEvent {
  code: string;
  period?: string;
}

export interface StudentAcademicProfile {
  matricula: string;
  /** Eventos de trancamento acumulados do curso (fator de trancamento do IRA). */
  trancadaEvents?: TrancadaEvent[];
  studentName?: string;
  courseName: string;
  degree?: string;
  shift?: string;
  level: string;
  admissionYear: string;
  curriculumCode?: string;
  curriculumId?: string;
  /** Código da matriz curricular selecionada explicitamente pelo discente (sobrepõe inferência automática). */
  userSelectedCurriculumCode?: string;
  userSelectedCurriculumId?: string;
  /** Matriz customizada editada pelo discente (com matérias incluídas, equivalências e optativas de interesse) */
  customCurriculum?: CurriculumStructure;
  completedDisciplines: CompletedDiscipline[];
  manualCompletedCodes: string[];
  manualUncompletedCodes: string[];
  updatedAt: string;
  ira?: number;
  mp?: number;
  chObrigatoriaPendente?: number;
  chOptativaPendente?: number;
  chTotalCurriculo?: number;
  chComplementarPendente?: number;
  percentualIntegralizado?: number;
}

export interface FlowchartDiscipline {
  code: string;
  name: string;
  workloadHours: number;
  level: number;
  nature: 'Obrigatória' | 'Optativa' | 'Complementar';
  status: DisciplineFlowStatus;
  grade?: string;
  situation?: string;
  prerequisites: string[];
  missingPrerequisites: string[];
  equivalences: string[];
  unlockedDisciplines: string[];
  isManuallyToggled?: boolean;
}

export interface FlowchartSemester {
  level: number;
  totalHours: number;
  disciplines: FlowchartDiscipline[];
}

export interface FlowchartMetrics {
  totalMandatoryDisciplines: number;
  completedMandatoryDisciplines: number;
  mandatoryProgressPercentage: number;
  totalHours: number;
  completedHours: number;
  remainingHours: number;
  availableCount: number;
  inProgressCount: number;
  ira?: number;
  mp?: number;
  chObrigatoriaTotal?: number;
  chObrigatoriaPendente?: number;
  chOptativaPendente?: number;
  chTotalCurriculo?: number;
  chComplementarPendente?: number;
  percentualIntegralizado?: number;
  /** Indica se as métricas refletem uma simulação com marcações manuais ativas */
  isSimulated?: boolean;
}

export interface FlowchartData {
  profile: StudentAcademicProfile;
  curriculum: CurriculumStructure;
  semesters: FlowchartSemester[];
  metrics: FlowchartMetrics;
  electiveCompletedDisciplines: CompletedDiscipline[];
  inProgressDisciplines?: FlowchartDiscipline[];
}
