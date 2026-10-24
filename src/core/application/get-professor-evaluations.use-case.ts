import type {
  ProfessorEvaluation,
  ProfessorEvaluationFilters,
  ProfessorSummary,
  DisciplineSummary,
  CampusName,
} from '../domain/entities/professor-evaluation';
import {
  normalizeText,
  normalizeDisciplineTokens,
  canonicalizeDepartments,
  crossReferenceEvaluationsWithSigaa,
  hasConsistentDifficultyConsensus,
} from '../domain/entities/professor-evaluation';
import type { IProfessorEvaluationRepository } from '../domain/interfaces/professor-evaluation-repo.interface';
import type { IGradeRepository } from '../domain/interfaces/grade-repo.interface';

export class GetProfessorEvaluationsUseCase {
  private enrichedCache: ProfessorEvaluation[] | null = null;
  /** Carga/raspagem em andamento: chamadas concorrentes esperam a mesma promise. */
  private inflightEnriched: Promise<ProfessorEvaluation[]> | null = null;

  constructor(
    private evaluationRepo: IProfessorEvaluationRepository,
    private gradeRepo?: IGradeRepository
  ) {}

  /** Prazo para o enriquecimento SIGAA; estourou, renderiza os dados crus da planilha. */
  private static readonly ENRICHMENT_TIMEOUT_MS = 20_000;
  /** Prazo para o fetch bruto da planilha; estourou, vira erro com "Tentar novamente". */
  private static readonly DATA_TIMEOUT_MS = 25_000;

  private async getEnrichedEvaluations(
    forceRefresh = false
  ): Promise<ProfessorEvaluation[]> {
    if (!forceRefresh && this.enrichedCache && this.enrichedCache.length > 0) {
      return this.enrichedCache;
    }

    // Dedup de chamadas concorrentes: os 4 chamados do hook (+ o double-mount
    // do StrictMode em dev) disparavam 8 raspagens completas do SIGAA em
    // paralelo — o pico de rede/CPU derrubava o WebKit. Agora todos esperam
    // a mesma promise em andamento.
    if (!forceRefresh && this.inflightEnriched) {
      return this.inflightEnriched;
    }

    const work = this.loadAndEnrich(forceRefresh);
    if (!forceRefresh) {
      this.inflightEnriched = work;
      void work
        .catch(() => {})
        .finally(() => {
          if (this.inflightEnriched === work) {
            this.inflightEnriched = null;
          }
        });
    }
    return work;
  }

  private async loadAndEnrich(
    forceRefresh: boolean
  ): Promise<ProfessorEvaluation[]> {
    // Prazo rejeitante: se o fetch bruto pendurar, vira erro (a tela mostra
    // "Tentar novamente") — nunca spinner eterno.
    const rawEvaluations = await new Promise<ProfessorEvaluation[]>(
      (resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error('Tempo esgotado ao carregar as avaliações da planilha.')
            ),
          GetProfessorEvaluationsUseCase.DATA_TIMEOUT_MS
        );
        this.evaluationRepo.getEvaluations(forceRefresh).then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          }
        );
      }
    );

    if (!this.gradeRepo || rawEvaluations.length === 0) {
      this.enrichedCache = rawEvaluations;
      return rawEvaluations;
    }

    // Nunca deixa a tela refém da raspagem completa do catálogo SIGAA (que
    // percorre todos os departamentos e pode demorar minutos ou travar).
    const withDeadline = <T>(p: Promise<T>, fallback: T): Promise<T> => {
      return new Promise<T>((resolve) => {
        const timer = setTimeout(
          () => resolve(fallback),
          GetProfessorEvaluationsUseCase.ENRICHMENT_TIMEOUT_MS
        );
        p.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          () => {
            clearTimeout(timer);
            resolve(fallback);
          }
        );
      });
    };

    const [disciplines, professors, departments] = await Promise.all([
      withDeadline(
        this.gradeRepo
          .scrapeDepartmentClasses('ALL', '2026', '2')
          .catch(() => []),
        []
      ),
      withDeadline(
        this.gradeRepo.getProfessors
          ? this.gradeRepo.getProfessors().catch(() => [])
          : Promise.resolve([]),
        []
      ),
      withDeadline(this.gradeRepo.getDepartments().catch(() => []), []),
    ]);

    try {
      const enriched = crossReferenceEvaluationsWithSigaa(
        rawEvaluations,
        disciplines,
        professors,
        departments
      );
      // Relatos sem professor associado no SIGAA saem do acervo: sem docente
      // verificado, não há como agregá-los com confiança às notas. Se NENHUM
      // relato casou com o catálogo (demo, scrape falhou), o catálogo não
      // serviu — mantém tudo em vez de virar uma tela vazia.
      const matched = enriched.filter((ev) => ev.isSigaaVerified);
      const verified = matched.length > 0 ? matched : enriched;
      const result = canonicalizeDepartments(verified);
      this.enrichedCache = result;
      return result;
    } catch {
      this.enrichedCache = rawEvaluations;
      return rawEvaluations;
    }
  }

  async execute(
    filters?: ProfessorEvaluationFilters,
    forceRefresh = false
  ): Promise<ProfessorEvaluation[]> {
    const all = await this.getEnrichedEvaluations(forceRefresh);
    const filtered = this.applyFilters(all, filters);
    return this.sortEvaluations(filtered, filters?.sortBy ?? 'reviews_desc');
  }

  async getSummaries(
    filters?: ProfessorEvaluationFilters,
    forceRefresh = false
  ): Promise<ProfessorSummary[]> {
    const all = await this.getEnrichedEvaluations(forceRefresh);

    // Os filtros decidem QUEM aparece (basta um relato casar). As notas do
    // card agregam TODOS os relatos do professor, em todas as matérias que
    // ele ofereceu: há poucos relatos por matéria, e o agregado por professor
    // é o sinal confiável para a escolha.
    const matchingKeys = new Set(
      this.applyFilters(all, filters).map((ev) => this.professorKeyOf(ev))
    );
    if (matchingKeys.size === 0) return [];
    const scoped = all.filter((ev) =>
      matchingKeys.has(this.professorKeyOf(ev))
    );

    const groups = new Map<
      string,
      {
        displayName: string;
        siape?: string;
        photoUrl?: string;
        publicUrl?: string;
        isSigaaVerified?: boolean;
        evaluations: ProfessorEvaluation[];
      }
    >();

    for (const ev of scoped) {
      const key = normalizeText(ev.professor)
        .replace(/^PROF(?:ESSOR|ESSORA)?\.?\s+/i, '')
        .trim();
      if (!key) continue;

      const existing = groups.get(key);
      if (existing) {
        existing.evaluations.push(ev);
        if (ev.professor.trim().length > existing.displayName.length) {
          existing.displayName = ev.professor.trim();
        }
        if (!existing.siape && ev.siape) existing.siape = ev.siape;
        if (!existing.photoUrl && ev.photoUrl) existing.photoUrl = ev.photoUrl;
        if (!existing.publicUrl && ev.publicUrl)
          existing.publicUrl = ev.publicUrl;
        if (ev.isSigaaVerified) existing.isSigaaVerified = true;
      } else {
        groups.set(key, {
          displayName: ev.professor.trim(),
          siape: ev.siape,
          photoUrl: ev.photoUrl,
          publicUrl: ev.publicUrl,
          isSigaaVerified: ev.isSigaaVerified,
          evaluations: [ev],
        });
      }
    }

    const summaries: ProfessorSummary[] = [];

    for (const [professorKey, group] of groups.entries()) {
      const evals = [...group.evaluations].sort((a, b) =>
        b.createdAtIso.localeCompare(a.createdAtIso)
      );

      const scores = evals
        .map((e) => e.didaticaScore)
        .filter((s): s is number => s !== null && !Number.isNaN(s));

      const averageDidatica =
        scores.length > 0
          ? Math.round(
              (scores.reduce((acc, s) => acc + s, 0) / scores.length) * 10
            ) / 10
          : null;

      let recommendYesCount = 0;
      let recommendDependeCount = 0;
      let recommendNoCount = 0;

      const campusesSet = new Set<CampusName>();
      const departmentsMap = new Map<string, string>();
      const disciplinesMap = new Map<string, string>();

      for (const e of evals) {
        if (e.recommendation === 'sim') recommendYesCount++;
        else if (e.recommendation === 'depende') recommendDependeCount++;
        else recommendNoCount++;

        if (e.campus) campusesSet.add(e.campus);

        const deptNorm = normalizeText(e.department);
        if (deptNorm && !departmentsMap.has(deptNorm)) {
          departmentsMap.set(deptNorm, e.department.trim());
        }

        const discKey =
          e.disciplineCode ||
          normalizeDisciplineTokens(e.discipline).join(' ') ||
          normalizeText(e.discipline);
        if (discKey) {
          const prev = disciplinesMap.get(discKey);
          if (!prev || e.discipline.trim().length > prev.length) {
            disciplinesMap.set(discKey, e.discipline.trim());
          }
        }
      }

      const total = evals.length;
      const recommendationRate =
        total > 0 ? Math.round((recommendYesCount / total) * 100) : 0;

      summaries.push({
        professorKey,
        professorName: group.displayName,
        siape: group.siape,
        photoUrl: group.photoUrl,
        publicUrl: group.publicUrl,
        isSigaaVerified: group.isSigaaVerified,
        evaluationsCount: total,
        averageDidatica,
        recommendYesCount,
        recommendDependeCount,
        recommendNoCount,
        recommendationRate,
        hasConsistentLevels: hasConsistentDifficultyConsensus(evals),
        campuses: Array.from(campusesSet),
        departments: Array.from(departmentsMap.values()),
        disciplines: Array.from(disciplinesMap.values()),
        evaluations: evals,
      });
    }

    const sortBy = filters?.sortBy ?? 'reviews_desc';
    summaries.sort((a, b) => {
      if (sortBy === 'recommendation_desc') {
        if (a.recommendationRate !== b.recommendationRate) {
          return b.recommendationRate - a.recommendationRate;
        }
        return b.evaluationsCount - a.evaluationsCount;
      }
      if (sortBy === 'rating_desc') {
        const aScore = a.averageDidatica ?? -1;
        const bScore = b.averageDidatica ?? -1;
        if (bScore !== aScore) return bScore - aScore;
        return b.evaluationsCount - a.evaluationsCount;
      }
      if (sortBy === 'rating_asc') {
        const aScore = a.averageDidatica ?? 99;
        const bScore = b.averageDidatica ?? 99;
        if (aScore !== bScore) return aScore - bScore;
        return b.evaluationsCount - a.evaluationsCount;
      }
      // reviews_desc (padrão para visão agrupada)
      if (b.evaluationsCount !== a.evaluationsCount) {
        return b.evaluationsCount - a.evaluationsCount;
      }
      return (b.averageDidatica ?? 0) - (a.averageDidatica ?? 0);
    });

    return summaries;
  }

  async getDisciplineSummaries(
    filters?: ProfessorEvaluationFilters,
    forceRefresh = false
  ): Promise<DisciplineSummary[]> {
    const all = await this.getEnrichedEvaluations(forceRefresh);

    // Mesma política dos professores: os filtros selecionam a matéria (basta
    // um relato casar) e as notas agregam TODOS os relatos dela — o recorte
    // por matéria tem poucos relatos, e este agregado documenta o histórico
    // real da disciplina.
    const matchingKeys = new Set(
      this.applyFilters(all, filters).map((ev) => this.disciplineKeyOf(ev))
    );
    if (matchingKeys.size === 0) return [];
    const scoped = all.filter((ev) =>
      matchingKeys.has(this.disciplineKeyOf(ev))
    );

    const groups = new Map<
      string,
      {
        displayName: string;
        disciplineCode?: string;
        isSigaaVerified?: boolean;
        evaluations: ProfessorEvaluation[];
      }
    >();

    for (const ev of scoped) {
      const key =
        ev.disciplineCode ||
        normalizeDisciplineTokens(ev.discipline).join(' ') ||
        normalizeText(ev.discipline);
      if (!key) continue;

      const existing = groups.get(key);
      if (existing) {
        existing.evaluations.push(ev);
        if (
          (ev.disciplineCode && !existing.disciplineCode) ||
          ev.discipline.trim().length > existing.displayName.length
        ) {
          existing.displayName = ev.discipline.trim();
        }
        if (!existing.disciplineCode && ev.disciplineCode) {
          existing.disciplineCode = ev.disciplineCode;
        }
        if (ev.disciplineCode) {
          existing.isSigaaVerified = true;
        }
      } else {
        groups.set(key, {
          displayName: ev.discipline.trim(),
          disciplineCode: ev.disciplineCode,
          isSigaaVerified: Boolean(ev.disciplineCode),
          evaluations: [ev],
        });
      }
    }

    const summaries: DisciplineSummary[] = [];

    for (const [disciplineKey, group] of groups.entries()) {
      const evals = [...group.evaluations].sort((a, b) =>
        b.createdAtIso.localeCompare(a.createdAtIso)
      );

      const scores = evals
        .map((e) => e.didaticaScore)
        .filter((s): s is number => s !== null && !Number.isNaN(s));

      const averageDidatica =
        scores.length > 0
          ? Math.round(
              (scores.reduce((acc, s) => acc + s, 0) / scores.length) * 10
            ) / 10
          : null;

      let recommendYesCount = 0;
      let recommendDependeCount = 0;
      let recommendNoCount = 0;

      const campusesSet = new Set<CampusName>();
      const departmentsMap = new Map<string, string>();
      const professorsMap = new Map<string, string>();

      for (const e of evals) {
        if (e.recommendation === 'sim') recommendYesCount++;
        else if (e.recommendation === 'depende') recommendDependeCount++;
        else recommendNoCount++;

        if (e.campus) campusesSet.add(e.campus);

        const deptNorm = normalizeText(e.department);
        if (deptNorm && !departmentsMap.has(deptNorm)) {
          departmentsMap.set(deptNorm, e.department.trim());
        }

        const profKey = normalizeText(e.professor)
          .replace(/^PROF(?:ESSOR|ESSORA)?\.?\s+/i, '')
          .trim();
        if (profKey) {
          const prev = professorsMap.get(profKey);
          if (!prev || e.professor.trim().length > prev.length) {
            professorsMap.set(profKey, e.professor.trim());
          }
        }
      }

      const total = evals.length;
      const recommendationRate =
        total > 0 ? Math.round((recommendYesCount / total) * 100) : 0;
      const professorsList = Array.from(professorsMap.values());

      summaries.push({
        disciplineKey,
        disciplineName: group.displayName,
        disciplineCode: group.disciplineCode,
        isSigaaVerified: group.isSigaaVerified,
        evaluationsCount: total,
        professorsCount: professorsList.length,
        averageDidatica,
        recommendYesCount,
        recommendDependeCount,
        recommendNoCount,
        recommendationRate,
        hasConsistentLevels: hasConsistentDifficultyConsensus(evals),
        campuses: Array.from(campusesSet),
        departments: Array.from(departmentsMap.values()),
        professors: professorsList,
        evaluations: evals,
      });
    }

    const sortBy = filters?.sortBy ?? 'reviews_desc';
    summaries.sort((a, b) => {
      if (sortBy === 'recommendation_desc') {
        if (a.recommendationRate !== b.recommendationRate) {
          return b.recommendationRate - a.recommendationRate;
        }
        return b.evaluationsCount - a.evaluationsCount;
      }
      if (sortBy === 'rating_desc') {
        const aScore = a.averageDidatica ?? -1;
        const bScore = b.averageDidatica ?? -1;
        if (bScore !== aScore) return bScore - aScore;
        return b.evaluationsCount - a.evaluationsCount;
      }
      if (sortBy === 'rating_asc') {
        const aScore = a.averageDidatica ?? 99;
        const bScore = b.averageDidatica ?? 99;
        if (aScore !== bScore) return aScore - bScore;
        return b.evaluationsCount - a.evaluationsCount;
      }
      if (b.evaluationsCount !== a.evaluationsCount) {
        return b.evaluationsCount - a.evaluationsCount;
      }
      return (b.averageDidatica ?? 0) - (a.averageDidatica ?? 0);
    });

    return summaries;
  }

  private professorKeyOf(ev: ProfessorEvaluation): string {
    return normalizeText(ev.professor)
      .replace(/^PROF(?:ESSOR|ESSORA)?\.?\s+/i, '')
      .trim();
  }

  private disciplineKeyOf(ev: ProfessorEvaluation): string {
    return (
      ev.disciplineCode ||
      normalizeDisciplineTokens(ev.discipline).join(' ') ||
      normalizeText(ev.discipline)
    );
  }

  private applyFilters(
    items: ProfessorEvaluation[],
    filters?: ProfessorEvaluationFilters
  ): ProfessorEvaluation[] {
    if (!filters) return items;

    const queryNorm = filters.query ? normalizeText(filters.query) : '';

    return items.filter((item) => {
      if (
        filters.campus &&
        filters.campus !== 'all' &&
        item.campus !== filters.campus
      ) {
        return false;
      }

      if (
        filters.recommendation &&
        filters.recommendation !== 'all' &&
        item.recommendation !== filters.recommendation
      ) {
        return false;
      }

      if (
        filters.difficulty &&
        filters.difficulty !== 'all' &&
        item.difficultyLevel !== filters.difficulty
      ) {
        return false;
      }

      if (
        filters.attendance &&
        filters.attendance !== 'all' &&
        item.attendanceStrictness !== filters.attendance
      ) {
        return false;
      }

      if (queryNorm) {
        const matchProf = normalizeText(item.professor).includes(queryNorm);
        const matchProfRaw = item.professorRaw
          ? normalizeText(item.professorRaw).includes(queryNorm)
          : false;
        const matchDisc = normalizeText(item.discipline).includes(queryNorm);
        const matchDiscRaw = item.disciplineRaw
          ? normalizeText(item.disciplineRaw).includes(queryNorm)
          : false;
        const matchDept = normalizeText(item.department).includes(queryNorm);
        const matchFeedback = normalizeText(item.feedback).includes(queryNorm);
        if (
          !matchProf &&
          !matchProfRaw &&
          !matchDisc &&
          !matchDiscRaw &&
          !matchDept &&
          !matchFeedback
        ) {
          return false;
        }
      }

      return true;
    });
  }

  private sortEvaluations(
    items: ProfessorEvaluation[],
    sortBy: NonNullable<ProfessorEvaluationFilters['sortBy']>
  ): ProfessorEvaluation[] {
    const copy = [...items];

    if (sortBy === 'recommendation_desc') {
      const rank = (r: string) => (r === 'sim' ? 2 : r === 'depende' ? 1 : 0);
      return copy.sort(
        (a, b) =>
          rank(b.recommendation) - rank(a.recommendation) ||
          b.createdAtIso.localeCompare(a.createdAtIso)
      );
    }

    if (sortBy === 'rating_desc') {
      return copy.sort((a, b) => {
        const aScore = a.didaticaScore ?? -1;
        const bScore = b.didaticaScore ?? -1;
        if (bScore !== aScore) return bScore - aScore;
        return b.createdAtIso.localeCompare(a.createdAtIso);
      });
    }

    if (sortBy === 'rating_asc') {
      return copy.sort((a, b) => {
        const aScore = a.didaticaScore ?? 99;
        const bScore = b.didaticaScore ?? 99;
        if (aScore !== bScore) return aScore - bScore;
        return b.createdAtIso.localeCompare(a.createdAtIso);
      });
    }

    // 'reviews_desc' -> mais recentes primeiro
    return copy.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  }
}
