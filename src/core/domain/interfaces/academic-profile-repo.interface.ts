import type { StudentAcademicProfile } from '../entities/academic-profile';
import type { CurriculumStructure } from '../entities/course';
import type { SigaaCredentials } from '../entities/credential';

export interface SigaaHistoryRawResponse {
  pdfBase64?: string;
  /** Texto do PDF já extraído no Rust: presente, o unpdf do webview é pulado. */
  pdfText?: string;
  matricula: string;
  nome?: string;
  curso: string;
  /** Token de turno do SIGAA no campo Curso (ex.: "MT", "N", "DIURNO"). */
  turno?: string;
  nivel: string;
  status: string;
  entrada: string;
  email?: string;
  ira?: number;
  mp?: number;
  chObrigatoriaPendente?: number;
  chOptativaPendente?: number;
  chTotalCurriculo?: number;
  chComplementarPendente?: number;
  percentualIntegralizado?: number;
}

export interface IAcademicProfileRepository {
  getProfile(): Promise<StudentAcademicProfile | null>;
  saveProfile(profile: StudentAcademicProfile): Promise<void>;
  clearProfile(): Promise<void>;
  getAllCurricula(): Promise<CurriculumStructure[]>;
  /**
   * Matrizes de um único curso (por course_id do catálogo de cursos).
   * Evita baixar o catálogo inteiro da UnB quando só o curso do discente importa.
   */
  getCurriculaForCourse(courseId: string): Promise<CurriculumStructure[]>;
  fetchSigaaHistory(creds: SigaaCredentials): Promise<SigaaHistoryRawResponse>;
}
