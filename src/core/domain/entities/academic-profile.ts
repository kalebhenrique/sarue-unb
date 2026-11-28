import type { CurriculumStructure } from "./course";

export type DisciplineFlowStatus =
  "completed" | "in_progress" | "available" | "locked";

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

export interface TrancadaEvent {
  code: string;
  period?: string;
}

export interface StudentAcademicProfile {
  matricula: string;
  cpf?: string;
  trancadaEvents?: TrancadaEvent[];
  studentName?: string;
  courseName: string;
  degree?: string;
  shift?: string;
  level: string;
  admissionYear: string;
  curriculumCode?: string;
  curriculumId?: string;
  nativeCourseName?: string;
  nativeCurriculumCode?: string;
  nativeCurriculumId?: string;
  userSelectedCurriculumCode?: string;
  userSelectedCurriculumId?: string;
  userSelectedCourseName?: string;
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
  nature: "Obrigatória" | "Optativa" | "Complementar";
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
  isSimulated?: boolean;
  isAlternativeCurriculum?: boolean;
  nativeCourseName?: string;
  nativeCurriculumCode?: string;
}

export interface FlowchartData {
  profile: StudentAcademicProfile;
  curriculum: CurriculumStructure;
  semesters: FlowchartSemester[];
  metrics: FlowchartMetrics;
  electiveCompletedDisciplines: CompletedDiscipline[];
  inProgressDisciplines?: FlowchartDiscipline[];
}

export function hasImportedTranscriptProfile(
  profile?: StudentAcademicProfile | null,
): boolean {
  return Boolean(
    profile &&
    (profile.matricula ||
      profile.completedDisciplines.length > 0 ||
      profile.nativeCurriculumCode),
  );
}
