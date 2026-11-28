import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TauriSyncRepository } from '../infrastructure/tauri-sync.repo';
import type { ICredentialsRepository } from '../domain/interfaces/credentials-repo.interface';

const mockSyncPlatforms = vi.fn();

vi.mock('@/core/infrastructure/bindings', () => ({
  commands: {
    syncPlatforms: (...args: unknown[]) => mockSyncPlatforms(...args),
  },
}));

function makeCredsRepo(): ICredentialsRepository {
  return {
    getAll: vi.fn().mockResolvedValue({
      sigaa: { matricula: '202012345', senha: 'secret' },
      aprender3: { cpf: '12345678901', senha: 'secret' },
    }),
    saveSigaa: vi.fn(),
    saveAprender3: vi.fn(),
    saveTeams: vi.fn(),
    clearPlatform: vi.fn(),
    clearAll: vi.fn(),
  } as unknown as ICredentialsRepository;
}

describe('TauriSyncRepository error handling', () => {
  beforeEach(() => {
    mockSyncPlatforms.mockReset();
  });

  it('atribui erro de IPC à plataforma solicitada (sigaa) em vez de aprender3', async () => {
    mockSyncPlatforms.mockRejectedValueOnce(
      new Error(
        'error sending request for url (https://autenticacao.unb.br/sso-server/login): client error (Connect): dns error',
      ),
    );

    const repo = new TauriSyncRepository(makeCredsRepo());
    const result = await repo.syncAll(['sigaa']);

    expect(result.errors?.sigaa).toBe(
      'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.',
    );
    expect(result.errors?.aprender3).toBeUndefined();
  });

  it('sanitiza erros retornados por plataforma dentro de response.data.errors', async () => {
    mockSyncPlatforms.mockResolvedValueOnce({
      status: 'ok',
      data: {
        items: [],
        courses: [],
        syncedAt: '2026-11-28T00:00:00.000Z',
        errors: {
          sigaa: "Token 'lt' não encontrado no formulário CAS.",
        },
      },
    });

    const repo = new TauriSyncRepository(makeCredsRepo());
    const result = await repo.syncAll(['sigaa']);

    expect(result.errors?.sigaa).toBe(
      'O portal está instável ou em manutenção no momento. Tente novamente em alguns instantes.',
    );
  });
});
