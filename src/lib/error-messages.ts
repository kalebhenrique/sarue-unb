/**
 * Camada defensiva de normalização de erros para exibição na interface.
 * Garante que mensagens técnicas (reqwest, DNS, TLS, URLs longas, fetch,
 * stack traces ou erros de plugins Tauri) sejam convertidas em texto curto
 * e legível em português.
 */

const DEFAULT_FALLBACK = 'Não foi possível concluir a operação. Tente novamente em alguns instantes.';
const MAX_DISPLAY_LENGTH = 220;

const TECHNICAL_PATTERNS: Array<{ test: RegExp; message: string }> = [
  {
    test: /timed?\s*out|deadline has elapsed|timeout/i,
    message: 'Tempo esgotado ao conectar ao servidor. Ele pode estar lento ou instável.',
  },
  {
    test: /dns error|failed to lookup|nodename nor servname|name or service not known|enotfound|eai_again|network\s*request\s*failed|failed to fetch|load failed|networkerror|offline|internet connection appears to be offline|client error \(connect\)|connection refused|connection reset|econnrefused|econnreset|broken pipe/i,
    message: 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.',
  },
  {
    test: /\b(?:certificate|tls|ssl|handshake|rustls|webpki)\b/i,
    message: 'Erro de conexão segura (SSL/TLS) com o servidor. Verifique a data/hora do dispositivo ou a rede.',
  },
  {
    test: /http\s*(50[0-9]|5\d\d)|status\s*(code\s*)?(50[0-9]|5\d\d)|service unavailable|bad gateway|gateway timeout/i,
    message: 'O servidor está temporariamente indisponível. Tente novamente mais tarde.',
  },
  {
    test: /too many requests|http\s*429|status\s*(code\s*)?429/i,
    message: 'Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.',
  },
  {
    test: /token 'lt'|campo 'execution'|logintoken/i,
    message: 'O portal está instável ou em manutenção no momento. Tente novamente em alguns instantes.',
  },
  {
    test: /error decoding response body|unexpected end of|eof while parsing|invalid json|syntaxerror.*json/i,
    message: 'Resposta incompleta do servidor. Tente novamente em alguns instantes.',
  },
  {
    test: /error sending request for url|reqwest::|hyper::|os error \d+|tauri_plugin|ipc error/i,
    message: 'Erro de comunicação com o servidor. Verifique sua conexão e tente novamente.',
  },
];

const RAW_TECHNICAL_INDICATOR =
  /https?:\/\/\S+|error sending request|client error\s*\(|dns error|os error \d+|reqwest::|hyper::|serde_json|panicked at|stack backtrace|\bat\s+\S+\.(?:[jt]sx?|mjs|cjs|rs):\d+:\d+/i;

const AUTH_ERROR_PATTERN =
  /credenciais inv[áa]lidas|matr[íi]cula ou senha|cpf ou senha|senha incorret|usu[áa]rio ou senha|n[ãa]o autenticada|sess[ãa]o expirada/i;

function extractRawMessage(error: unknown): string {
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string') return msg.trim();
  }
  return '';
}

/**
 * Converte qualquer erro (Error, string IPC do Rust, objeto desconhecido)
 * em uma mensagem amigável e segura para exibição na UI.
 */
export function humanizeError(
  error: unknown,
  fallback: string = DEFAULT_FALLBACK,
): string {
  const raw = extractRawMessage(error);
  if (!raw) return fallback;

  for (const { test, message } of TECHNICAL_PATTERNS) {
    if (test.test(raw)) {
      return message;
    }
  }

  // Se ainda contiver URLs cruas ou vestígios de erro interno, cai no fallback limpo
  if (RAW_TECHNICAL_INDICATOR.test(raw)) {
    return fallback;
  }

  const singleLine = raw.replace(/\s+/g, ' ').trim();
  if (singleLine.length > MAX_DISPLAY_LENGTH) {
    return `${singleLine.slice(0, MAX_DISPLAY_LENGTH - 1).trimEnd()}…`;
  }

  return singleLine;
}

/**
 * Indica se a mensagem de erro aponta para falha de autenticação/credenciais
 * (útil para orientar o usuário a revisar matrícula/CPF e senha).
 */
export function isAuthErrorMessage(message: string | undefined | null): boolean {
  if (!message) return false;
  return AUTH_ERROR_PATTERN.test(message);
}
