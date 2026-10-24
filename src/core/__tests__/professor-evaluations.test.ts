import { describe, it, expect } from 'vitest';
import { createContainer } from '../container';
import { InMemoryProfessorEvaluationRepository } from '../infrastructure/in-memory-professor-evaluation.repo';
import {
  parseProfessorEvaluationsCsv,
  parseDidaticaScore,
  crossReferenceEvaluationsWithSigaa,
  hasConsistentDifficultyConsensus,
} from '../domain/entities/professor-evaluation';
import { GradeScraper } from '../../scrapers/grade-scraper';

const SAMPLE_CSV = `Carimbo de data/hora,Campus que cursou a disciplina?,Disciplina (ou código),Modalidade,"Semestre que cursou? 2024/2, etc",Qual departamento ou curso da disciplina?,Professor (a),Didática do professor em uma escala de 0 a 10?,Nível de dificuldade da disciplina?,Carga de atividades e leitura?,Material disponibilizado?,Recomendaria para outro aluno?,Feedback sincero ✨,"Método de avaliação? (Prova, trabalho, apresentação, participação, projeto etc.)",Monitor?,Cobra presença?,Como foi? (opcional),Professor se importa com os alunos?,Realmente aprendeu o conteúdo da disciplina?
27/02/2025 21:37:15,Campus Darcy,CIC0002,🏫 Presencial,2024/2,CIC,Daniel de Paula Porto,10,"🟡 Fácil – Tem desafios, mas nada absurdo.",🟡Moderada – Dá para administrar bem o tempo.,✅ Suficiente e bem organizado – Dá para estudar só com ele.,✅ Sim,Se importa muito com os alunos e com o ensino. Indico a todos.,Provas,✅ Sim,🟢 Tranquilo com chamada,✅ Passei,⭐ Muito,"⭐ Sim, quase tudo"
22/07/2025 13:22:13,Darcy,CIC0004,🏫 Presencial,2025/1,CIC,Prof. Daniel Porto,"8,5",🟠 Médio,🟡 Moderada,✅ Suficiente – Dá para estudar só com ele.,✅ Sim,Ótima didática e listas coerentes.,Prova e Projeto,✅ Sim,🟢 Tranquilo com chamada,✅ Passei,⭐ Muito,🙂 Aprendi grande parte
15/08/2026 12:51:59,Gama,FGA0138,🏫 Presencial,2026/1,FGA,Fulano de Tal,3,🔥 Muito difícil,🔴 Exagerada,❌ Inexistente – Não disponibiliza material,❌ Não,"Provas muito difíceis, exige muita leitura.",Provas,❌ Não,🔴 Sim - Rigoroso com chamada,❌ Reprovei,😶 Nada,❌ Não aprendi o conteúdo`;

describe('GetProfessorEvaluationsUseCase, Scraper de Docentes & Cruzamento SIGAA', () => {
  it('deve converter notas de didática variadas para a escala 0..10', () => {
    expect(parseDidaticaScore('10')).toBe(10);
    expect(parseDidaticaScore('8,5')).toBe(8.5);
    expect(parseDidaticaScore('9.5')).toBe(9.5);
    expect(parseDidaticaScore('1000')).toBe(10);
    expect(parseDidaticaScore('-5')).toBe(0);
    expect(parseDidaticaScore('8/10')).toBe(8);
    expect(parseDidaticaScore('EXCELENTE')).toBe(10);
  });

  it('deve extrair docentes da tabela HTML de busca_docentes.jsf e unificar com turmas no GradeScraper', () => {
    const scraper = new GradeScraper();
    const mockHtml = `
      <table class="listagem">
        <tbody>
          <tr class="linhaPar topo">
            <td class="foto"><img src="https://arquivos.unb.br/foto-andre.png" height="100"/></td>
            <td>
              <span class="nome">ANDRE COSTA DRUMMOND</span>
              <span class="departamento">DEPTO CI&#202;NCIAS DA COMPUTA&#199;&#195;O</span>
              <span class="pagina"><a href="/sigaa/public/docente/portal.jsf?siape=1866200">ver p&#225;gina p&#250;blica</a></span>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const directoryProfs = scraper.parseDocentesTable(
      mockHtml,
      '508',
      'DEPTO CIÊNCIAS DA COMPUTAÇÃO'
    );
    expect(directoryProfs).toHaveLength(1);
    expect(directoryProfs[0].name).toBe('ANDRE COSTA DRUMMOND');
    expect(directoryProfs[0].siape).toBe('1866200');
    expect(directoryProfs[0].public_url).toContain('siape=1866200');

    const catalog = GradeScraper.buildProfessorsCatalog(
      directoryProfs,
      [
        {
          code: 'CIC0004',
          name: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
          department_id: '508',
          classes: [
            {
              id: 'CIC0004-01',
              discipline_code: 'CIC0004',
              discipline_name: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
              class_code: '01',
              teachers: ['ANDRE COSTA DRUMMOND', 'DANIEL DE PAULA PORTO'],
              classroom: 'PAT',
              schedule_code: '24M34',
              schedule_slots: [],
            },
          ],
        },
      ],
      [{ id: '508', name: 'DEPTO CIÊNCIAS DA COMPUTAÇÃO - CIC' }]
    );

    expect(catalog).toHaveLength(2);
    const andre = catalog.find((p) => p.name === 'ANDRE COSTA DRUMMOND');
    expect(andre?.siape).toBe('1866200');
    expect(andre?.discipline_codes).toContain('CIC0004');
  });

  it('deve cruzar professores e matérias da planilha com o catálogo SIGAA evitando duplicatas', () => {
    const csv = `Carimbo de data/hora,Campus que cursou a disciplina?,Disciplina (ou código),Modalidade,"Semestre que cursou? 2024/2, etc",Qual departamento ou curso da disciplina?,Professor (a),Didática do professor em uma escala de 0 a 10?,Nível de dificuldade da disciplina?,Carga de atividades e leitura?,Material disponibilizado?,Recomendaria para outro aluno?,Feedback sincero ✨,"Método de avaliação? (Prova, trabalho, apresentação, participação, projeto etc.)",Monitor?,Cobra presença?,Como foi? (opcional),Professor se importa com os alunos?,Realmente aprendeu o conteúdo da disciplina?
01/03/2025 10:00:00,Darcy,Algoritmo e Programação de Computadores,🏫 Presencial,2024/2,CIC,Carla,10,🟡 Fácil,🟡 Moderada,✅ Suficiente,✅ Sim,Ótima aula,Provas,✅ Sim,🟢 Tranquilo,✅ Passei,⭐ Muito,⭐ Sim
02/03/2025 10:00:00,Darcy,CIC0004,🏫 Presencial,2024/2,CIC,Carla Rocha,9,🟡 Fácil,🟡 Moderada,✅ Suficiente,✅ Sim,Muito boa,Provas,✅ Sim,🟢 Tranquilo,✅ Passei,⭐ Muito,⭐ Sim
03/03/2025 10:00:00,Darcy,APC,🏫 Presencial,2024/2,CIC,CARLA SILVA ROCHA,10,🟡 Fácil,🟡 Moderada,✅ Suficiente,✅ Sim,Excelente,Provas,✅ Sim,🟢 Tranquilo,✅ Passei,⭐ Muito,⭐ Sim`;

    const rawEvals = parseProfessorEvaluationsCsv(csv);
    const enriched = crossReferenceEvaluationsWithSigaa(
      rawEvals,
      [
        {
          code: 'CIC0004',
          name: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
          departmentId: '508',
          acronym: 'APC',
          acronyms: ['APC'],
          classes: [
            {
              id: 'CIC0004-01',
              disciplineCode: 'CIC0004',
              disciplineName: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
              classCode: '01',
              teachers: ['CARLA SILVA ROCHA'],
              classroom: 'PJC',
              scheduleCode: '24M34',
              scheduleSlots: [],
            },
          ],
        },
      ],
      [
        {
          id: '123456',
          siape: '123456',
          name: 'CARLA SILVA ROCHA',
          departmentId: '508',
          departmentName: 'DEPTO CIÊNCIAS DA COMPUTAÇÃO',
          departmentIds: ['508'],
          disciplineCodes: ['CIC0004'],
          publicUrl:
            'https://sigaa.unb.br/sigaa/public/docente/portal.jsf?siape=123456',
        },
      ],
      [{ id: '508', name: 'DEPTO CIÊNCIAS DA COMPUTAÇÃO - CIC' }]
    );

    expect(enriched).toHaveLength(3);
    // Todos os 3 relatos ("Carla", "Carla Rocha", "CARLA SILVA ROCHA") e as 3 variações da matéria ("Algoritmo...", "CIC0004", "APC") foram unificados!
    for (const ev of enriched) {
      expect(ev.professor).toBe('CARLA SILVA ROCHA');
      expect(ev.disciplineCode).toBe('CIC0004');
      expect(ev.discipline).toBe(
        'CIC0004 - ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES'
      );
      expect(ev.isSigaaVerified).toBe(true);
      expect(ev.siape).toBe('123456');
    }
  });

  it('deve fazer parse do CSV da planilha, remover emojis e consolidar nomes parciais via GetProfessorEvaluationsUseCase', async () => {
    const parsed = parseProfessorEvaluationsCsv(SAMPLE_CSV);
    expect(parsed.length).toBe(3);

    // Verifica que os emojis vindos do Excel foram removidos em todos os campos
    expect(parsed[0].modality).toBe('Presencial');
    expect(parsed[0].difficulty).toBe('Fácil');
    expect(parsed[0].workload).toBe('Moderada');
    expect(parsed[0].material).toBe('Material suficiente');
    expect(parsed[0].recommendationRaw).toBe('Sim');
    expect(parsed[0].hasMonitor).toBe('Sim');
    expect(parsed[0].attendance).toBe('Tranquilo com chamada');
    expect(parsed[0].outcome).toBe('Passei');
    expect(parsed[0].caresAboutStudents).toBe('Muito');
    expect(parsed[0].learnedContent).toBe('Sim, quase tudo');
    expect(parsed[1].learnedContent).toBe('Aprendi grande parte');
    expect(parsed[2].difficulty).toBe('Muito difícil');
    expect(parsed[2].workload).toBe('Exagerada');
    expect(parsed[2].material).toBe('Sem material');
    expect(parsed[2].outcome).toBe('Reprovei');
    expect(parsed[2].caresAboutStudents).toBe('Nada');
    expect(parsed[2].learnedContent).toBe('Não aprendi o conteúdo');

    const repo = new InMemoryProfessorEvaluationRepository(parsed);
    const container = createContainer({
      repos: { professorEvaluationRepo: repo },
    });

    const all = await container.useCases.getProfessorEvaluations.execute();
    expect(all.length).toBe(3);
    expect(all[0].discipline).toBe('FGA0138');

    // Filtro por campus
    const gamaOnly = await container.useCases.getProfessorEvaluations.execute({
      campus: 'Gama',
    });
    expect(gamaOnly.length).toBe(1);
    expect(gamaOnly[0].professor).toBe('Fulano de Tal');

    // Agrupamento por professor ("Daniel de Paula Porto" e "Prof. Daniel Porto" unificados)
    const summaries =
      await container.useCases.getProfessorEvaluations.getSummaries();
    expect(summaries.length).toBe(2);
    const danielSummary = summaries.find((s) =>
      s.professorKey.includes('DANIEL DE PAULA PORTO')
    );
    expect(danielSummary).toBeDefined();
    expect(danielSummary?.evaluationsCount).toBe(2);
    expect(danielSummary?.averageDidatica).toBe(9.3);
    expect(danielSummary?.recommendationRate).toBe(100);
    // CIC0004 foi enriquecido pelo catálogo do GradeRepo para "CIC0004 - ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES"
    expect(
      danielSummary?.disciplines.some((d) => d.includes('CIC0004'))
    ).toBe(true);
  });
});

describe('Consenso de dificuldade entre avaliações', () => {
  const CSV_HEADER =
    'Carimbo de data/hora,Campus que cursou a disciplina?,Disciplina (ou código),Modalidade,"Semestre que cursou? 2024/2, etc",Qual departamento ou curso da disciplina?,Professor (a),Didática do professor em uma escala de 0 a 10?,Nível de dificuldade da disciplina?,Carga de atividades e leitura?,Material disponibilizado?,Recomendaria para outro aluno?,Feedback sincero ✨,"Método de avaliação? (Prova, trabalho, apresentação, participação, projeto etc.)",Monitor?,Cobra presença?,Como foi? (opcional),Professor se importa com os alunos?,Realmente aprendeu o conteúdo da disciplina?';

  const buildRow = (overrides: {
    difficulty?: string;
    workload?: string;
    material?: string;
    attendance?: string;
  }) =>
    [
      '01/03/2025 10:00:00',
      'Darcy',
      'CIC0004',
      '🏫 Presencial',
      '2024/2',
      'CIC',
      'Carla Rocha',
      '9',
      overrides.difficulty ?? '🟡 Fácil',
      overrides.workload ?? '🟡 Moderada',
      overrides.material ?? '✅ Suficiente',
      '✅ Sim',
      'Muito boa',
      'Provas',
      '✅ Sim',
      overrides.attendance ?? '🟢 Tranquilo com chamada',
      '✅ Passei',
      '⭐ Muito',
      '⭐ Sim',
    ].join(',');

  const buildEvaluations = (rows: string[]) =>
    parseProfessorEvaluationsCsv([CSV_HEADER, ...rows].join('\n'));

  it('deve detectar consenso com relatos suficientes e níveis parecidos', () => {
    const evals = buildEvaluations([
      buildRow({}),
      buildRow({}),
      buildRow({
        material: '✅ Suficiente e bem organizado – Dá para estudar só com ele.',
      }),
    ]);

    expect(evals.length).toBe(3);
    expect(hasConsistentDifficultyConsensus(evals)).toBe(true);
  });

  it('não deve detectar consenso com poucos relatos', () => {
    const evals = buildEvaluations([buildRow({}), buildRow({})]);
    expect(hasConsistentDifficultyConsensus(evals)).toBe(false);
  });

  it('não deve detectar consenso quando as dificuldades divergem', () => {
    const evals = buildEvaluations([
      buildRow({ difficulty: '🟡 Fácil' }),
      buildRow({ difficulty: '🔥 Muito difícil' }),
      buildRow({ difficulty: '🟠 Médio' }),
    ]);

    expect(hasConsistentDifficultyConsensus(evals)).toBe(false);
  });

  it('não deve detectar consenso quando poucos relatos informam a dificuldade', () => {
    // Dificuldade em branco em quase todos os relatos
    const csv = [
      CSV_HEADER,
      '01/03/2025 10:00:00,Darcy,CIC0004,🏫 Presencial,2024/2,CIC,Carla Rocha,9,,,,✅ Sim,Muito boa,Provas,✅ Sim,,✅ Passei,⭐ Muito,⭐ Sim',
      '02/03/2025 10:00:00,Darcy,CIC0004,🏫 Presencial,2024/2,CIC,Carla Rocha,9,,,,✅ Sim,Muito boa,Provas,✅ Sim,,✅ Passei,⭐ Muito,⭐ Sim',
      '03/03/2025 10:00:00,Darcy,CIC0004,🏫 Presencial,2024/2,CIC,Carla Rocha,9,🟡 Fácil,🟡 Moderada,✅ Suficiente,✅ Sim,Muito boa,Provas,✅ Sim,🟢 Tranquilo,✅ Passei,⭐ Muito,⭐ Sim',
    ].join('\n');

    expect(hasConsistentDifficultyConsensus(parseProfessorEvaluationsCsv(csv))).toBe(
      false
    );
  });
});
