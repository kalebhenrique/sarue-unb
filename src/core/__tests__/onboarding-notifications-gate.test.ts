import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setOnboardingNotificationsBlocked,
  isOnboardingNotificationsBlocked,
  TauriOSNotifier,
} from '../infrastructure/tauri-os-notifier';
import {
  syncRuMenuNotifications,
  checkDueRuMenuNotification,
} from '../infrastructure/ru-notification.service';

const sendNotificationMock = vi.fn();
const isPermissionGrantedMock = vi.fn(async () => true);

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: vi.fn(async () => 'granted'),
  sendNotification: sendNotificationMock,
  Schedule: { at: vi.fn((d: Date) => ({ at: d })) },
  Importance: { Default: 3 },
  Visibility: { Public: 1 },
}));

describe('Bloqueio de notificações durante o onboarding', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    sendNotificationMock.mockClear();
    isPermissionGrantedMock.mockClear();
    Object.defineProperty(globalThis, 'window', {
      value: { __TAURI_INTERNALS__: {} },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    setOnboardingNotificationsBlocked(false);
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
  });

  it('bloqueia TauriOSNotifier.notify e ensurePermission enquanto onboarding está ativo', async () => {
    setOnboardingNotificationsBlocked(true);
    expect(isOnboardingNotificationsBlocked()).toBe(true);

    const notifier = new TauriOSNotifier();
    expect(await notifier.ensurePermission()).toBe(false);
    await notifier.notify({
      title: 'Sincronização em segundo plano concluída',
      body: 'Teste',
    });

    expect(isPermissionGrantedMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('libera TauriOSNotifier.notify após concluir o onboarding', async () => {
    setOnboardingNotificationsBlocked(false);
    expect(isOnboardingNotificationsBlocked()).toBe(false);

    const notifier = new TauriOSNotifier();
    await notifier.notify({
      title: 'Sincronização concluída',
      body: 'Atualizado',
    });

    expect(isPermissionGrantedMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('bloqueia notificações de cardápio do RU durante o onboarding', async () => {
    setOnboardingNotificationsBlocked(true);

    await syncRuMenuNotifications();
    await checkDueRuMenuNotification();

    expect(isPermissionGrantedMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});
