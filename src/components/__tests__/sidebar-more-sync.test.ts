import { describe, expect, it } from "vitest";
import { shouldSpinMoreContinuously } from "../Sidebar";

describe("shouldSpinMoreContinuously", () => {
  it("mantém o spinner contínuo durante o primeiro scraping pós-onboarding", () => {
    expect(shouldSpinMoreContinuously(true, true, null)).toBe(true);
    expect(
      shouldSpinMoreContinuously(true, true, "2026-11-27T20:00:00.000Z"),
    ).toBe(true);
  });

  it("mantém o spinner contínuo quando ainda não há lastSyncedAt (primeira conexão fora do onboarding)", () => {
    expect(shouldSpinMoreContinuously(true, false, null)).toBe(true);
    expect(shouldSpinMoreContinuously(true, false, undefined)).toBe(true);
  });

  it("desativa o spinner contínuo nos scrapings subsequentes (usa animação fixa de 2s)", () => {
    expect(
      shouldSpinMoreContinuously(true, false, "2026-11-27T20:00:00.000Z"),
    ).toBe(false);
  });

  it("desativa o spinner contínuo assim que o scraping termina", () => {
    expect(shouldSpinMoreContinuously(false, true, null)).toBe(false);
    expect(shouldSpinMoreContinuously(false, false, null)).toBe(false);
    expect(
      shouldSpinMoreContinuously(false, false, "2026-11-27T20:00:00.000Z"),
    ).toBe(false);
  });
});
