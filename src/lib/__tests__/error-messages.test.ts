import { describe, it, expect } from 'vitest';
import { humanizeError, isAuthErrorMessage } from '../error-messages';

describe('humanizeError', () => {
  it('converte erro bruto do reqwest com URL longa e DNS em mensagem amigável', () => {
    const raw =
      'Falha de conexão com CAS SSO UnB: error sending request for url (https://autenticacao.unb.br/sso-server/login?service=https%3A%2F%2Fsig.unb.br%2Fsigaa%2Flogin%2Fcas): client error (Connect): dns error: failed to lookup address information: nodename nor servname provided, or not known';

    const result = humanizeError(raw);
    expect(result).toBe(
      'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.',
    );
    expect(result).not.toContain('https://');
  });

  it('converte erro de timeout em mensagem amigável', () => {
    const raw =
      'Falha ao conectar no Aprender 3: error sending request for url (https://aprender3.unb.br/login/index.php): operation timed out';
    expect(humanizeError(raw)).toBe(
      'Tempo esgotado ao conectar ao servidor. Ele pode estar lento ou instável.',
    );
  });

  it('converte Failed to fetch em erro de conexão', () => {
    expect(humanizeError(new TypeError('Failed to fetch'))).toBe(
      'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.',
    );
  });

  it('converte erros internos de parser CAS/Moodle em mensagem de instabilidade', () => {
    expect(humanizeError("Token 'lt' não encontrado no formulário CAS.")).toBe(
      'O portal está instável ou em manutenção no momento. Tente novamente em alguns instantes.',
    );
    expect(
      humanizeError('Não foi possível extrair o logintoken de segurança do Aprender 3.'),
    ).toBe(
      'O portal está instável ou em manutenção no momento. Tente novamente em alguns instantes.',
    );
  });

  it('converte HTTP 503 / 502 em indisponibilidade temporária', () => {
    expect(humanizeError('CDN retornou status HTTP 503 Service Unavailable')).toBe(
      'O servidor está temporariamente indisponível. Tente novamente mais tarde.',
    );
  });

  it('preserva mensagens amigáveis em português vindas do backend', () => {
    const friendly =
      'Credenciais inválidas ou falha de login no SIGAA. Verifique matrícula e senha (lembre-se de respeitar maiúsculas/minúsculas).';
    expect(humanizeError(friendly)).toBe(friendly);
  });

  it('cai no fallback quando recebe string técnica com URL não mapeada', () => {
    const fallback = 'Falha ao validar conta.';
    expect(
      humanizeError('Unexpected error at https://internal.unb.br/foo?bar=1', fallback),
    ).toBe(fallback);
  });

  it('usa fallback para valores vazios ou desconhecidos', () => {
    expect(humanizeError(null, 'Erro customizado')).toBe('Erro customizado');
    expect(humanizeError('', 'Erro customizado')).toBe('Erro customizado');
  });

  it('prioriza timeout sobre connect quando ambos aparecem no erro bruto', () => {
    const raw =
      'error sending request for url (https://sigaa.unb.br): client error (Connect): operation timed out';
    expect(humanizeError(raw)).toBe(
      'Tempo esgotado ao conectar ao servidor. Ele pode estar lento ou instável.',
    );
  });

  it('não classifica horário em texto amigável como stack trace técnico', () => {
    const msg = 'Última tentativa at 10:30:45 falhou temporariamente.';
    expect(humanizeError(msg, 'Fallback')).toBe(msg);
  });
});

describe('isAuthErrorMessage', () => {
  it('identifica erros de autenticação do SIGAA e Aprender 3', () => {
    expect(
      isAuthErrorMessage(
        'Credenciais inválidas ou falha de login no SIGAA. Verifique matrícula e senha.',
      ),
    ).toBe(true);
    expect(
      isAuthErrorMessage('CPF ou senha incorretos no Aprender 3. Verifique seus dados.'),
    ).toBe(true);
    expect(isAuthErrorMessage('Sessão expirada ou não autenticada no Aprender 3.')).toBe(
      true,
    );
  });

  it('retorna false para erros de rede ou servidor', () => {
    expect(
      isAuthErrorMessage(
        'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.',
      ),
    ).toBe(false);
    expect(isAuthErrorMessage(null)).toBe(false);
  });
});
