import type {
  FlowchartData,
  FlowchartDiscipline,
  FlowchartMetrics,
  FlowchartSemester,
  StudentAcademicProfile,
} from '../domain/entities/academic-profile';
import type { CurriculumStructure, CurriculumDiscipline } from '../domain/entities/course';

export class GetFlowchartUseCase {
  execute(
    curriculum: CurriculumStructure,
    profile: StudentAcademicProfile,
    allCurricula?: CurriculumStructure[]
  ): FlowchartData {
    // 1. Constrói conjunto de disciplinas efetivamente concluídas
    const manualCompleted = new Set(profile.manualCompletedCodes || []);
    const manualUncompleted = new Set(profile.manualUncompletedCodes || []);

    const effectiveCompletedCodes = new Set<string>();
    const inProgressCodes = new Set<string>();
    const disciplineDetailsMap = new Map<string, { grade?: string; situation?: string }>();

    for (const d of profile.completedDisciplines || []) {
      disciplineDetailsMap.set(d.code, { grade: d.grade, situation: d.situation });

      if (d.situation === 'MATR') {
        inProgressCodes.add(d.code);
      }

      if (d.isCompleted && !manualUncompleted.has(d.code)) {
        effectiveCompletedCodes.add(d.code);
      }
    }

    // Adiciona as marcadas manualmente
    for (const code of manualCompleted) {
      effectiveCompletedCodes.add(code);
      inProgressCodes.delete(code);
    }

    // Garante que as desmarcadas manualmente não constem como concluídas
    for (const code of manualUncompleted) {
      effectiveCompletedCodes.delete(code);
    }

    // 2. Mapeamento de equivalências
    // Mapeamento canônico de disciplinas comuns e equivalências do currículo
    const canonicalEquivalences: Record<string, string[]> = {
      MAT0025: ['MAT0137'],
      MAT0137: ['MAT0025'],
      EST0023: ['EST0022'],
      EST0022: ['EST0023'],
      CIC0099: ['CIC0098'],
      CIC0098: ['CIC0099'],
      ENE0304: ['ENE0037'],
      ENE0037: ['ENE0304'],
      ENE0282: ['ENE0038'],
      ENE0038: ['ENE0282'],
      CIC0265: ['CIC0246'],
      CIC0246: ['CIC0265'],
      CIC0266: ['CIC0243'],
      CIC0243: ['CIC0266'],
      CIC0267: ['CIC0353'],
      CIC0353: ['CIC0267'],
      CIC0268: ['CIC0356'],
      CIC0356: ['CIC0268'],
      ENE0067: ['CIC0242'],
      CIC0242: ['ENE0067'],
    };

    const isCompletedOrEquivalent = (targetCode: string, equivalences: string[] = []): boolean => {
      // Marca manual de "não concluída" vence tudo: nem o histórico nem a
      // equivalência concluem a disciplina que o aluno desmarcou explicitamente
      if (manualUncompleted.has(targetCode)) return false;
      if (effectiveCompletedCodes.has(targetCode)) return true;
      const allEqs = new Set([...equivalences, ...(canonicalEquivalences[targetCode] || [])]);
      for (const eq of allEqs) {
        if (effectiveCompletedCodes.has(eq)) return true;
      }
      return false;
    };

    const getEffectiveDetails = (targetCode: string, equivalences: string[] = []): { grade?: string; situation?: string } | undefined => {
      const direct = disciplineDetailsMap.get(targetCode);
      if (direct && (direct.grade || direct.situation === 'APR' || direct.situation === 'DISP')) {
        return direct;
      }
      const allEqs = new Set([...equivalences, ...(canonicalEquivalences[targetCode] || [])]);
      for (const eq of allEqs) {
        if (effectiveCompletedCodes.has(eq)) {
          const eqDetails = disciplineDetailsMap.get(eq);
          if (eqDetails) return eqDetails;
        }
      }
      return direct;
    };

    // 3. Monta a lista de disciplinas da grade: obrigatórias + optativas/complementares cadastradas com semestre
    const rawGradeList: CurriculumDiscipline[] = [
      ...(curriculum.mandatoryDisciplines || []).map((m) => ({
        ...m,
        level: m.level && m.level > 0 ? m.level : 1,
      })),
      ...(curriculum.electiveDisciplines || [])
        .filter((e) => e.level && e.level > 0)
        .map((e) => ({
          ...e,
          nature: e.nature || 'Optativa',
        })),
      ...(curriculum.complementaryDisciplines || [])
        .filter((c) => c.level && c.level > 0)
        .map((c) => ({
          ...c,
          nature: c.nature || 'Complementar',
        })),
    ];

    const seenGradeCodes = new Set<string>();
    const gradeList: CurriculumDiscipline[] = [];
    for (const disc of rawGradeList) {
      if (!seenGradeCodes.has(disc.code)) {
        seenGradeCodes.add(disc.code);
        gradeList.push(disc);
      }
    }

    // Grafo de pós-requisitos (disciplinas que dependem de uma dada matéria)
    const unlockedMap = new Map<string, Set<string>>();

    for (const disc of gradeList) {
      for (const prereq of disc.prerequisites || []) {
        if (!unlockedMap.has(prereq)) {
          unlockedMap.set(prereq, new Set());
        }
        unlockedMap.get(prereq)!.add(disc.code);
      }
    }

    // 4. Classifica cada disciplina da grade (obrigatórias e optativas de interesse)
    const enrichedMandatory: FlowchartDiscipline[] = [];
    let completedMandatoryCount = 0;
    let completedMandatoryHours = 0;
    let completedElectiveHours = 0;
    let chObrigatoriaTotal = 0;
    let availableCount = 0;

    // Avaliador de expressões lógicas de pré-requisitos
    for (const disc of gradeList) {
      const code = disc.code;
      const hours = disc.workloadHours || 60;
      const isOptativa = disc.nature === 'Optativa' || disc.nature === 'Complementar';
      if (!isOptativa) {
        chObrigatoriaTotal += hours;
      }

      const isCompleted = isCompletedOrEquivalent(code, disc.equivalences);
      const isEnrolled = inProgressCodes.has(code);
      const details = getEffectiveDetails(code, disc.equivalences);

      // Avaliação booleana de pré-requisitos (E / OU / parênteses)
      const isPrereqSatisfied = (prereqCode: string): boolean => {
        const prereqObj = gradeList.find((m) => m.code === prereqCode);
        const prereqEquivs = prereqObj?.equivalences || [];
        return isCompletedOrEquivalent(prereqCode, prereqEquivs);
      };

      const getPrereqLabel = (prereqCode: string): string => {
        const prereqObj = gradeList.find((m) => m.code === prereqCode)
          || (allCurricula
            ? allCurricula.flatMap((c) => [
                ...(c.mandatoryDisciplines || []),
                ...(c.electiveDisciplines || []),
              ]).find((m) => m.code === prereqCode)
            : undefined);
        return prereqObj ? `${prereqCode} (${prereqObj.name})` : prereqCode;
      };

      const evalPrereqs = evaluatePrerequisiteExpression(
        disc.prerequisitesRaw,
        disc.prerequisites || [],
        isPrereqSatisfied,
        getPrereqLabel,
      );

      let status: FlowchartDiscipline['status'];
      if (isCompleted) {
        status = 'completed';
        if (!isOptativa) {
          completedMandatoryCount++;
          completedMandatoryHours += hours;
        } else {
          completedElectiveHours += hours;
        }
      } else if (isEnrolled) {
        status = 'in_progress';
      } else if (evalPrereqs.isSatisfied) {
        status = 'available';
        availableCount++;
      } else {
        status = 'locked';
      }

      const unlocked = Array.from(unlockedMap.get(code) || []);
      const isManuallyToggled = manualCompleted.has(code) || manualUncompleted.has(code);

      enrichedMandatory.push({
        code: disc.code,
        name: disc.name,
        workloadHours: hours,
        level: disc.level && disc.level > 0 ? disc.level : 1,
        nature: disc.nature,
        status,
        grade: details?.grade,
        situation: details?.situation,
        prerequisites: disc.prerequisites || [],
        missingPrerequisites: evalPrereqs.missing,
        equivalences: disc.equivalences || [],
        unlockedDisciplines: unlocked,
        isManuallyToggled,
      });
    }

    // 5. Agrupa por semestres (levels)
    const semesterMap = new Map<number, FlowchartDiscipline[]>();
    for (const disc of enrichedMandatory) {
      const lvl = disc.level;
      if (lvl <= 0) continue;
      if (!semesterMap.has(lvl)) {
        semesterMap.set(lvl, []);
      }
      semesterMap.get(lvl)!.push(disc);
    }

    // Garante ordenação dos semestres de 1 ao máximo
    const sortedLevels = Array.from(semesterMap.keys()).sort((a, b) => a - b);
    const semesters: FlowchartSemester[] = sortedLevels.map((level) => {
      const discs = semesterMap.get(level) || [];
      const sumHours = discs.reduce((acc, curr) => acc + curr.workloadHours, 0);
      return {
        level,
        totalHours: sumHours,
        disciplines: discs,
      };
    });

    // 6. Disciplinas cursando (in_progress) - une obrigatórias da grade + optativas/complementares matriculadas
    const allInProgressDisciplines: FlowchartDiscipline[] = [];
    const inProgressCodeSet = new Set<string>();

    for (const disc of enrichedMandatory) {
      if (disc.status === 'in_progress') {
        allInProgressDisciplines.push(disc);
        inProgressCodeSet.add(disc.code);
      }
    }

    for (const d of profile.completedDisciplines || []) {
      if (d.situation === 'MATR' && !inProgressCodeSet.has(d.code)) {
        const fromMandatory = (curriculum.mandatoryDisciplines || []).find((m) => m.code === d.code);
        const fromElective = (curriculum.electiveDisciplines || []).find((e) => e.code === d.code);
        const fromComplementary = (curriculum.complementaryDisciplines || []).find((c) => c.code === d.code);
        let catDisc = fromMandatory || fromElective || fromComplementary;

        // Se não constar na matriz selecionada, busca nas outras matrizes passadas
        if (!catDisc && allCurricula) {
          for (const curr of allCurricula) {
            const found = [
              ...(curr.mandatoryDisciplines || []),
              ...(curr.electiveDisciplines || []),
              ...(curr.complementaryDisciplines || []),
            ].find((cd) => cd.code === d.code);
            if (found) {
              catDisc = found;
              break;
            }
          }
        }

        const discName = d.name && d.name !== d.code ? d.name : catDisc?.name || d.name || d.code;
        const hours = d.workloadHours || catDisc?.workloadHours || 60;
        const nature = fromComplementary ? 'Complementar' : (catDisc?.nature || 'Optativa');

        allInProgressDisciplines.push({
          code: d.code,
          name: discName,
          workloadHours: hours,
          level: catDisc?.level || 0,
          nature,
          status: 'in_progress',
          grade: d.grade,
          situation: 'MATR',
          prerequisites: catDisc?.prerequisites || [],
          missingPrerequisites: [],
          equivalences: catDisc?.equivalences || [],
          unlockedDisciplines: [],
          isManuallyToggled: false,
        });
        inProgressCodeSet.add(d.code);
      }
    }

    // Ordenação alfabética estrita para o painel "Cursando agora"
    allInProgressDisciplines.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    // 7. Disciplinas cursadas pelo aluno que são optativas / fora da grade obrigatória.
    // Classificação contra a MATRIZ ATUAL: se o código é obrigatória aqui, já conta na
    // grade (item 4); se é optativa/complementar, conta pra integralização com a carga
    // real da matriz; se não é nenhum dos dois, aparece no bloco, mas NÃO conta.
    const gradeCodeSet = new Set(gradeList.map((m) => m.code));
    const electiveHoursByCode = new Map<string, number>();
    for (const e of curriculum.electiveDisciplines || []) {
      electiveHoursByCode.set(e.code, e.workloadHours || 60);
    }
    for (const c of curriculum.complementaryDisciplines || []) {
      if (!electiveHoursByCode.has(c.code)) {
        electiveHoursByCode.set(c.code, c.workloadHours || 60);
      }
    }

    const electiveCompletedDisciplines = (profile.completedDisciplines || [])
      .filter((d) => d.isCompleted && !gradeCodeSet.has(d.code))
      .map((d) => {
        if (d.name && d.name !== d.code) return d;
        let resolvedName = d.name;
        if (allCurricula) {
          for (const curr of allCurricula) {
            const found = [
              ...(curr.mandatoryDisciplines || []),
              ...(curr.electiveDisciplines || []),
              ...(curr.complementaryDisciplines || []),
            ].find((cd) => cd.code === d.code);
            if (found?.name) {
              resolvedName = found.name;
              break;
            }
          }
        }
        return { ...d, name: resolvedName || d.code };
      });

    for (const d of electiveCompletedDisciplines) {
      if (manualUncompleted.has(d.code)) continue;
      const matrixHours = electiveHoursByCode.get(d.code);
      if (matrixHours == null) continue; // nem optativa nem complementar na matriz atual: não conta
      let hours = matrixHours;
      if (matrixHours === 60 && (d.workloadHours && d.workloadHours !== 60)) {
        // Matriz sem carga cadastrada: cai pra carga real vinda do histórico
        hours = d.workloadHours;
      }
      completedElectiveHours += hours;
    }

    // 8. Métricas de integralização (incluindo obrigatórias, optativas e complementares)
    const norm = (s?: string) =>
      (s || "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    // Referência oficial do discente no SIGAA
    const nativeCurriculumCode =
      profile.nativeCurriculumCode ||
      (profile.matricula ? profile.curriculumCode : undefined);
    const nativeCourseName =
      profile.nativeCourseName ||
      (profile.matricula ? profile.courseName : undefined);

    const isDifferentCode = Boolean(
      nativeCurriculumCode && curriculum.code !== nativeCurriculumCode
    );
    const isDifferentCourse = Boolean(
      nativeCourseName &&
        curriculum.courseName &&
        !norm(nativeCourseName).includes(norm(curriculum.courseName)) &&
        !norm(curriculum.courseName).includes(norm(nativeCourseName))
    );

    const hasOfficialOrigin = Boolean(profile.matricula || profile.nativeCurriculumCode);
    const isAlternativeCurriculum = Boolean(
      hasOfficialOrigin && (isDifferentCode || isDifferentCourse)
    );

    const isNativeCurriculum = !isAlternativeCurriculum && Boolean(profile.matricula || profile.curriculumCode);

    const totalMandatory = gradeList.filter((m) => m.nature !== 'Optativa' && m.nature !== 'Complementar').length;

    // Detecta se o discente possui simulações (marcações manuais ativas)
    const hasManualOverrides =
      (profile.manualCompletedCodes?.length || 0) > 0 ||
      (profile.manualUncompletedCodes?.length || 0) > 0;

    let manualMandatoryDelta = 0;
    let manualOptativaDelta = 0;

    const resolveDiscInfo = (code: string): { nature: string; hours: number } => {
      const fromGrade = gradeList.find((g) => g.code === code);
      if (fromGrade) return { nature: fromGrade.nature || 'Obrigatória', hours: fromGrade.workloadHours || 60 };
      const fromCurriculum = (curriculum.mandatoryDisciplines || []).find((m) => m.code === code);
      if (fromCurriculum) return { nature: 'Obrigatória', hours: fromCurriculum.workloadHours || 60 };
      const fromElective = (curriculum.electiveDisciplines || []).find((e) => e.code === code);
      if (fromElective) return { nature: 'Optativa', hours: fromElective.workloadHours || 60 };
      const fromComp = (curriculum.complementaryDisciplines || []).find((c) => c.code === code);
      if (fromComp) return { nature: 'Complementar', hours: fromComp.workloadHours || 60 };
      const fromProfile = (profile.completedDisciplines || []).find((d) => d.code === code);
      return { nature: 'Optativa', hours: fromProfile?.workloadHours || 60 };
    };

    if (hasManualOverrides) {
      for (const code of profile.manualCompletedCodes || []) {
        const info = resolveDiscInfo(code);
        if (info.nature === 'Obrigatória') manualMandatoryDelta += info.hours;
        else manualOptativaDelta += info.hours;
      }
      for (const code of profile.manualUncompletedCodes || []) {
        const info = resolveDiscInfo(code);
        if (info.nature === 'Obrigatória') manualMandatoryDelta -= info.hours;
        else manualOptativaDelta -= info.hours;
      }
    }

    const hasExplicitCurriculumElectives =
      curriculum.minElectiveHours != null && curriculum.minElectiveHours > 0;

    const baseElectiveHours =
      hasExplicitCurriculumElectives
        ? curriculum.minElectiveHours!
        : (curriculum.totalHours && curriculum.totalHours > chObrigatoriaTotal
            ? curriculum.totalHours - chObrigatoriaTotal
            : (curriculum.electiveDisciplines && curriculum.electiveDisciplines.length > 0
                ? Math.max(360, Math.round((chObrigatoriaTotal * 0.2) / 30) * 30)
                : 0));

    // Se estiver em simulação de outra matriz/curso, usa a carga total da nova matriz
    const officialTotalHours =
      isNativeCurriculum && profile.chTotalCurriculo
        ? profile.chTotalCurriculo
        : (curriculum.totalHours && curriculum.totalHours > chObrigatoriaTotal
            ? curriculum.totalHours
            : (chObrigatoriaTotal + baseElectiveHours + (curriculum.minComplementaryHours || 0)));

    const chOptativaTotal =
      isNativeCurriculum && profile.chOptativaPendente != null
        ? profile.chOptativaPendente
        : (hasExplicitCurriculumElectives
            ? curriculum.minElectiveHours!
            : Math.max(0, officialTotalHours - chObrigatoriaTotal));

    const effectiveChObrigatoriaPendente =
      isNativeCurriculum && profile.chObrigatoriaPendente != null
        ? Math.max(0, profile.chObrigatoriaPendente - manualMandatoryDelta)
        : Math.max(0, chObrigatoriaTotal - completedMandatoryHours - manualMandatoryDelta);

    const effectiveChOptativaPendente =
      isNativeCurriculum && profile.chOptativaPendente != null
        ? Math.max(0, profile.chOptativaPendente - manualOptativaDelta)
        : Math.max(0, chOptativaTotal - completedElectiveHours - manualOptativaDelta);

    const totalCompletedHours = completedMandatoryHours + completedElectiveHours;

    const effectiveRemainingHours =
      isNativeCurriculum && profile.chTotalCurriculo && profile.chObrigatoriaPendente != null && profile.chOptativaPendente != null
        ? effectiveChObrigatoriaPendente + (effectiveChOptativaPendente ?? 0) + (profile.chComplementarPendente || 0)
        : Math.max(0, officialTotalHours - totalCompletedHours);

    const effectiveCompletedHours =
      isNativeCurriculum && profile.chTotalCurriculo && profile.chObrigatoriaPendente != null && profile.chOptativaPendente != null
        ? Math.max(0, officialTotalHours - effectiveRemainingHours)
        : totalCompletedHours;

    let effectiveProgressPercentage =
      officialTotalHours > 0
        ? Math.min(100, Math.max(0, Math.round((effectiveCompletedHours / officialTotalHours) * 1000) / 10))
        : 0;

    if (isNativeCurriculum && !hasManualOverrides && profile.percentualIntegralizado != null) {
      effectiveProgressPercentage = profile.percentualIntegralizado;
    }

    const metrics: FlowchartMetrics = {
      totalMandatoryDisciplines: totalMandatory,
      completedMandatoryDisciplines: completedMandatoryCount,
      mandatoryProgressPercentage: effectiveProgressPercentage,
      totalHours: officialTotalHours,
      completedHours: effectiveCompletedHours,
      remainingHours: effectiveRemainingHours,
      availableCount,
      inProgressCount: allInProgressDisciplines.length,
      ira: profile.ira,
      mp: profile.mp,
      chObrigatoriaTotal,
      chObrigatoriaPendente: effectiveChObrigatoriaPendente,
      chOptativaPendente: effectiveChOptativaPendente,
      chTotalCurriculo: officialTotalHours,
      chComplementarPendente: isNativeCurriculum ? profile.chComplementarPendente : (curriculum.minComplementaryHours || 0),
      percentualIntegralizado: effectiveProgressPercentage,
      isSimulated: hasManualOverrides || isAlternativeCurriculum || profile.percentualIntegralizado == null,
      isAlternativeCurriculum,
      nativeCourseName,
      nativeCurriculumCode,
    };

    return {
      profile,
      curriculum,
      semesters,
      metrics,
      electiveCompletedDisciplines,
      inProgressDisciplines: allInProgressDisciplines,
    };
  }
}

/**
 * Avalia expressões de pré-requisitos lógicos do SIGAA com suporte a 'E', 'OU' e '()'.
 */
export function evaluatePrerequisiteExpression(
  exprRaw: string | undefined,
  fallbackCodes: string[],
  isSatisfiedFn: (code: string) => boolean,
  getDisciplineLabelFn: (code: string) => string = (c) => c,
): { isSatisfied: boolean; missing: string[] } {
  const cleanExpr = (exprRaw || '').trim();

  if (!cleanExpr || cleanExpr === '-') {
    if (!fallbackCodes || fallbackCodes.length === 0) {
      return { isSatisfied: true, missing: [] };
    }
    const missing: string[] = [];
    for (const code of fallbackCodes) {
      if (!isSatisfiedFn(code)) {
        missing.push(getDisciplineLabelFn(code));
      }
    }
    return { isSatisfied: missing.length === 0, missing };
  }

  // Tokenização da expressão
  const tokenRegex = /(\(|\)|(?:\bE\b)|(?:\bOU\b)|(?:[A-Z]{3}\d{4}))/gi;
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(cleanExpr)) !== null) {
    tokens.push(m[1].toUpperCase());
  }

  if (tokens.length === 0) {
    if (fallbackCodes.length === 0) return { isSatisfied: true, missing: [] };
    const missing = fallbackCodes.filter((c) => !isSatisfiedFn(c)).map(getDisciplineLabelFn);
    return { isSatisfied: missing.length === 0, missing };
  }

  let pos = 0;

  type ASTNode =
    | { type: 'CODE'; code: string }
    | { type: 'AND'; left: ASTNode; right: ASTNode }
    | { type: 'OR'; left: ASTNode; right: ASTNode };

  function parseOr(): ASTNode | null {
    let node = parseAnd();
    if (!node) return null;
    while (pos < tokens.length && tokens[pos] === 'OU') {
      pos++;
      const right = parseAnd();
      if (right) {
        node = { type: 'OR', left: node, right };
      }
    }
    return node;
  }

  function parseAnd(): ASTNode | null {
    let node = parseFactor();
    if (!node) return null;
    while (pos < tokens.length && (tokens[pos] === 'E' || (tokens[pos] !== 'OU' && tokens[pos] !== ')'))) {
      if (tokens[pos] === 'E') {
        pos++;
      }
      const right = parseFactor();
      if (right) {
        node = { type: 'AND', left: node, right };
      }
    }
    return node;
  }

  function parseFactor(): ASTNode | null {
    if (pos >= tokens.length) return null;
    const token = tokens[pos];
    if (token === '(') {
      pos++;
      const node = parseOr();
      if (pos < tokens.length && tokens[pos] === ')') {
        pos++;
      }
      return node;
    } else if (token !== ')' && token !== 'OU' && token !== 'E') {
      pos++;
      return { type: 'CODE', code: token };
    }
    return null;
  }

  const ast = parseOr();
  if (!ast) {
    return { isSatisfied: true, missing: [] };
  }

  function evalNode(node: ASTNode): { satisfied: boolean; missingList: string[] } {
    if (node.type === 'CODE') {
      const ok = isSatisfiedFn(node.code);
      return {
        satisfied: ok,
        missingList: ok ? [] : [getDisciplineLabelFn(node.code)],
      };
    }

    if (node.type === 'AND') {
      const leftRes = evalNode(node.left);
      const rightRes = evalNode(node.right);
      return {
        satisfied: leftRes.satisfied && rightRes.satisfied,
        missingList: [...leftRes.missingList, ...rightRes.missingList],
      };
    }

    if (node.type === 'OR') {
      const leftRes = evalNode(node.left);
      const rightRes = evalNode(node.right);
      if (leftRes.satisfied || rightRes.satisfied) {
        return { satisfied: true, missingList: [] };
      }

      if (node.left.type === 'CODE' && node.right.type === 'CODE') {
        return {
          satisfied: false,
          missingList: [`${leftRes.missingList[0]} ou ${rightRes.missingList[0]}`],
        };
      }

      if (leftRes.missingList.length <= rightRes.missingList.length) {
        return { satisfied: false, missingList: leftRes.missingList };
      } else {
        return { satisfied: false, missingList: rightRes.missingList };
      }
    }

    return { satisfied: true, missingList: [] };
  }

  const result = evalNode(ast);
  return {
    isSatisfied: result.satisfied,
    missing: result.satisfied ? [] : result.missingList,
  };
}
