import type { Course } from '../domain/entities/course';
import type { FeedItem } from '../domain/entities/feed-item';
import type { SavedGrade, ScrapedClass, ScheduleSlot } from '../domain/entities/grade';

/**
 * Dados fictícios do Modo Demonstração (ativado pelas credenciais de teste em
 * demo-mode.service.ts), no formato das entidades de domínio para serem
 * gravados pelos repositórios do container em runtime — funciona igual no
 * SQLite do device e no espelho in-memory do web.
 *
 * Ids prefixados com "demo-" para nunca colidir com dados reais; as datas são
 * relativas a agora para os prazos do feed ficarem sempre "vivos".
 */

const hoursAgo = (h: number): string =>
  new Date(Date.now() - h * 3600 * 1000).toISOString();

const hoursFromNow = (h: number): string =>
  new Date(Date.now() + h * 3600 * 1000).toISOString();

export const DEMO_SEMESTER = '2026.2';

export const DEMO_COURSES: Course[] = [
  {
    id: 'demo-course-calc1',
    code: 'MAT0025',
    name: 'Cálculo 1',
    semester: DEMO_SEMESTER,
    platform: 'aprender3',
    professor: 'Prof. Marcelo Silva',
    classroom: 'PAT AT 02/10',
    schedule: 'Seg/Qua/Sex 08:00 - 09:50',
    turma: '01',
    unreadCount: 2,
    pendingAssignmentsCount: 1,
    url: 'https://aprender3.unb.br/course/view.php?id=1042',
    absences: 3,
    maxAbsences: 16,
  },
  {
    id: 'demo-course-apc',
    code: 'CIC0004',
    name: 'Algoritmos e Programação de Computadores',
    semester: DEMO_SEMESTER,
    platform: 'aprender3',
    professor: 'Profa. Renata Garcia',
    classroom: 'Lab CIC 03',
    schedule: 'Ter/Qui 14:00 - 15:50',
    turma: '02',
    unreadCount: 1,
    pendingAssignmentsCount: 1,
    url: 'https://aprender3.unb.br/course/view.php?id=1294',
    absences: 1,
    maxAbsences: 16,
  },
  {
    id: 'demo-course-ed',
    code: 'CIC0090',
    name: 'Estruturas de Dados',
    semester: DEMO_SEMESTER,
    platform: 'sigaa',
    professor: 'Prof. Carlos Eduardo',
    classroom: 'PJC BT 110',
    schedule: 'Seg/Qua 14:00 - 15:50',
    turma: '01',
    unreadCount: 3,
    pendingAssignmentsCount: 0,
    url: 'https://sigaa.unb.br/sigaa/portais/discente/discente.jsf',
    absences: 5,
    maxAbsences: 12,
  },
  {
    id: 'demo-course-mds',
    code: 'FGA0138',
    name: 'Métodos de Desenvolvimento de Software',
    semester: DEMO_SEMESTER,
    platform: 'teams',
    professor: 'Prof. Fernando Mendes',
    classroom: 'UED Sala 12 / Teams',
    schedule: 'Ter/Qui 16:00 - 17:50',
    turma: '01',
    unreadCount: 4,
    pendingAssignmentsCount: 1,
    url: 'https://teams.microsoft.com',
    absences: 0,
    maxAbsences: 12,
  },
  {
    id: 'demo-course-bd',
    code: 'CIC0097',
    name: 'Bancos de Dados',
    semester: DEMO_SEMESTER,
    platform: 'sigaa',
    professor: 'Profa. Maristela Holanda',
    classroom: 'PJC BT 114',
    schedule: 'Seg/Qua 08:00 - 09:50',
    turma: '01',
    unreadCount: 0,
    pendingAssignmentsCount: 0,
    url: 'https://sigaa.unb.br/sigaa/portais/discente/discente.jsf',
    absences: 2,
    maxAbsences: 12,
  },
];

export const DEMO_FEED_ITEMS: FeedItem[] = [
  {
    id: 'demo-feed-1',
    platform: 'aprender3',
    title: 'Lista 3 de Exercícios: Derivadas e Regra da Cadeia',
    content:
      'A Lista 3 já está disponível para envio. Certifiquem-se de submeter a resolução manuscrita escaneada em formato PDF até as 23h59.',
    courseName: 'Cálculo 1',
    courseCode: 'MAT0025',
    author: 'Prof. Marcelo Silva',
    itemType: 'assignment',
    createdAt: hoursAgo(2),
    dueDate: hoursFromNow(48),
    isCompleted: false,
    isArchived: false,
    externalUrl: 'https://aprender3.unb.br/mod/assign/view.php?id=1042',
  },
  {
    id: 'demo-feed-2',
    platform: 'sigaa',
    title: 'Divulgação das Notas da Prova 1 e Revisão de Menções',
    content:
      'As notas da primeira avaliação individual foram cadastradas no SIGAA. A sessão presencial de revisão ocorrerá na próxima quarta-feira na sala dos professores.',
    courseName: 'Estruturas de Dados',
    courseCode: 'CIC0090',
    author: 'Prof. Carlos Eduardo',
    itemType: 'post',
    createdAt: hoursAgo(5),
    isCompleted: false,
    isArchived: false,
    externalUrl: 'https://sigaa.unb.br/sigaa/portais/discente/discente.jsf',
  },
  {
    id: 'demo-feed-3',
    platform: 'aprender3',
    title: 'Projeto Prático 1: Implementação de Autômato Finito',
    content:
      'Submissão do código-fonte em C e relatório técnico referente ao Trabalho Prático da Unidade 1. Entrega individual através do VPL.',
    courseName: 'Algoritmos e Programação de Computadores',
    courseCode: 'CIC0004',
    author: 'Profa. Renata Garcia',
    itemType: 'assignment',
    createdAt: hoursAgo(12),
    dueDate: hoursFromNow(24),
    isCompleted: false,
    isArchived: false,
    externalUrl: 'https://aprender3.unb.br/mod/vpl/view.php?id=38192',
  },
  {
    id: 'demo-feed-4',
    platform: 'teams',
    title: 'Sprint 2: Reunião de Alinhamento e Arquitetura',
    content:
      'Disponibilizado o link da gravação da aula síncrona sobre Clean Architecture e divisão de microsserviços. O material de apoio está na aba Arquivos do canal Geral.',
    courseName: 'Métodos de Desenvolvimento de Software',
    courseCode: 'FGA0138',
    author: 'Prof. Fernando Mendes',
    itemType: 'post',
    createdAt: hoursAgo(24),
    isCompleted: false,
    isArchived: false,
    externalUrl: 'https://teams.microsoft.com',
  },
  {
    id: 'demo-feed-5',
    platform: 'teams',
    title: 'Entrega do Documento de Arquitetura de Software (DAS)',
    content:
      'Cada squad deve atualizar o repositório no GitHub com a versão v1.0 da documentação de arquitetura do projeto e submeter o link correspondente no canal da disciplina.',
    courseName: 'Métodos de Desenvolvimento de Software',
    courseCode: 'FGA0138',
    author: 'Prof. Fernando Mendes',
    itemType: 'assignment',
    createdAt: hoursAgo(48),
    dueDate: hoursFromNow(120),
    isCompleted: false,
    isArchived: false,
    externalUrl: 'https://teams.microsoft.com',
  },
  {
    id: 'demo-feed-6',
    platform: 'sigaa',
    title: 'Slides de Modelagem Relacional e Normalização 3FN',
    content:
      'Disponibilizados os slides da aula de Modelagem Entidade-Relacionamento e roteiro dos exercícios práticos para a próxima aula no laboratório.',
    courseName: 'Bancos de Dados',
    courseCode: 'CIC0097',
    author: 'Profa. Maristela Holanda',
    itemType: 'post',
    createdAt: hoursAgo(72),
    isCompleted: false,
    isArchived: false,
    externalUrl: 'https://sigaa.unb.br/sigaa/portais/discente/discente.jsf',
  },
  {
    id: 'demo-feed-7',
    platform: 'aprender3',
    title: 'Exercício de Fixação: Ponteiros e Alocação Dinâmica',
    content:
      'Exercício preparatório concluído no laboratório de programação da aula anterior.',
    courseName: 'Algoritmos e Programação de Computadores',
    courseCode: 'CIC0004',
    author: 'Profa. Renata Garcia',
    itemType: 'assignment',
    createdAt: hoursAgo(96),
    dueDate: hoursAgo(24),
    isCompleted: true,
    isArchived: false,
    externalUrl: 'https://aprender3.unb.br/mod/assign/view.php?id=38100',
  },
];

// ---- Grade horária salva (tela "Montar Grade") ----

const slot = (
  day: number,
  dayName: string,
  shift: 'M' | 'T' | 'N',
  period: number,
  timeRange: string,
  globalSlotIndex: number,
): ScheduleSlot => ({ day, dayName, shift, period, timeRange, globalSlotIndex });

const MORNING_P1 = '08:00 - 08:55';
const MORNING_P2 = '08:55 - 09:50';
const MORNING_P3 = '10:00 - 10:55';
const MORNING_P4 = '10:55 - 11:50';
const AFTERNOON_P2 = '14:00 - 14:55';
const AFTERNOON_P3 = '14:55 - 15:50';

const demoSelectedClasses: ScrapedClass[] = [
  {
    id: 'CIC0004-02',
    disciplineCode: 'CIC0004',
    disciplineName: 'ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES',
    classCode: '02',
    teachers: ['Profa. Renata Garcia'],
    classroom: 'Lab CIC 03',
    scheduleCode: '35T23',
    scheduleSlots: [
      slot(3, 'Ter', 'T', 2, AFTERNOON_P2, 6),
      slot(3, 'Ter', 'T', 3, AFTERNOON_P3, 7),
      slot(5, 'Qui', 'T', 2, AFTERNOON_P2, 6),
      slot(5, 'Qui', 'T', 3, AFTERNOON_P3, 7),
    ],
    vacancies: 45,
    occupied: 42,
  },
  {
    id: 'MAT0025-01',
    disciplineCode: 'MAT0025',
    disciplineName: 'CÁLCULO 1',
    classCode: '01',
    teachers: ['Prof. Marcelo Silva'],
    classroom: 'PAT AT 02/10',
    scheduleCode: '246M12',
    scheduleSlots: [
      slot(2, 'Seg', 'M', 1, MORNING_P1, 0),
      slot(2, 'Seg', 'M', 2, MORNING_P2, 1),
      slot(4, 'Qua', 'M', 1, MORNING_P1, 0),
      slot(4, 'Qua', 'M', 2, MORNING_P2, 1),
      slot(6, 'Sex', 'M', 1, MORNING_P1, 0),
      slot(6, 'Sex', 'M', 2, MORNING_P2, 1),
    ],
    vacancies: 60,
    occupied: 58,
  },
  {
    id: 'CIC0090-01',
    disciplineCode: 'CIC0090',
    disciplineName: 'ESTRUTURAS DE DADOS',
    classCode: '01',
    teachers: ['Prof. Carlos Eduardo'],
    classroom: 'PJC BT 110',
    scheduleCode: '24T23',
    scheduleSlots: [
      slot(2, 'Seg', 'T', 2, AFTERNOON_P2, 6),
      slot(2, 'Seg', 'T', 3, AFTERNOON_P3, 7),
      slot(4, 'Qua', 'T', 2, AFTERNOON_P2, 6),
      slot(4, 'Qua', 'T', 3, AFTERNOON_P3, 7),
    ],
    vacancies: 40,
    occupied: 39,
  },
  {
    id: 'CIC0097-01',
    disciplineCode: 'CIC0097',
    disciplineName: 'BANCOS DE DADOS',
    classCode: '01',
    teachers: ['Profa. Maristela Holanda'],
    classroom: 'PJC BT 114',
    scheduleCode: '24M34',
    scheduleSlots: [
      slot(2, 'Seg', 'M', 3, MORNING_P3, 2),
      slot(2, 'Seg', 'M', 4, MORNING_P4, 3),
      slot(4, 'Qua', 'M', 3, MORNING_P3, 2),
      slot(4, 'Qua', 'M', 4, MORNING_P4, 3),
    ],
    vacancies: 35,
    occupied: 35,
  },
];

export const DEMO_SAVED_GRADE: SavedGrade = {
  id: 'demo-grade-current',
  name: 'Minha Grade 2026.2',
  semester: DEMO_SEMESTER,
  selectedClasses: demoSelectedClasses,
  updatedAt: new Date().toISOString(),
};
