import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../container';
import type { FeedItem } from '../domain/entities/feed-item';
import type { Course } from '../domain/entities/course';
import { InMemorySyncRepository } from '../infrastructure/in-memory-sync.repo';

const TEST_COURSES: Course[] = [
  {
    id: 'test-course-1',
    code: 'MAT0025',
    name: 'Cálculo 1',
    semester: '2026.1',
    platform: 'aprender3',
    professor: 'Prof. Marcelo Silva',
    classroom: 'PAT AT 02/10',
    schedule: 'Seg/Qua 10:00 - 11:50',
    unreadCount: 2,
    pendingAssignmentsCount: 1,
  },
  {
    id: 'test-course-2',
    code: 'CIC0004',
    name: 'Algoritmos e Programação de Computadores',
    semester: '2026.1',
    platform: 'aprender3',
    professor: 'Profa. Renata Garcia',
    classroom: 'Lab CIC 03',
    schedule: 'Ter/Qui 08:00 - 09:50',
    unreadCount: 1,
    pendingAssignmentsCount: 2,
  },
  {
    id: 'test-course-3',
    code: 'CIC0090',
    name: 'Estruturas de Dados',
    semester: '2026.1',
    platform: 'sigaa',
    professor: 'Prof. Carlos Eduardo',
    classroom: 'PJC BT 110',
    schedule: 'Seg/Qua 14:00 - 15:50',
    unreadCount: 3,
    pendingAssignmentsCount: 0,
  },
  {
    id: 'test-course-4',
    code: 'FGA0138',
    name: 'Métodos de Desenvolvimento de Software',
    semester: '2026.1',
    platform: 'teams',
    professor: 'Prof. Fernando Mendes',
    classroom: 'Teams Online / FGA UED',
    schedule: 'Ter/Qui 16:00 - 17:50',
    unreadCount: 4,
    pendingAssignmentsCount: 1,
  },
];

const TEST_FEED_ITEMS: FeedItem[] = [
  {
    id: 'test-feed-1',
    platform: 'aprender3',
    title: 'Lista 3 de Exercícios: Derivadas e Regra da Cadeia',
    content: 'A Lista 3 já está disponível para envio.',
    courseName: 'Cálculo 1',
    courseCode: 'MAT0025',
    author: 'Prof. Marcelo Silva',
    itemType: 'assignment',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    isCompleted: false,
    externalUrl: 'https://aprender3.unb.br/mod/assign/view.php?id=1042',
  },
  {
    id: 'test-feed-2',
    platform: 'sigaa',
    title: 'Divulgação das Notas da Prova 1',
    content: 'As notas da primeira avaliação foram cadastradas.',
    courseName: 'Estruturas de Dados',
    courseCode: 'CIC0090',
    author: 'Prof. Carlos Eduardo',
    itemType: 'post',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    externalUrl: 'https://sigaa.unb.br/sigaa',
  },
  {
    id: 'test-feed-3',
    platform: 'teams',
    title: 'Sprint 2: Reunião de Alinhamento',
    content: 'Disponibilizado o link da gravação.',
    courseName: 'Métodos de Desenvolvimento de Software',
    courseCode: 'FGA0138',
    author: 'Prof. Fernando Mendes',
    itemType: 'post',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    externalUrl: 'https://teams.microsoft.com',
  },
  {
    id: 'test-feed-4',
    platform: 'aprender3',
    title: 'Projeto Prático 1',
    content: 'Submissão do código-fonte.',
    courseName: 'Algoritmos e Programação de Computadores',
    courseCode: 'CIC0004',
    author: 'Profa. Renata Garcia',
    itemType: 'assignment',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    isCompleted: false,
    externalUrl: 'https://aprender3.unb.br/mod/vpl/view.php?id=38192',
  },
];

describe('Clean Architecture Use Cases - Saruê UnB', () => {
  let container: ReturnType<typeof createContainer>;

  beforeEach(async () => {
    const syncRepo = new InMemorySyncRepository(TEST_FEED_ITEMS, TEST_COURSES);
    container = createContainer({ repos: { syncRepo } });
    await container.repos.feedRepo.clear();
  });

  describe('SaveCredentialsUseCase por Plataforma', () => {
    it('SIGAA: deve validar matrícula e salvar com sucesso', async () => {
      const invalid = await container.useCases.saveCredentials.saveSigaa({
        matricula: '123',
        senha: 'senha-segura',
      });
      expect(invalid.success).toBe(false);
      expect(invalid.error).toContain('Matrícula');

      const valid = await container.useCases.saveCredentials.saveSigaa({
        matricula: '202012345',
        senha: 'senha-segura',
      });
      expect(valid.success).toBe(true);

      const saved = await container.useCases.getCredentials.getSigaa();
      expect(saved?.matricula).toBe('202012345');
    });

    it('Aprender 3: deve validar CPF de 11 dígitos e salvar com sucesso', async () => {
      const invalidCpf = await container.useCases.saveCredentials.saveAprender3({
        cpf: '123.456',
        senha: 'senha-aprender',
      });
      expect(invalidCpf.success).toBe(false);
      expect(invalidCpf.error).toContain('CPF');

      const valid = await container.useCases.saveCredentials.saveAprender3({
        cpf: '012.345.678-90',
        senha: 'senha-aprender',
      });
      expect(valid.success).toBe(true);

      const saved = await container.useCases.getCredentials.getAprender3();
      expect(saved?.cpf).toBe('01234567890');
    });

    it('Teams: deve registrar login manual interativo com sucesso', async () => {
      const valid = await container.useCases.saveCredentials.saveTeams({
        isConnected: true,
        email: 'aluno@aluno.unb.br',
      });
      expect(valid.success).toBe(true);

      const saved = await container.useCases.getCredentials.getTeams();
      expect(saved?.isConnected).toBe(true);
      expect(saved?.email).toBe('aluno@aluno.unb.br');
    });
  });

  describe('SyncPlatformsUseCase e GetFeedUseCase', () => {
    it('deve sincronizar plataformas e retornar itens ordenados cronologicamente', async () => {
      const syncResult = await container.useCases.syncPlatforms.execute(['sigaa', 'aprender3']);

      expect(syncResult.items.length).toBeGreaterThan(0);
      expect(syncResult.syncedAt).toBeDefined();

      const feed = await container.useCases.getFeed.execute();
      expect(feed.length).toBeGreaterThan(0);

      // Validação de ordenação cronológica decrescente por createdAt (mais recentes primeiro)
      for (let i = 0; i < feed.length - 1; i++) {
        const current = feed[i];
        const next = feed[i + 1];
        expect(new Date(current.createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(next.createdAt).getTime()
        );
      }
    });

    it('deve filtrar itens por plataforma corretamente', async () => {
      await container.useCases.syncPlatforms.execute();
      const aprenderItems = await container.useCases.getFeed.execute({ platform: 'aprender3' });

      expect(aprenderItems.length).toBeGreaterThan(0);
      for (const item of aprenderItems) {
        expect(item.platform).toBe('aprender3');
      }

      const teamsItems = await container.useCases.getFeed.execute({ platform: 'teams' });
      expect(teamsItems.length).toBeGreaterThan(0);
      for (const item of teamsItems) {
        expect(item.platform).toBe('teams');
      }
    });

    it('deve persistir e listar turmas via GetCoursesUseCase com o repositório padrão', async () => {
      await container.useCases.syncPlatforms.execute();
      const courses = await container.useCases.getCourses.execute();
      expect(courses.length).toBeGreaterThan(0);
      expect(courses[0].name).toBeDefined();
    });

    it('deve alternar status de conclusão de tarefa persistida', async () => {
      await container.useCases.syncPlatforms.execute();
      const items = await container.useCases.getFeed.execute();
      const task = items.find((i) => i.itemType === 'assignment');
      expect(task).toBeDefined();

      if (task) {
        const initialStatus = task.isCompleted;
        await container.useCases.getFeed.markAsCompleted(task.id, !initialStatus);
        const refreshed = await container.useCases.getFeed.execute();
        const updatedTask = refreshed.find((i) => i.id === task.id);
        expect(updatedTask?.isCompleted).toBe(!initialStatus);
      }
    });

    it('deve arquivar item do feed e permitir restauração', async () => {
      await container.useCases.syncPlatforms.execute();
      const initialItems = await container.useCases.getFeed.execute();
      expect(initialItems.length).toBeGreaterThan(0);

      const targetItem = initialItems[0];
      await container.useCases.getFeed.archiveItem(targetItem.id, true);

      // O item não deve aparecer no feed padrão
      const activeItems = await container.useCases.getFeed.execute();
      expect(activeItems.some((i) => i.id === targetItem.id)).toBe(false);

      // O item deve aparecer quando filtrado apenas por arquivados
      const archivedItems = await container.useCases.getFeed.execute({ onlyArchived: true });
      expect(archivedItems.some((i) => i.id === targetItem.id)).toBe(true);

      // Desfaz o arquivamento
      await container.useCases.getFeed.archiveItem(targetItem.id, false);
      const restoredItems = await container.useCases.getFeed.execute();
      expect(restoredItems.some((i) => i.id === targetItem.id)).toBe(true);
    });
  });

  describe('GetCoursesUseCase e Disciplines Matching', () => {
    it('deve associar turmas do Aprender 3 a disciplinas do SIGAA e identificar não associadas', async () => {
      // Salva disciplinas do SIGAA e turmas do Aprender 3
      await container.repos.feedRepo.saveCourses([
        {
          id: 'sigaa-oac',
          code: 'CIC0099',
          name: 'ORGANIZAÇÃO E ARQUITETURA DE COMPUTADORES',
          semester: '2026.2',
          platform: 'sigaa',
        },
        {
          id: 'sigaa-fis2-exp',
          code: 'IFD0177',
          name: 'FISICA 2 EXPERIMENTAL',
          semester: '2026.2',
          platform: 'sigaa',
        },
        {
          id: 'sigaa-fis2',
          code: 'IFD0171',
          name: 'FISICA 2',
          semester: '2026.2',
          platform: 'sigaa',
        },
        {
          id: 'aprender-oac',
          code: 'CIC0099',
          name: 'CIC0099 - ORGANIZAÇÃO E ARQUITETURA DE COMPUTADORES - Turma 02 - 2026/2',
          semester: '2026.2',
          platform: 'aprender3',
        },
        {
          id: 'aprender-fis2-exp',
          code: 'IFD0177',
          name: 'IFD0177 - FISICA 2 EXPERIMENTAL - Turma 03 - 2026/2',
          semester: '2026.2',
          platform: 'aprender3',
        },
        {
          id: 'aprender-forum-geral',
          code: 'GERAL',
          name: 'Mural de Avisos da Faculdade de Tecnologia',
          semester: '2026.2',
          platform: 'aprender3',
        },
      ]);

      const result = await container.useCases.getCourses.getDisciplines();

      // 3 disciplinas do SIGAA
      expect(result.disciplines.length).toBe(3);

      // OAC deve ter o Aprender 3 associado
      const oac = result.disciplines.find((d) => d.name === 'ORGANIZAÇÃO E ARQUITETURA DE COMPUTADORES');
      expect(oac).toBeDefined();
      expect(oac?.aprenderCourses.length).toBe(1);
      expect(oac?.aprenderCourses[0].id).toBe('aprender-oac');

      // FISICA 2 EXPERIMENTAL deve casar com o curso experimental e NÃO com FISICA 2
      const fisExp = result.disciplines.find((d) => d.name === 'FISICA 2 EXPERIMENTAL');
      expect(fisExp?.aprenderCourses.length).toBe(1);
      expect(fisExp?.aprenderCourses[0].id).toBe('aprender-fis2-exp');

      // Fórum geral não casa automaticamente
      expect(result.unmatchedAprenderCourses.length).toBe(1);
      expect(result.unmatchedAprenderCourses[0].id).toBe('aprender-forum-geral');

      // Usuário decide associar manualmente o fórum geral a FISICA 2
      await container.useCases.getCourses.associateCourse('aprender-forum-geral', 'sigaa-fis2', false);

      const afterManualAssoc = await container.useCases.getCourses.getDisciplines();
      expect(afterManualAssoc.unmatchedAprenderCourses.length).toBe(0);
      const fis2 = afterManualAssoc.disciplines.find((d) => d.name === 'FISICA 2');
      expect(fis2?.aprenderCourses.some((c) => c.id === 'aprender-forum-geral')).toBe(true);

      // Se o usuário marcar como ignorado
      await container.useCases.getCourses.associateCourse('aprender-forum-geral', null, true);
      const afterIgnored = await container.useCases.getCourses.getDisciplines();
      expect(afterIgnored.unmatchedAprenderCourses.length).toBe(0);
      const fis2Clean = afterIgnored.disciplines.find((d) => d.name === 'FISICA 2');
      expect(fis2Clean?.aprenderCourses.some((c) => c.id === 'aprender-forum-geral')).toBe(false);
    });

    it('deve ignorar a turma institucional Espaço do Aluno', async () => {
      await container.repos.feedRepo.saveCourses([
        {
          id: 'aprender-espaco-aluno',
          code: 'UNB0000',
          name: 'Espaço do Aluno - Comunidade Geral UnB',
          semester: '2026.2',
          platform: 'aprender3',
        },
      ]);
      const result = await container.useCases.getCourses.getDisciplines();
      expect(result.unmatchedAprenderCourses.some((c) => c.id === 'aprender-espaco-aluno')).toBe(false);
      const all = await container.useCases.getCourses.execute();
      expect(all.some((c) => c.id === 'aprender-espaco-aluno')).toBe(false);
    });

    it('deve associar equipes do Teams por sigla (SSTC, OAC) e direcionar turmas para a seção Outros', async () => {
      await container.repos.feedRepo.saveCourses([
        {
          id: 'sigaa-sstc',
          code: 'ENE0013',
          name: 'SINAIS E SISTEMAS NO TEMPO CONTÍNUO',
          semester: '2026.2',
          platform: 'sigaa',
        },
        {
          id: 'sigaa-oac',
          code: 'CIC0099',
          name: 'ORGANIZAÇÃO E ARQUITETURA DE COMPUTADORES',
          semester: '2026.2',
          platform: 'sigaa',
        },
        {
          id: 'teams-sstc',
          code: 'SSTC',
          name: 'SSTC (2026/2)',
          semester: '2026.2',
          platform: 'teams',
        },
        {
          id: 'teams-oac',
          code: 'OAC',
          name: 'OAC Prof Ricardo Jacobi',
          semester: '2026.2',
          platform: 'teams',
        },
        {
          id: 'teams-monitoria',
          code: 'MONIT',
          name: 'Monitoria Geral de Engenharia',
          semester: '2026.2',
          platform: 'teams',
        },
      ]);

      const result = await container.useCases.getCourses.getDisciplines();

      // Verifica matching automático por sigla do Teams
      const sstc = result.disciplines.find((d) => d.id === 'sigaa-sstc');
      expect(sstc).toBeDefined();
      expect(sstc?.teamsCourses?.length).toBe(1);
      expect(sstc?.teamsCourses?.[0].id).toBe('teams-sstc');

      const oac = result.disciplines.find((d) => d.id === 'sigaa-oac');
      expect(oac).toBeDefined();
      expect(oac?.teamsCourses?.length).toBe(1);
      expect(oac?.teamsCourses?.[0].id).toBe('teams-oac');

      // Monitoria não associada
      expect(result.unmatchedCourses.some((c) => c.id === 'teams-monitoria')).toBe(true);

      // Usuário associa a monitoria à seção __others__
      await container.useCases.getCourses.associateCourse('teams-monitoria', '__others__', false);

      const afterOthers = await container.useCases.getCourses.getDisciplines();
      expect(afterOthers.otherCourses.length).toBe(1);
      expect(afterOthers.otherCourses[0].id).toBe('teams-monitoria');
      expect(afterOthers.unmatchedCourses.some((c) => c.id === 'teams-monitoria')).toBe(false);
    });
  });

  describe('GetFeedUseCase.clear() - Limpeza Total de Feed e Turmas', () => {
    it('deve limpar completamente itens de feed, turmas e associações do repositório', async () => {
      // 1. Sincroniza dados simulados
      await container.useCases.syncPlatforms.execute();
      const feedBefore = await container.useCases.getFeed.execute();
      const coursesBefore = await container.useCases.getCourses.execute();
      expect(feedBefore.length).toBeGreaterThan(0);
      expect(coursesBefore.length).toBeGreaterThan(0);

      // 2. Executa a limpeza total
      await container.useCases.getFeed.clear();

      // 3. Valida que tudo foi zerado
      const feedAfter = await container.useCases.getFeed.execute();
      const coursesAfter = await container.useCases.getCourses.execute();
      const disciplinesAfter = await container.useCases.getCourses.getDisciplines();

      expect(feedAfter).toEqual([]);
      expect(coursesAfter).toEqual([]);
      expect(disciplinesAfter.disciplines).toEqual([]);
      expect(disciplinesAfter.unmatchedAprenderCourses).toEqual([]);
    });

    it('deve marcar atividades do Teams como concluídas quando entregues na plataforma sem desmarcar conclusões manuais', async () => {
      await container.repos.feedRepo.saveItems([
        {
          id: 'teams-assign-OAC-1',
          platform: 'teams',
          title: 'Trabalho RISC-V',
          content: 'Simulador Assembly',
          courseName: 'OAC Prof Ricardo Jacobi',
          courseCode: 'OAC',
          itemType: 'assignment',
          createdAt: '2026-10-01T12:00:00Z',
          dueDate: '2026-10-20T23:59:00Z',
          isCompleted: false,
        },
        {
          id: 'teams-assign-OAC-2',
          platform: 'teams',
          title: 'Lista 1',
          content: 'Exercícios',
          courseName: 'OAC Prof Ricardo Jacobi',
          courseCode: 'OAC',
          itemType: 'assignment',
          createdAt: '2026-09-10T12:00:00Z',
          dueDate: '2026-09-25T23:59:00Z',
          isCompleted: false,
        },
      ]);

      // Usuário marca Lista 1 manualmente como concluída no app
      await container.useCases.getFeed.markAsCompleted('teams-assign-OAC-2', true);

      // Nova sincronização do Teams: Trabalho RISC-V foi entregue no Teams (isCompleted: true),
      // enquanto Lista 1 ainda consta como false no retorno bruto
      await container.repos.feedRepo.saveItems([
        {
          id: 'teams-assign-OAC-1',
          platform: 'teams',
          title: 'Trabalho RISC-V',
          content: 'Simulador Assembly',
          courseName: 'OAC Prof Ricardo Jacobi',
          courseCode: 'OAC',
          itemType: 'assignment',
          createdAt: '2026-10-01T12:00:00Z',
          dueDate: '2026-10-20T23:59:00Z',
          isCompleted: true,
        },
        {
          id: 'teams-assign-OAC-2',
          platform: 'teams',
          title: 'Lista 1',
          content: 'Exercícios',
          courseName: 'OAC Prof Ricardo Jacobi',
          courseCode: 'OAC',
          itemType: 'assignment',
          createdAt: '2026-09-10T12:00:00Z',
          dueDate: '2026-09-25T23:59:00Z',
          isCompleted: false,
        },
      ]);

      const items = await container.useCases.getFeed.execute({ platform: 'teams' });
      const riscv = items.find((i) => i.id === 'teams-assign-OAC-1');
      const lista1 = items.find((i) => i.id === 'teams-assign-OAC-2');

      expect(riscv?.isCompleted).toBe(true);
      expect(lista1?.isCompleted).toBe(true);
    });
  });
});

