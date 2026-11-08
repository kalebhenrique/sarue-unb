import type {
  Credential,
  SigaaCredentials,
  Aprender3Credentials,
  TeamsCredentials,
} from '../domain/entities/credential';
import {
  validateMatricula,
  validateCpf,
  validateSenha,
} from '../domain/entities/credential';
import type { ICredentialsRepository } from '../domain/interfaces/credentials-repo.interface';
import type { IFeedRepository } from '../domain/interfaces/feed-repo.interface';

export interface SaveResult {
  success: boolean;
  error?: string;
  detail?: string;
}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export class SaveCredentialsUseCase {
  constructor(
    private readonly credentialsRepo: ICredentialsRepository,
    private readonly feedRepo?: IFeedRepository
  ) {}

  async saveSigaa(
    credentials: SigaaCredentials,
    options?: { validate?: boolean }
  ): Promise<SaveResult> {
    if (!credentials.matricula || !validateMatricula(credentials.matricula)) {
      return { success: false, error: 'Matrícula do SIGAA inválida (informe 6 a 12 dígitos).' };
    }
    if (!credentials.senha || !validateSenha(credentials.senha)) {
      return { success: false, error: 'Senha do SIGAA deve ter ao menos 4 caracteres.' };
    }

    const cleanMatricula = credentials.matricula.trim();

    // Validação ativa contra o servidor do SIGAA quando executando no Tauri
    const shouldValidate = options?.validate ?? true;
    if (shouldValidate && isTauriEnvironment()) {
      try {
        const { commands } = await import('@/core/infrastructure/bindings');
        const res = await commands.validateSigaaCredentials(cleanMatricula, credentials.senha);
        if (res.status === 'error') {
          return {
            success: false,
            error: res.error || 'Falha ao autenticar no SIGAA. Verifique matrícula e senha.',
          };
        }

        await this.credentialsRepo.saveSigaa({
          matricula: cleanMatricula,
          senha: credentials.senha,
        });

        return {
          success: true,
          detail: res.data || 'Conta do SIGAA validada e conectada com sucesso!',
        };
      } catch (e: unknown) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Falha na conexão com o servidor do SIGAA',
        };
      }
    }

    try {
      await this.credentialsRepo.saveSigaa({
        matricula: cleanMatricula,
        senha: credentials.senha,
      });
      return { success: true, detail: 'Credenciais salvas com sucesso' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao salvar credenciais do SIGAA' };
    }
  }

  async saveAprender3(
    credentials: Aprender3Credentials,
    options?: { validate?: boolean }
  ): Promise<SaveResult> {
    const cleanCpf = credentials.cpf.replace(/\D/g, '');
    if (!validateCpf(cleanCpf)) {
      return { success: false, error: 'CPF do Aprender 3 inválido (informe os 11 dígitos).' };
    }
    if (!credentials.senha || !validateSenha(credentials.senha)) {
      return { success: false, error: 'Senha do Aprender 3 deve ter ao menos 4 caracteres.' };
    }

    // Validação ativa contra o servidor do Aprender 3 quando executando no Tauri
    const shouldValidate = options?.validate ?? true;
    if (shouldValidate && isTauriEnvironment()) {
      try {
        const { commands } = await import('@/core/infrastructure/bindings');
        const res = await commands.validateAprender3Credentials(cleanCpf, credentials.senha);
        if (res.status === 'error') {
          return {
            success: false,
            error: res.error || 'CPF ou senha incorretos no Aprender 3.',
          };
        }

        await this.credentialsRepo.saveAprender3({
          cpf: cleanCpf,
          senha: credentials.senha,
        });

        return {
          success: true,
          detail: res.data || 'Conta do Aprender 3 validada e conectada com sucesso!',
        };
      } catch (e: unknown) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Falha na conexão com o servidor do Aprender 3',
        };
      }
    }

    try {
      await this.credentialsRepo.saveAprender3({
        cpf: cleanCpf,
        senha: credentials.senha,
      });
      return { success: true, detail: 'Credenciais salvas com sucesso' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao salvar credenciais do Aprender 3' };
    }
  }

  async saveTeams(
    credentials: TeamsCredentials,
    options?: { validate?: boolean }
  ): Promise<SaveResult> {
    const shouldValidate = options?.validate ?? true;

    if (credentials.isConnected && shouldValidate && isTauriEnvironment()) {
      try {
        const { commands } = await import('@/core/infrastructure/bindings');
        const res = await commands.connectTeams(credentials.email || null);
        if (res.status === 'error') {
          return {
            success: false,
            error: res.error || 'Falha ao autenticar no Microsoft Teams.',
          };
        }

        const confirmedEmail = res.data.email || credentials.email;
        const savedCreds: TeamsCredentials = {
          isConnected: true,
          email: confirmedEmail,
          connectedAt: new Date().toISOString(),
        };

        await this.credentialsRepo.saveTeams(savedCreds);

        // Se foram extraídos turmas e itens da sincronização em segundo plano, salva no repositório
        if (this.feedRepo) {
          if (res.data.items && res.data.items.length > 0) {
            const domainItems = res.data.items.map((item) => ({
              ...item,
              courseCode: item.courseCode ?? undefined,
              author: item.author ?? undefined,
              dueDate: item.dueDate ?? undefined,
              isCompleted: item.isCompleted ?? undefined,
              externalUrl: item.externalUrl ?? undefined,
            }));
            await this.feedRepo.saveItems(domainItems);
          }
          if (res.data.courses && res.data.courses.length > 0) {
            const domainCourses = res.data.courses.map((c) => ({
              ...c,
              professor: c.professor ?? undefined,
              classroom: c.classroom ?? undefined,
              schedule: c.schedule ?? undefined,
              turma: c.classGroup ?? undefined,
              unreadCount: c.unreadCount ?? undefined,
              pendingAssignmentsCount: c.pendingAssignmentsCount ?? undefined,
              url: c.url ?? undefined,
              absences: c.absences ?? undefined,
              maxAbsences: c.maxAbsences ?? undefined,
            }));
            await this.feedRepo.saveCourses(domainCourses);
          }
        }

        const countCourses = res.data.courses?.length || 0;
        const countItems = res.data.items?.length || 0;
        const detailMsg = countCourses > 0
          ? `Microsoft Teams conectado! ${countCourses} equipe${countCourses > 1 ? 's' : ''} e ${countItems} comunicado${countItems > 1 ? 's' : ''} sincronizados.`
          : confirmedEmail
            ? `Microsoft Teams conectado como ${confirmedEmail}!`
            : 'Microsoft Teams conectado com sucesso!';

        return {
          success: true,
          detail: detailMsg,
        };
      } catch (e: unknown) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Falha na autenticação com o Microsoft Teams',
        };
      }
    }

    if (!credentials.isConnected && isTauriEnvironment()) {
      try {
        const { commands } = await import('@/core/infrastructure/bindings');
        await commands.disconnectTeams();
      } catch {
        // Fallback silencioso
      }
    }

    try {
      await this.credentialsRepo.saveTeams(credentials);
      return { success: true, detail: credentials.isConnected ? 'Microsoft Teams conectado com sucesso' : 'Microsoft Teams desconectado' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao salvar estado do Teams' };
    }
  }

  // Compatibilidade com fluxo inicial
  async execute(credentials: Credential): Promise<SaveResult> {
    return this.saveSigaa(credentials);
  }
}
