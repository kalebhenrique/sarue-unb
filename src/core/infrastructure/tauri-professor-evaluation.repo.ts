import type { ProfessorEvaluation } from '../domain/entities/professor-evaluation';
import { parseProfessorEvaluationsCsv } from '../domain/entities/professor-evaluation';
import type { IProfessorEvaluationRepository } from '../domain/interfaces/professor-evaluation-repo.interface';
import { InMemoryProfessorEvaluationRepository } from './in-memory-professor-evaluation.repo';

export class TauriProfessorEvaluationRepository
  implements IProfessorEvaluationRepository
{
  private fallbackRepo = new InMemoryProfessorEvaluationRepository();
  private cache: ProfessorEvaluation[] | null = null;

  async getEvaluations(forceRefresh = false): Promise<ProfessorEvaluation[]> {
    if (!forceRefresh && this.cache && this.cache.length > 0) {
      return this.cache;
    }

    try {
      const { commands } = await import('@/core/infrastructure/bindings');
      const response = await commands.fetchProfessorEvaluationsCsv(
        Boolean(forceRefresh)
      );
      if (response.status === 'ok' && response.data) {
        const parsed = parseProfessorEvaluationsCsv(response.data);
        if (parsed.length > 0) {
          this.cache = parsed;
          return parsed;
        }
      }
    } catch {
      // Degradação elegante com fallback web / memória
    }

    const fallback = await this.fallbackRepo.getEvaluations(forceRefresh);
    if (fallback.length > 0) {
      this.cache = fallback;
    }
    return fallback;
  }
}
