import { getVersion } from "@tauri-apps/api/app";

/** Tipo de feedback escolhido pelo usuário no popup. */
export type FeedbackKind = "bug" | "feedback";

/** Dados de dispositivo opt-in — nada além destes campos é coletado. */
export interface FeedbackDeviceData {
  sistema: string;
  versaoApp: string;
  tela: string;
}

/**
 * Endpoint do envio de feedback: função no site do Saruê (Vercel)
 * que cria a issue no repositório via API do GitHub. O app nunca vê token.
 */
export const FEEDBACK_ENDPOINT =
  "https://www.sarue.app.br/api/feedback";

/**
 * Segredo compartilhado com o endpoint (header `x-feedback-key`).
 * Rotacionar aqui e em FEEDBACK_SECRET (env do sarue-unb-site) juntos.
 */
export const FEEDBACK_SECRET = "04cd58d2d2b2f03bd9d1d2dd099db77640c21cdaaf30d202";

/** Erro de envio com mensagem pronta para exibir ao usuário. */
export class FeedbackError extends Error {
  userMessage: string;

  constructor(userMessage: string, status?: number) {
    super(userMessage);
    this.name = "FeedbackError";
    this.userMessage = userMessage;
    this.status = status;
  }

  status?: number;
}

/** Sistema operacional a partir do user agent (sem plugin nativo). */
export function detectOs(): string {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "macOS";
  if (/Win/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Desconhecido";
}

/** Versão do app (Tauri); fora do Tauri (dev no browser), "dev". */
export async function getAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "dev";
  }
}

export interface SubmitFeedbackInput {
  kind: FeedbackKind;
  description: string;
  /** Data URL JPEG do print da tela (opt-in); vai como base64 no corpo. */
  printDataUrl?: string | null;
  device?: FeedbackDeviceData;
}

export interface SubmitFeedbackResult {
  issueUrl: string;
  issueNumber: number;
}

/** Envia o feedback ao endpoint do site; resolve com a issue criada. */
export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  let res: Response;
  try {
    res = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-feedback-key": FEEDBACK_SECRET,
      },
      body: JSON.stringify({
        kind: input.kind,
        description: input.description,
        print: input.printDataUrl
          ? input.printDataUrl.split(",")[1] ?? null
          : null,
        device: input.device ?? null,
      }),
    });
  } catch (err) {
    console.error("Falha ao conectar com o endpoint de feedback:", err);
    throw new FeedbackError(
      "Não foi possível conectar. Verifique sua internet e tente de novo.",
    );
  }

  if (res.ok) {
    const data = (await res.json()) as SubmitFeedbackResult;
    if (!data?.issueUrl) {
      throw new FeedbackError(
        "O servidor respondeu algo inesperado. Tente de novo.",
      );
    }
    return data;
  }

  const serverMessage = await res
    .json()
    .then((body: { error?: string }) => body?.error)
    .catch(() => null);

  if (res.status === 429) {
    throw new FeedbackError(
      serverMessage ??
        "Muitos envios seguidos. Tente de novo em alguns minutos.",
      res.status,
    );
  }
  if (res.status === 413) {
    throw new FeedbackError(
      "O print ficou grande demais para enviar. Remova o print e tente de novo.",
      res.status,
    );
  }
  throw new FeedbackError(
    serverMessage ?? "Não deu para enviar agora. Tente de novo em instantes.",
    res.status,
  );
}
