import { describe, it, expect, beforeEach } from 'vitest';
import {
  ParseHistoricoUseCase,
  GetFlowchartUseCase,
  ManageAcademicProfileUseCase,
  resolveCurriculumByAdmissionYear,
  type StudentAcademicProfile,
  type CurriculumStructure,
} from '@/core';
import { InMemoryAcademicProfileRepository } from '../infrastructure/in-memory-academic-profile.repo';

const MOCK_HISTORICO_TEXT = `
Histórico Escolar - Emitido em: 08/10/2026 às 00:19
DEG - Decanato de Ensino de Graduação
SAA - Secretaria de Administração Acadêmica
Dados Pessoais
Dados do Vínculo do(a) Discente
ENGENHARIA DE COMPUTAÇÃO/CIC - BACHARELADO - DIURNO
Curso:
Currículo: 1741/1 - 2016.1
Ano / Período Letivo Inicial: 2022.1
Status: ATIVO
Matrícula: 202000000
Nome: Discente Demonstração

Componentes Curriculares Cursados/Cursando
2022.1 ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES
08 APRCIC0004 90 90,0 MS
2022.1 INTRODUÇÃO À ENGENHARIA DE COMPUTAÇÃO
01 APRCIC0188 30 100,0 SS
2022.1 FISICA 1 EXPERIMENTAL
21 REPIFD0173 30 100,0 MI&
2022.1 CÁLCULO 1
06 REPMAT0025 90 100,0 MI&
2022.2 CÁLCULO 1
02 APRMAT0137 90 95,0 MS
2023.1 FISICA 1 EXPERIMENTAL
05 APRIFD0173 30 90,0 MM
2023.1 ESTRUTURAS DE DADOS
01 APRCIC0090 60 92,0 MM
2026.2 PROJETO INTEGRADOR
01 MATRCIC0099 60 100,0 -
`;

const MOCK_CURRICULUM: CurriculumStructure = {
  id: '19821268',
  courseId: '414610',
  courseName: 'ENGENHARIA DE COMPUTAÇÃO',
  code: '1741/3',
  status: 'Ativa',
  totalHours: 3600,
  mandatoryDisciplines: [
    {
      code: 'CIC0004',
      name: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
      workloadHours: 90,
      level: 1,
      nature: 'Obrigatória',
      prerequisites: [],
      equivalences: ['CIC0088'],
    },
    {
      code: 'MAT0025',
      name: 'CÁLCULO 1',
      workloadHours: 90,
      level: 1,
      nature: 'Obrigatória',
      prerequisites: [],
      equivalences: ['MAT0137'],
    },
    {
      code: 'IFD0173',
      name: 'FISICA 1 EXPERIMENTAL',
      workloadHours: 30,
      level: 1,
      nature: 'Obrigatória',
      prerequisites: [],
      equivalences: [],
    },
    {
      code: 'CIC0090',
      name: 'ESTRUTURAS DE DADOS',
      workloadHours: 60,
      level: 2,
      nature: 'Obrigatória',
      prerequisites: ['CIC0004'],
      equivalences: [],
    },
    {
      code: 'MAT0026',
      name: 'CÁLCULO 2',
      workloadHours: 90,
      level: 2,
      nature: 'Obrigatória',
      prerequisites: ['MAT0025'],
      equivalences: [],
    },
    {
      code: 'CIC0099',
      name: 'ORGANIZAÇÃO E ARQUITETURA DE COMPUTADORES',
      workloadHours: 60,
      level: 3,
      nature: 'Obrigatória',
      prerequisites: ['CIC0090'],
      equivalences: [],
    },
    {
      code: 'CIC0104',
      name: 'SISTEMAS OPERACIONAIS',
      workloadHours: 60,
      level: 4,
      nature: 'Obrigatória',
      prerequisites: ['CIC0099'],
      equivalences: [],
    },
  ],
  electiveDisciplines: [],
  complementaryDisciplines: [],
};

describe('Meu Curso - Casos de Uso e Domínio', () => {
  describe('ParseHistoricoUseCase', () => {
    const parseUseCase = new ParseHistoricoUseCase();

    it('deve extrair metadados e disciplinas do texto do histórico oficial da UnB', async () => {
      const result = await parseUseCase.execute({
        rawText: MOCK_HISTORICO_TEXT,
        curriculaCatalog: [MOCK_CURRICULUM],
      });

      expect(result.profile.matricula).toBe('202000000');
      expect(result.profile.studentName).toContain('Demonstração');
      expect(result.profile.courseName).toBe('ENGENHARIA DE COMPUTAÇÃO');
      expect(result.profile.admissionYear).toBe('2022.1');
      expect(result.profile.curriculumCode).toBe('1741/1');

      // Verifica correspondência de matriz curricular pelo prefixo 1741
      expect(result.matchedCurriculum).toBeDefined();
      expect(result.matchedCurriculum?.id).toBe(MOCK_CURRICULUM.id);

      // Verifica lista de disciplinas cursadas
      const completedCodes = result.profile.completedDisciplines.filter((d) => d.isCompleted).map((d) => d.code);
      expect(completedCodes).toContain('CIC0004'); // Aprovado
      expect(completedCodes).toContain('MAT0137'); // Aprovado
      expect(completedCodes).toContain('IFD0173'); // Reprovado primeiro, depois aprovado
      expect(completedCodes).toContain('CIC0090'); // Aprovado

      // CIC0099 deve constar como matriculada (MATR), não concluída, com turma 01
      const matriculada = result.profile.completedDisciplines.find((d) => d.code === 'CIC0099');
      expect(matriculada).toBeDefined();
      expect(matriculada?.situation).toBe('MATR');
      expect(matriculada?.isCompleted).toBe(false);
      expect(matriculada?.classCode).toBe('01');
    });

    it('deve priorizar situação MATR sobre reprovação ou trancamento anterior (REP/TR)', async () => {
      const historicoComRepEMatr = `
Histórico Escolar
Matrícula: 202000000
Nome: Aluno Teste
Curso: ENGENHARIA DE COMPUTAÇÃO
Ano / Período Letivo Inicial: 2022.1
Currículo: 1741/1
2024.1 CÁLCULO 1
06 REPMAT0025 90 100,0 MI&
2026.2 CÁLCULO 1
01 MATR MAT0025 90 - -
`;
      const result = await parseUseCase.execute({
        rawText: historicoComRepEMatr,
        curriculaCatalog: [MOCK_CURRICULUM],
      });

      const mat0025 = result.profile.completedDisciplines.find((d) => d.code === 'MAT0025');
      expect(mat0025).toBeDefined();
      expect(mat0025?.situation).toBe('MATR');
      expect(mat0025?.isCompleted).toBe(false);
    });

    it('deve casar a matriz do turno do discente quando o curso existe em diurno e noturno', async () => {
      // Farmácia real: curso homônimo com matrizes distintas por turno
      // (7013 diurno, 7609 noturno). Sem pista de turno, o nome casa com as
      // duas e o app escolhia a errada — o turno do histórico desempata.
      const historicoFarmacia = `
Histórico Escolar
Matrícula: 202000000
Nome: Discente Demonstração
FARMÁCIA/CBC - BACHARELADO - NOTURNO
Curso:

Componentes Curriculares Cursados/Cursando
2023.1 FARMACOLOGIA APLICADA
01 APRFAR0101 60 90,0 MS
`;
      const matrizDiurna: CurriculumStructure = {
        id: '15687684',
        courseId: '414906',
        courseName: 'FARMÁCIA',
        code: '7013/2',
        createdYear: '2024',
        status: 'Ativa',
        shift: 'Matutino e Vespertino',
        totalHours: 3675,
        mandatoryDisciplines: [],
        electiveDisciplines: [],
        complementaryDisciplines: [],
      };
      const matrizNoturna: CurriculumStructure = {
        id: '2071865',
        courseId: '414287',
        courseName: 'FARMÁCIA',
        code: '7609/2',
        createdYear: '2018',
        status: 'Ativa',
        shift: 'Noturno',
        totalHours: 3210,
        mandatoryDisciplines: [],
        electiveDisciplines: [],
        complementaryDisciplines: [],
      };

      const noturno = await parseUseCase.execute({
        rawText: historicoFarmacia,
        curriculaCatalog: [matrizDiurna, matrizNoturna],
      });
      expect(noturno.profile.shift).toBe('NOTURNO');
      expect(noturno.matchedCurriculum?.id).toBe('2071865');

      // Token compacto do portal do discente (ex.: "MT") também desempata
      const diurno = await parseUseCase.execute({
        rawText: historicoFarmacia.replace('NOTURNO', 'DIURNO'),
        defaultProfile: { shift: 'MT' },
        curriculaCatalog: [matrizDiurna, matrizNoturna],
      });
      expect(diurno.profile.shift).toBe('DIURNO');
      expect(diurno.matchedCurriculum?.id).toBe('15687684');
    });

    it('deve capturar disciplinas MATR com variações de espaço e traços', async () => {
      const historicoComVariacoes = `
Histórico Escolar
Matrícula: 202000000
Curso: ENGENHARIA DE COMPUTAÇÃO
2026.2 PROJETO INTEGRADOR
01 MATRCIC0099 60 100,0 -
2026.2 TÓPICOS EM ENGENHARIA
02 MATR CIC0105 60 -- -
2026.2 ESTÁGIO SUPERVISIONADO
CIC0291 ESTÁGIO 120 MATRICULADO
`;
      const result = await parseUseCase.execute({
        rawText: historicoComVariacoes,
        curriculaCatalog: [MOCK_CURRICULUM],
      });

      const cic0099 = result.profile.completedDisciplines.find((d) => d.code === 'CIC0099');
      const cic0105 = result.profile.completedDisciplines.find((d) => d.code === 'CIC0105');
      const cic0291 = result.profile.completedDisciplines.find((d) => d.code === 'CIC0291');

      expect(cic0099?.situation).toBe('MATR');
      expect(cic0105?.situation).toBe('MATR');
      expect(cic0291?.situation).toBe('MATR');
    });

    it('deve extrair o nome da disciplina a partir da linha de período que antecede o código compactado', async () => {
      const historicoComNome = `
Histórico Escolar
Matrícula: 202000000
Curso: ENGENHARIA DE COMPUTAÇÃO
Currículo: 1741/1
2026.2 SINAIS E SISTEMAS EM TEMPO CONTÍNUO
01 MATRENE0067 60 100,0 -
`;
      const result = await parseUseCase.execute({
        rawText: historicoComNome,
        curriculaCatalog: [MOCK_CURRICULUM],
      });

      const ene0067 = result.profile.completedDisciplines.find((d) => d.code === 'ENE0067');
      expect(ene0067).toBeDefined();
      expect(ene0067?.situation).toBe('MATR');
      expect(ene0067?.name).toBe('SINAIS E SISTEMAS EM TEMPO CONTÍNUO');
    });

    it('deve resolver o nome da disciplina a partir de outras matrizes do catálogo se a linha não trouxer o nome', async () => {
      const outraMatrizComEne: CurriculumStructure = {
        id: '19804668',
        courseId: '6335',
        courseName: 'ENGENHARIA ELÉTRICA',
        code: '6335/3',
        status: 'Ativa',
        mandatoryDisciplines: [
          {
            code: 'ENE0067',
            name: 'SINAIS E SISTEMAS EM TEMPO CONTÍNUO',
            workloadHours: 60,
            nature: 'Obrigatória',
            prerequisites: [],
            equivalences: [],
          },
        ],
        electiveDisciplines: [],
        complementaryDisciplines: [],
      };

      const historicoCompactoSemNome = `
Histórico Escolar
Matrícula: 202000000
Curso: ENGENHARIA DE COMPUTAÇÃO
Currículo: 1741/1
01 MATRENE0067 60 100,0 -
`;
      const result = await parseUseCase.execute({
        rawText: historicoCompactoSemNome,
        curriculaCatalog: [MOCK_CURRICULUM, outraMatrizComEne],
      });

      const ene0067 = result.profile.completedDisciplines.find((d) => d.code === 'ENE0067');
      expect(ene0067).toBeDefined();
      expect(ene0067?.situation).toBe('MATR');
      expect(ene0067?.name).toBe('SINAIS E SISTEMAS EM TEMPO CONTÍNUO');
    });
  });

  describe('GetFlowchartUseCase', () => {
    const flowchartUseCase = new GetFlowchartUseCase();

    it('deve calcular corretamente status, equivalências, pré-requisitos e métricas', () => {
      const profile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          { code: 'CIC0004', name: 'APC', workloadHours: 90, grade: 'MS', situation: 'APR', isCompleted: true },
          { code: 'MAT0137', name: 'Cálculo 1 Equiv', workloadHours: 90, grade: 'MS', situation: 'APR', isCompleted: true },
          { code: 'IFD0173', name: 'Fis Exp 1', workloadHours: 30, grade: 'MM', situation: 'APR', isCompleted: true },
          { code: 'CIC0090', name: 'ED', workloadHours: 60, grade: 'MM', situation: 'APR', isCompleted: true },
          { code: 'CIC0099', name: 'OAC', workloadHours: 60, situation: 'MATR', isCompleted: false },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      const flowchart = flowchartUseCase.execute(MOCK_CURRICULUM, profile);

      // Semestres organizados
      expect(flowchart.semesters.length).toBeGreaterThanOrEqual(4);
      expect(flowchart.semesters[0].level).toBe(1);

      // CIC0004 e IFD0173 concluídas
      const s1 = flowchart.semesters[0].disciplines;
      const cic0004 = s1.find((d) => d.code === 'CIC0004');
      expect(cic0004?.status).toBe('completed');

      // MAT0025 foi cumprido via equivalência MAT0137
      const mat0025 = s1.find((d) => d.code === 'MAT0025');
      expect(mat0025?.status).toBe('completed');

      // Semestre 2: MAT0026 desbloqueado (Cálculo 1 feito) -> status 'available'
      const s2 = flowchart.semesters[1].disciplines;
      const mat0026 = s2.find((d) => d.code === 'MAT0026');
      expect(mat0026?.status).toBe('available');

      // CIC0099 está em andamento (in_progress)
      const s3 = flowchart.semesters[2].disciplines;
      const cic0099 = s3.find((d) => d.code === 'CIC0099');
      expect(cic0099?.status).toBe('in_progress');

      // Semestre 4: CIC0104 depende de CIC0099 que ainda não foi concluída -> status 'locked'
      const s4 = flowchart.semesters[3].disciplines;
      const cic0104 = s4.find((d) => d.code === 'CIC0104');
      expect(cic0104?.status).toBe('locked');
      expect(cic0104?.missingPrerequisites.length).toBeGreaterThan(0);

      // Métricas
      expect(flowchart.metrics.completedMandatoryDisciplines).toBe(4); // CIC0004, MAT0025, IFD0173, CIC0090
      expect(flowchart.metrics.inProgressCount).toBe(1); // CIC0099
      expect(flowchart.metrics.availableCount).toBe(1); // MAT0026
    });

    it('deve liberar disciplina quando pelo menos um pré-requisito com OU for satisfeito', () => {
      const curriculumComOu: CurriculumStructure = {
        ...MOCK_CURRICULUM,
        mandatoryDisciplines: [
          {
            code: 'ADM0192',
            name: 'MÉTODOS QUANTITATIVOS',
            workloadHours: 60,
            level: 2,
            nature: 'Obrigatória',
            prerequisitesRaw: '( ( MAT0025 ) OU ( MAT0022 ) )',
            prerequisites: ['MAT0025', 'MAT0022'],
            equivalences: [],
          },
        ],
      };

      // Discente cursou apenas MAT0022 (MAT0025 não cursado)
      const profile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ADM',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          { code: 'MAT0022', name: 'Cálculo 1 Alternativo', workloadHours: 90, grade: 'MM', situation: 'APR', isCompleted: true },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      const flowchart = flowchartUseCase.execute(curriculumComOu, profile);
      const adm = flowchart.semesters[0].disciplines.find((d) => d.code === 'ADM0192');

      // Com OU, ter feito MAT0022 é suficiente para liberar ADM0192!
      expect(adm?.status).toBe('available');
      expect(adm?.missingPrerequisites).toEqual([]);
    });

    it('deve bloquear disciplina e listar opções quando nenhum pré-requisito com OU for satisfeito', () => {
      const curriculumComOu: CurriculumStructure = {
        ...MOCK_CURRICULUM,
        mandatoryDisciplines: [
          {
            code: 'ADM0192',
            name: 'MÉTODOS QUANTITATIVOS',
            workloadHours: 60,
            level: 2,
            nature: 'Obrigatória',
            prerequisitesRaw: '( ( MAT0025 ) OU ( MAT0022 ) )',
            prerequisites: ['MAT0025', 'MAT0022'],
            equivalences: [],
          },
        ],
      };

      const profileVazio: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ADM',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      const flowchart = flowchartUseCase.execute(curriculumComOu, profileVazio);
      const adm = flowchart.semesters[0].disciplines.find((d) => d.code === 'ADM0192');

      expect(adm?.status).toBe('locked');
      expect(adm?.missingPrerequisites.length).toBeGreaterThan(0);
      expect(adm?.missingPrerequisites[0]).toContain('ou');
    });

    it('deve avaliar corretamente expressões complexas com E e OU aninhados', () => {
      const curriculumComplexo: CurriculumStructure = {
        ...MOCK_CURRICULUM,
        mandatoryDisciplines: [
          {
            code: 'ADM0187',
            name: 'MACROECONOMIA 2',
            workloadHours: 60,
            level: 3,
            nature: 'Obrigatória',
            prerequisitesRaw: '( ( ECO0019 E MAT0025 ) OU ( ECO0019 E MAT0022 ) )',
            prerequisites: ['ECO0019', 'MAT0025', 'MAT0022'],
            equivalences: [],
          },
        ],
      };

      // Aluno fez ECO0019 e MAT0022 (caminho alternativo do OU)
      const profile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ADM',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          { code: 'ECO0019', name: 'INTRODUÇÃO À ECONOMIA', workloadHours: 60, grade: 'SS', situation: 'APR', isCompleted: true },
          { code: 'MAT0022', name: 'CÁLCULO 1 ALT', workloadHours: 90, grade: 'MS', situation: 'APR', isCompleted: true },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      const flowchart = flowchartUseCase.execute(curriculumComplexo, profile);
      const disc = flowchart.semesters[0].disciplines.find((d) => d.code === 'ADM0187');
      expect(disc?.status).toBe('available');
    });

    it('deve incluir matérias optativas matriculadas (MATR) em inProgressDisciplines', () => {
      const profileComOptativaMatr: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          // Obrigatória matriculada
          { code: 'CIC0099', name: 'OAC', workloadHours: 60, situation: 'MATR', isCompleted: false },
          // Optativa matriculada (fora da grade obrigatória)
          { code: 'CIC0205', name: 'APRENDIZADO DE MÁQUINA', workloadHours: 60, situation: 'MATR', isCompleted: false },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      const flowchart = flowchartUseCase.execute(MOCK_CURRICULUM, profileComOptativaMatr);

      // Deve incluir tanto a obrigatória CIC0099 quanto a optativa CIC0205
      expect(flowchart.inProgressDisciplines).toBeDefined();
      expect(flowchart.inProgressDisciplines?.length).toBe(2);
      expect(flowchart.inProgressDisciplines?.some((d) => d.code === 'CIC0099')).toBe(true);
      expect(flowchart.inProgressDisciplines?.some((d) => d.code === 'CIC0205')).toBe(true);
      expect(flowchart.metrics.inProgressCount).toBe(2);
    });

    it('deve enriquecer o nome de disciplinas em andamento fora da matriz usando allCurricula', () => {
      const outraMatrizComEne: CurriculumStructure = {
        id: '19804668',
        courseId: '6335',
        courseName: 'ENGENHARIA ELÉTRICA',
        code: '6335/3',
        status: 'Ativa',
        mandatoryDisciplines: [
          {
            code: 'ENE0067',
            name: 'SINAIS E SISTEMAS EM TEMPO CONTÍNUO',
            workloadHours: 60,
            nature: 'Obrigatória',
            prerequisites: [],
            equivalences: [],
          },
        ],
        electiveDisciplines: [],
        complementaryDisciplines: [],
      };

      const profileComEneSemNome: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          { code: 'ENE0067', name: 'ENE0067', workloadHours: 60, situation: 'MATR', isCompleted: false },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      const flowchart = flowchartUseCase.execute(MOCK_CURRICULUM, profileComEneSemNome, [MOCK_CURRICULUM, outraMatrizComEne]);
      const ene = flowchart.inProgressDisciplines?.find((d) => d.code === 'ENE0067');
      expect(ene).toBeDefined();
      expect(ene?.name).toBe('SINAIS E SISTEMAS EM TEMPO CONTÍNUO');
    });

    it('deve deixar a marca manual vencer a equivalência canônica e bloquear dependentes', () => {
      // MAT0137 aprovada conclui MAT0025 via equivalência canônica (MAT0025 <-> MAT0137)
      const baseProfile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          { code: 'MAT0137', name: 'CÁLCULO 1', workloadHours: 90, grade: 'MS', situation: 'APR', isCompleted: true },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      const disc = (flowchart: ReturnType<typeof flowchartUseCase.execute>, code: string) =>
        flowchart.semesters.flatMap((s) => s.disciplines).find((d) => d.code === code);

      const natural = flowchartUseCase.execute(MOCK_CURRICULUM, baseProfile);
      expect(disc(natural, 'MAT0025')?.status).toBe('completed');

      // Aluno desmarca MAT0025 explicitamente: a equivalência não pode reconcluí-la
      const desmarcada = flowchartUseCase.execute(MOCK_CURRICULUM, {
        ...baseProfile,
        manualUncompletedCodes: ['MAT0025'],
      });
      // Sem pré-requisitos, volta a ficar disponível — não concluída
      expect(disc(desmarcada, 'MAT0025')?.status).toBe('available');

      // MAT0026 depende de MAT0025: perde o "disponível" junto
      expect(disc(desmarcada, 'MAT0026')?.status).toBe('locked');
    });
  });

  describe('ManageAcademicProfileUseCase', () => {
    let repo: InMemoryAcademicProfileRepository;
    let manageUseCase: ManageAcademicProfileUseCase;

    beforeEach(async () => {
      repo = new InMemoryAcademicProfileRepository();
      await repo.clearProfile();
      manageUseCase = new ManageAcademicProfileUseCase(repo);
    });

    it('deve permitir marcar e desmarcar matérias manualmente', async () => {
      const initialProfile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          { code: 'CIC0004', name: 'APC', workloadHours: 90, grade: 'MS', situation: 'APR', isCompleted: true },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      await repo.saveProfile(initialProfile);

      // Marca manualmente uma matéria que não estava concluída
      const updated1 = await manageUseCase.toggleDiscipline('MAT0026');
      expect(updated1.manualCompletedCodes).toContain('MAT0026');

      // Desmarca a matéria marcada manualmente
      const updated2 = await manageUseCase.toggleDiscipline('MAT0026');
      expect(updated2.manualCompletedCodes).not.toContain('MAT0026');

      // Desmarca uma matéria que era originalmente concluída do histórico
      const updated3 = await manageUseCase.toggleDiscipline('CIC0004');
      expect(updated3.manualUncompletedCodes).toContain('CIC0004');

      // Redefine todos os overrides manuais
      const reset = await manageUseCase.resetManualOverrides();
      expect(reset.manualCompletedCodes).toEqual([]);
      expect(reset.manualUncompletedCodes).toEqual([]);
    });

    it('deve apagar completamente o perfil acadêmico ao chamar clearProfile', async () => {
      const initialProfile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          { code: 'CIC0004', name: 'APC', workloadHours: 90, grade: 'MS', situation: 'APR', isCompleted: true },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      await repo.saveProfile(initialProfile);
      const saved = await manageUseCase.getProfile();
      expect(saved).not.toBeNull();
      expect(saved?.matricula).toBe('202000000');

      await manageUseCase.clearProfile();
      const cleared = await manageUseCase.getProfile();
      expect(cleared).toBeNull();
    });

    it('deve alternar pelo estado efetivo com marca mínima, voltando ao natural do SIGAA', async () => {
      const initialProfile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          { code: 'CIC0004', name: 'APC', workloadHours: 90, grade: 'MS', situation: 'APR', isCompleted: true },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };
      await repo.saveProfile(initialProfile);

      // UI mostra CIC0004 concluída → desmarcar exige marca de desmarcada
      const u1 = await manageUseCase.toggleDiscipline('CIC0004', true);
      expect(u1.manualUncompletedCodes).toContain('CIC0004');
      expect(u1.manualCompletedCodes).toEqual([]);

      // UI agora mostra não concluída → remarcar volta ao natural: nenhuma marca
      const u2 = await manageUseCase.toggleDiscipline('CIC0004', false);
      expect(u2.manualUncompletedCodes).toEqual([]);
      expect(u2.manualCompletedCodes).toEqual([]);

      // Disciplina fora do histórico: marca mínima de conclusão, depois some de volta
      const u3 = await manageUseCase.toggleDiscipline('MAT0026', false);
      expect(u3.manualCompletedCodes).toContain('MAT0026');
      const u4 = await manageUseCase.toggleDiscipline('MAT0026', true);
      expect(u4.manualCompletedCodes).toEqual([]);
      expect(u4.manualUncompletedCodes).toEqual([]);
    });

    it('deve restaurar exatamente o estado do SIGAA ao resetar (cursando volta a cursar)', async () => {
      const statusDe = (profile: StudentAcademicProfile) =>
        new GetFlowchartUseCase()
          .execute(MOCK_CURRICULUM, profile)
          .semesters.flatMap((s) => s.disciplines)
          .find((d) => d.code === 'CIC0099')?.status;

      const cursando: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          { code: 'CIC0099', name: 'OAC', workloadHours: 60, situation: 'MATR', isCompleted: false },
        ],
        manualCompletedCodes: ['CIC0099'],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };
      await repo.saveProfile(cursando);

      // Marca manual conclui a disciplina cursando...
      const marcada = await manageUseCase.getProfile();
      expect(statusDe(marcada!)).toBe('completed');

      // ...e o reset devolve o estado puro do histórico: MATR volta a cursar
      await manageUseCase.resetManualOverrides();
      const resetada = await manageUseCase.getProfile();
      expect(resetada?.manualCompletedCodes).toEqual([]);
      expect(resetada?.manualUncompletedCodes).toEqual([]);
      expect(statusDe(resetada!)).toBe('in_progress');
    });

    it('deve salvar e resetar currículo customizado', async () => {
      const baseProfile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };
      await repo.saveProfile(baseProfile);

      const customCurriculum: CurriculumStructure = {
        ...MOCK_CURRICULUM,
        id: 'custom_123',
        mandatoryDisciplines: [
          ...MOCK_CURRICULUM.mandatoryDisciplines,
          {
            code: 'OPT999',
            name: 'TÓPICOS ESPECIAIS',
            workloadHours: 60,
            level: 0,
            nature: 'Optativa',
            prerequisites: [],
            equivalences: [],
          },
        ],
      };

      const updated = await manageUseCase.saveCustomCurriculum(customCurriculum);
      expect(updated.customCurriculum).toBeDefined();
      expect(updated.customCurriculum?.mandatoryDisciplines.some((d) => d.code === 'OPT999')).toBe(true);

      const profile = await manageUseCase.getProfile();
      expect(profile?.customCurriculum?.mandatoryDisciplines.length).toBe(MOCK_CURRICULUM.mandatoryDisciplines.length + 1);

      const afterReset = await manageUseCase.resetCustomCurriculum();
      expect(afterReset.customCurriculum).toBeUndefined();
    });

    it('deve obter nota de matéria equivalente concluída no fluxograma', () => {
      // Perfil com MAT0137 concluída com menção MS (equivalente de MAT0025)
      const profile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [
          {
            code: 'MAT0137',
            name: 'CÁLCULO 1',
            workloadHours: 90,
            situation: 'APR',
            isCompleted: true,
            grade: 'MS',
          },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      const flowchart = new GetFlowchartUseCase().execute(MOCK_CURRICULUM, profile);
      const mat0025 = flowchart.semesters
        .flatMap((s) => s.disciplines)
        .find((d) => d.code === 'MAT0025');

      expect(mat0025).toBeDefined();
      expect(mat0025?.status).toBe('completed');
      // Deve trazer a menção MS obtida pela equivalente
      expect(mat0025?.grade).toBe('MS');
    });

    it('deve incluir optativas de interesse com pré-requisitos nos semestres da grade', () => {
      const curriculumWithElective: CurriculumStructure = {
        ...MOCK_CURRICULUM,
        electiveDisciplines: [
          {
            code: 'OPT0001',
            name: 'DEEP LEARNING APLICADO',
            workloadHours: 60,
            level: 5,
            nature: 'Optativa',
            prerequisites: ['CIC0004'],
            equivalences: [],
          },
        ],
      };

      const profile: StudentAcademicProfile = {
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2022.1',
        completedDisciplines: [],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      };

      const flowchart = new GetFlowchartUseCase().execute(curriculumWithElective, profile);
      const sem5 = flowchart.semesters.find((s) => s.level === 5);
      expect(sem5).toBeDefined();
      const opt = sem5?.disciplines.find((d) => d.code === 'OPT0001');
      expect(opt).toBeDefined();
      expect(opt?.nature).toBe('Optativa');
      expect(opt?.prerequisites).toContain('CIC0004');
      // Como CIC0004 não está concluída, OPT0001 deve estar bloqueada
      expect(opt?.status).toBe('locked');
      expect(opt?.missingPrerequisites.length).toBeGreaterThan(0);
    });
  });

  describe('Correções de Bugs - Resiliência e Matrizes Antigas', () => {
    it('deve selecionar a matriz mais recente compatível com o ano de ingresso em vez de forçar a ativa mais nova', async () => {
      const curriculaCatalog: CurriculumStructure[] = [
        {
          id: 'curr-2026',
          courseId: '414610',
          courseName: 'ENGENHARIA DE COMPUTAÇÃO',
          code: '1741/3',
          createdYear: '2026',
          status: 'Ativa',
          totalHours: 2610,
          mandatoryDisciplines: [],
          electiveDisciplines: [],
          complementaryDisciplines: [],
        },
        {
          id: 'curr-2024',
          courseId: '414610',
          courseName: 'ENGENHARIA DE COMPUTAÇÃO',
          code: '1741/2',
          createdYear: '2024',
          status: 'Inativa',
          totalHours: 2460,
          mandatoryDisciplines: [],
          electiveDisciplines: [],
          complementaryDisciplines: [],
        },
        {
          id: 'curr-2016',
          courseId: '414610',
          courseName: 'ENGENHARIA DE COMPUTAÇÃO',
          code: '1741/1',
          createdYear: '2016',
          status: 'Inativa',
          totalHours: 2760,
          mandatoryDisciplines: [],
          electiveDisciplines: [],
          complementaryDisciplines: [],
        },
      ];

      const parser = new ParseHistoricoUseCase();
      // Discente ingressou em 2018 e tem código de matriz sem versão ou apenas prefixo "1741"
      const res = await parser.execute({
        rawText: `
          Dados do Vínculo do(a) Discente
          Curso: ENGENHARIA DE COMPUTAÇÃO - BACHARELADO - DIURNO
          Estrutura Curricular: 1741
          Ano / Período Letivo Inicial: 2018.1
          Matrícula: 180000000
        `,
        curriculaCatalog,
      });

      // Deve casar com 1741/1 (2016), que era a matriz vigente no ingresso (2016 <= 2018 < 2024), e NÃO 1741/3 (Ativa 2026)
      expect(res.matchedCurriculum?.code).toBe('1741/1');
      expect(res.matchedCurriculum?.createdYear).toBe('2016');
    });

    it('syncWithSigaa não deve zerar disciplinas salvas se a emissão do PDF falhar ou retornar vazia', async () => {
      const repo = new InMemoryAcademicProfileRepository();
      await repo.saveProfile({
        matricula: '202000000',
        courseName: 'ENGENHARIA DE COMPUTAÇÃO',
        level: 'GRADUAÇÃO',
        admissionYear: '2020.1',
        curriculumCode: '1741/1',
        completedDisciplines: [
          { code: 'CIC0004', name: 'APC', isCompleted: true },
          { code: 'MAT0025', name: 'CÁLCULO 1', isCompleted: true },
        ],
        manualCompletedCodes: [],
        manualUncompletedCodes: [],
        updatedAt: new Date().toISOString(),
      });

      repo.fetchSigaaHistory = async () => ({
        matricula: '202000000',
        nome: 'Discente Teste',
        curso: 'ENGENHARIA DE COMPUTAÇÃO',
        nivel: 'GRADUAÇÃO',
        status: 'ATIVO',
        entrada: '2020.1',
        ira: 4.5,
        pdfText: undefined,
        pdfBase64: undefined,
      });

      const useCase = new ManageAcademicProfileUseCase(repo);
      const result = await useCase.syncWithSigaa({ matricula: '202000000', senha: '123' });

      expect(result.profile.completedDisciplines.length).toBe(2);
      expect(result.profile.completedDisciplines.map((d) => d.code)).toEqual(['CIC0004', 'MAT0025']);
      expect(result.profile.ira).toBe(4.5);
    });

    it('syncWithSigaa deve respeitar a matriz selecionada manualmente pelo discente (userSelectedCurriculumCode)', async () => {
      const repo = new InMemoryAcademicProfileRepository();
      const curriculaCatalog: CurriculumStructure[] = [
        {
          id: 'curr-2026',
          courseId: '414610',
          courseName: 'ENGENHARIA DE COMPUTAÇÃO',
          code: '1741/3',
          createdYear: '2026',
          status: 'Ativa',
          mandatoryDisciplines: [],
          electiveDisciplines: [],
          complementaryDisciplines: [],
        },
        {
          id: 'curr-2016',
          courseId: '414610',
          courseName: 'ENGENHARIA DE COMPUTAÇÃO',
          code: '1741/1',
          createdYear: '2016',
          status: 'Inativa',
          mandatoryDisciplines: [],
          electiveDisciplines: [],
          complementaryDisciplines: [],
        },
      ];
      repo.getAllCurricula = async () => curriculaCatalog;
      repo.getCurriculaForCourse = async () => curriculaCatalog;

      const useCase = new ManageAcademicProfileUseCase(repo);
      await useCase.setCurriculum(curriculaCatalog[1]);

      const profileBefore = await repo.getProfile();
      expect(profileBefore?.userSelectedCurriculumCode).toBe('1741/1');

      repo.fetchSigaaHistory = async () => ({
        matricula: '202000000',
        nome: 'Discente Teste',
        curso: 'ENGENHARIA DE COMPUTAÇÃO',
        nivel: 'GRADUAÇÃO',
        status: 'ATIVO',
        entrada: '2020.1',
        pdfText: MOCK_HISTORICO_TEXT,
      });

      const syncResult = await useCase.syncWithSigaa({ matricula: '202000000', senha: '123' });

      expect(syncResult.profile.userSelectedCurriculumCode).toBe('1741/1');
      expect(syncResult.matchedCurriculum?.code).toBe('1741/1');
    });

    it('resolveCurriculumByAdmissionYear deve tolerar matrizes sem createdYear sem descartá-las', () => {
      const candidates = [
        { code: 'CUSTOM/1', createdYear: undefined },
        { code: '1741/1', createdYear: '2016' },
      ];
      const matched = resolveCurriculumByAdmissionYear(candidates, '2020.1');
      expect(matched?.code).toBe('1741/1');

      const customOnly = [{ code: 'CUSTOM/1', createdYear: undefined }];
      const matchedCustom = resolveCurriculumByAdmissionYear(customOnly, '2020.1');
      expect(matchedCustom?.code).toBe('CUSTOM/1');
    });
  });
});
