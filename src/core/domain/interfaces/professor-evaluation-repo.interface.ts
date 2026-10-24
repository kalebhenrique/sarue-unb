import type { ProfessorEvaluation } from '../entities/professor-evaluation';

export interface IProfessorEvaluationRepository {
  getEvaluations(forceRefresh?: boolean): Promise<ProfessorEvaluation[]>;
}
