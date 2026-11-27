import type {
  IOSNotifier,
  OSNotificationPayload,
} from '../domain/interfaces/os-notifier.interface';

let onboardingNotificationsBlocked = false;
const onboardingGateListeners = new Set<(blocked: boolean) => void>();

/** Bloqueia ou libera notificações do SO e do app durante o onboarding. */
export function setOnboardingNotificationsBlocked(blocked: boolean): void {
  const prev = onboardingNotificationsBlocked;
  onboardingNotificationsBlocked = blocked;
  if (prev !== blocked) {
    onboardingGateListeners.forEach((fn) => fn(blocked));
  }
}

/** Assina mudanças no bloqueio de notificações do onboarding. */
export function subscribeOnboardingNotificationsGate(
  listener: (blocked: boolean) => void,
): () => void {
  onboardingGateListeners.add(listener);
  return () => {
    onboardingGateListeners.delete(listener);
  };
}

/** Indica se notificações estão bloqueadas pelo fluxo de onboarding. */
export function isOnboardingNotificationsBlocked(): boolean {
  return onboardingNotificationsBlocked;
}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function isWindowsPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent);
}

const FONT_SIZE_BY_LENGTH: Record<number, number> = {
  1: 18,
  2: 14,
};

/**
 * Gera um ícone de sobreposição circular (badge com número) para a barra de tarefas do Windows.
 * No Windows, a API do sistema é o Taskbar Overlay Icon (ITaskbarList3::SetOverlayIcon).
 */
async function createBadgeOverlayIcon(count: number) {
  if (typeof document === 'undefined') return null;
  try {
    const { Image } = await import('@tauri-apps/api/image');
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);

    // Círculo de fundo vermelho (#E53E3E do design system)
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 1.5;

    ctx.fillStyle = '#E53E3E';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Borda branca para contraste com qualquer tema de barra de tarefas
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    // Texto com o número centralizado
    ctx.fillStyle = '#FFFFFF';
    const text = count > 99 ? '99+' : count.toString();
    const fontSize = FONT_SIZE_BY_LENGTH[text.length] ?? 11;
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centerX, centerY + 0.5);

    const imageData = ctx.getImageData(0, 0, size, size);
    const rgba = new Uint8Array(imageData.data.buffer);
    return await Image.new(rgba, size, size);
  } catch (err) {
    console.warn('Erro ao gerar ícone de sobreposição para Windows:', err);
    return null;
  }
}

/**
 * Adaptador do plugin oficial de notificação do Tauri. A importação é
 * preguiçosa para não quebrar a prévia web (fora do runtime Tauri).
 */
export class TauriOSNotifier implements IOSNotifier {
  private lastBadgeCount: number | null | undefined = Symbol() as unknown as number;

  async ensurePermission(): Promise<boolean> {
    if (!isTauriEnvironment() || onboardingNotificationsBlocked) return false;
    try {
      const { isPermissionGranted, requestPermission } = await import(
        '@tauri-apps/plugin-notification'
      );
      if (await isPermissionGranted()) return true;
      return (await requestPermission()) === 'granted';
    } catch (e) {
      console.warn('Não foi possível verificar permissão de notificação:', e);
      return false;
    }
  }

  async notify(payload: OSNotificationPayload): Promise<void> {
    if (!isTauriEnvironment() || onboardingNotificationsBlocked) return;
    try {
      const { isPermissionGranted, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      );
      if (await isPermissionGranted()) {
        await sendNotification(payload);
      }
    } catch (e) {
      console.warn('Falha ao enviar notificação do sistema:', e);
    }
  }

  async setBadgeCount(count?: number | null): Promise<void> {
    if (!isTauriEnvironment()) return;
    const normalized = typeof count === 'number' && count > 0 ? count : 0;
    if (this.lastBadgeCount === normalized) return;

    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (!win) return;

      if (isWindowsPlatform()) {
        // Windows: utiliza Taskbar Overlay Icon (ITaskbarList3)
        try {
          if (normalized === 0) {
            await win.setOverlayIcon(undefined);
          } else {
            const overlay = await createBadgeOverlayIcon(normalized);
            await win.setOverlayIcon(overlay ?? undefined);
          }
        } catch (e) {
          console.warn('Falha ao definir overlay icon no Windows:', e);
        }
      } else {
        // macOS (Dock tile) e Linux (Unity/D-Bus launcher)
        try {
          await win.setBadgeCount(normalized > 0 ? normalized : undefined);
        } catch (e) {
          console.warn('Falha ao definir badge count no macOS/Linux:', e);
        }
      }

      this.lastBadgeCount = normalized;
    } catch (e) {
      console.warn('Falha ao definir badge count do aplicativo:', e);
    }
  }
}

/** No-op para prévia web e testes. */
export class NullNotifier implements IOSNotifier {
  async ensurePermission(): Promise<boolean> {
    return false;
  }

  async notify(): Promise<void> {
    // Sem SO, sem notificação.
  }

  async setBadgeCount(): Promise<void> {
    // Sem SO, sem badge.
  }
}
