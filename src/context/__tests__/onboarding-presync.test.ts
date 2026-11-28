import { describe, expect, it } from "vitest";
import { createOnboardingPreSyncMachine } from "../SyncContext";

describe("createOnboardingPreSyncMachine", () => {
  it("anexa Aprender 3 em paralelo sem cancelar o SIGAA em andamento e só finaliza quando ambos terminam", () => {
    const machine = createOnboardingPreSyncMachine();

    const sigaa = machine.beginSigaa();
    expect(sigaa.isCancelled()).toBe(false);
    expect(machine.isAnyInFlight()).toBe(true);

    // Conecta Aprender 3 enquanto SIGAA ainda está rodando
    const aprender = machine.beginAprender3();
    expect(sigaa.isCancelled()).toBe(false);
    expect(aprender.isCancelled()).toBe(false);
    expect(aprender.mainGen).toBe(sigaa.mainGen);

    // SIGAA termina primeiro: ainda não pode finalizar pois Aprender 3 segue rodando
    expect(machine.finishSigaa(sigaa.mainGen)).toBe(false);
    expect(machine.isAnyInFlight()).toBe(true);

    // Aprender 3 termina depois: agora pode finalizar
    expect(machine.finishAprender3(aprender.mainGen, aprender.isCancelled)).toBe(
      true,
    );
    expect(machine.isAnyInFlight()).toBe(false);
  });

  it("permite conectar Aprender 3 depois que o SIGAA já terminou sem invalidar a sessão", () => {
    const machine = createOnboardingPreSyncMachine();

    const sigaa = machine.beginSigaa();
    sigaa.session.sigaaSuccess = true;
    expect(machine.finishSigaa(sigaa.mainGen)).toBe(true);
    expect(machine.isAnyInFlight()).toBe(false);
    // Sessão continua viva durante o onboarding
    expect(machine.getSession()?.sigaaStarted).toBe(true);

    const aprender = machine.beginAprender3();
    expect(aprender.isCancelled()).toBe(false);
    expect(aprender.mainGen).toBe(sigaa.mainGen);
    expect(machine.isAnyInFlight()).toBe(true);

    aprender.session.aprenderSuccess = true;
    expect(machine.finishAprender3(aprender.mainGen, aprender.isCancelled)).toBe(
      true,
    );
    expect(machine.getSession()?.sigaaSuccess).toBe(true);
    expect(machine.getSession()?.aprenderSuccess).toBe(true);
  });

  it("cancelar apenas o Aprender 3 não interrompe o SIGAA em andamento", () => {
    const machine = createOnboardingPreSyncMachine();

    const sigaa = machine.beginSigaa();
    const aprender = machine.beginAprender3();

    const cancelResult = machine.cancelAprender3();
    expect(cancelResult.shouldFinalize).toBe(false);
    expect(aprender.isCancelled()).toBe(true);
    expect(sigaa.isCancelled()).toBe(false);
    expect(machine.isSigaaInFlight()).toBe(true);

    // Retorno tardio do Aprender 3 cancelado é ignorado
    expect(machine.finishAprender3(aprender.mainGen, aprender.isCancelled)).toBe(
      false,
    );
    // SIGAA conclui normalmente e dispara finalização
    expect(machine.finishSigaa(sigaa.mainGen)).toBe(true);
  });

  it("cancelar Aprender 3 quando SIGAA já terminou sinaliza finalização imediata", () => {
    const machine = createOnboardingPreSyncMachine();

    const sigaa = machine.beginSigaa();
    expect(machine.finishSigaa(sigaa.mainGen)).toBe(true);

    const aprender = machine.beginAprender3();
    const cancelResult = machine.cancelAprender3();

    expect(aprender.isCancelled()).toBe(true);
    expect(cancelResult.shouldFinalize).toBe(true);
    expect(cancelResult.mainGen).toBe(sigaa.mainGen);
    expect(machine.isAnyInFlight()).toBe(false);
  });

  it("cancelAll aborta SIGAA e Aprender 3 simultaneamente e limpa a sessão", () => {
    const machine = createOnboardingPreSyncMachine();

    const sigaa = machine.beginSigaa();
    const aprender = machine.beginAprender3();

    machine.cancelAll();

    expect(sigaa.isCancelled()).toBe(true);
    expect(aprender.isCancelled()).toBe(true);
    expect(machine.isAnyInFlight()).toBe(false);
    expect(machine.getSession()).toBeNull();
    expect(machine.finishSigaa(sigaa.mainGen)).toBe(false);
    expect(machine.finishAprender3(aprender.mainGen, aprender.isCancelled)).toBe(
      false,
    );
  });

  it("completeOnboarding não dispara fallback syncAll se o pré-sync já rodou e limpa sessão ociosa", () => {
    const machine = createOnboardingPreSyncMachine();

    const sigaa = machine.beginSigaa();
    // Ainda em andamento: não dispara fallback e mantém sessão até finalizar
    expect(machine.completeOnboarding()).toEqual({
      shouldFallbackSyncAll: false,
    });
    expect(machine.getSession()).not.toBeNull();

    // Após concluir, nova chamada limpa sessão ociosa sem fallback
    expect(machine.finishSigaa(sigaa.mainGen)).toBe(true);
    expect(machine.completeOnboarding()).toEqual({
      shouldFallbackSyncAll: false,
    });
    expect(machine.getSession()).toBeNull();
  });

  it("completeOnboarding dispara fallback syncAll quando nenhuma pré-sincronização rodou (ex.: modo demo)", () => {
    const machine = createOnboardingPreSyncMachine();

    expect(machine.completeOnboarding()).toEqual({
      shouldFallbackSyncAll: true,
    });
  });
});
