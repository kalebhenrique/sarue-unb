import type { FeedItem, PlatformType } from '../domain/entities/feed-item';
import type { Course } from '../domain/entities/course';
import type { ISyncRepository, SyncResult } from '../domain/interfaces/sync-repo.interface';
import type { ICredentialsRepository } from '../domain/interfaces/credentials-repo.interface';

export class TauriSyncRepository implements ISyncRepository {
  constructor(private readonly credentialsRepo: ICredentialsRepository) {}

  async syncPlatform(platform: PlatformType): Promise<FeedItem[]> {
    const fullResult = await this.syncAll([platform]);
    return fullResult.items.filter((item) => item.platform === platform);
  }

  async syncAll(platforms?: PlatformType[]): Promise<SyncResult> {
    const requestedPlatforms: PlatformType[] = platforms && platforms.length > 0
      ? platforms
      : ['sigaa', 'aprender3', 'teams'];

    try {
      const { commands } = await import('@/core/infrastructure/bindings');
      const allCreds = await this.credentialsRepo.getAll();

      const activePlatforms = requestedPlatforms.filter((p) => {
        if (p === 'sigaa') return Boolean(allCreds.sigaa?.matricula && allCreds.sigaa?.senha);
        if (p === 'aprender3') return Boolean(allCreds.aprender3?.cpf && allCreds.aprender3?.senha);
        if (p === 'teams') return Boolean(allCreds.teams?.isConnected);
        return false;
      });

      if (activePlatforms.length === 0) {
        return {
          items: [],
          courses: [],
          syncedAt: new Date().toISOString(),
        };
      }

      const response = await commands.syncPlatforms(
        activePlatforms,
        allCreds.sigaa
          ? {
              matricula: allCreds.sigaa.matricula,
              password: allCreds.sigaa.senha,
            }
          : null,
        allCreds.aprender3
          ? {
              cpf: allCreds.aprender3.cpf,
              password: allCreds.aprender3.senha,
            }
          : null,
        allCreds.teams
          ? {
              isConnected: allCreds.teams.isConnected ?? null,
              email: allCreds.teams.email ?? null,
            }
          : null
      );

      if (response.status === 'error') {
        throw new Error(response.error);
      }

      // Verifica novamente se o usuário apagou os dados/credenciais enquanto o comando nativo rodava
      const credsAfter = await this.credentialsRepo.getAll();
      const isStillActive = (p: string) => {
        if (p === 'sigaa') return Boolean(credsAfter.sigaa?.matricula && credsAfter.sigaa?.senha);
        if (p === 'aprender3') return Boolean(credsAfter.aprender3?.cpf && credsAfter.aprender3?.senha);
        if (p === 'teams') return Boolean(credsAfter.teams?.isConnected);
        return false;
      };

      const filteredItems: FeedItem[] = (response.data.items || [])
        .filter((item) => isStillActive(item.platform))
        .map((item) => ({
          id: item.id,
          platform: item.platform,
          title: item.title,
          content: item.content,
          courseName: item.courseName,
          courseCode: item.courseCode ?? undefined,
          author: item.author ?? undefined,
          itemType: item.itemType,
          createdAt: item.createdAt,
          dueDate: item.dueDate ?? undefined,
          isCompleted: item.isCompleted ?? undefined,
          externalUrl: item.externalUrl ?? undefined,
        }));

      const filteredCourses: Course[] = (response.data.courses || [])
        .filter((course) => isStillActive(course.platform))
        .map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          semester: c.semester,
          platform: c.platform,
          professor: c.professor ?? undefined,
          classroom: c.classroom ?? undefined,
          schedule: c.schedule ?? undefined,
          turma: c.classGroup ?? undefined,
          unreadCount: c.unreadCount ?? undefined,
          pendingAssignmentsCount: c.pendingAssignmentsCount ?? undefined,
          url: c.url ?? undefined,
          absences: c.absences !== null && c.absences !== undefined ? c.absences : undefined,
          maxAbsences: c.maxAbsences !== null && c.maxAbsences !== undefined ? c.maxAbsences : undefined,
        }));

      return {
        items: filteredItems,
        courses: filteredCourses,
        syncedAt: response.data.syncedAt,
        errors: response.data.errors ?? undefined,
      };
    } catch (error) {
      console.error('Erro no comando nativo Tauri de sincronização:', error);
      return {
        items: [],
        courses: [],
        syncedAt: new Date().toISOString(),
        errors: { aprender3: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}
