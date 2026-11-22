import { describe, expect, it } from "vitest";
import {
  PERIODIC_SYNC_INTERVAL_MS,
  shouldTriggerPeriodicSync,
} from "../SyncContext";

describe("shouldTriggerPeriodicSync", () => {
  const now = new Date("2026-11-22T12:00:00.000Z").getTime();

  it("bloqueia quando execução em segundo plano está desativada", () => {
    expect(shouldTriggerPeriodicSync(null, now, false)).toBe(false);
    expect(
      shouldTriggerPeriodicSync("2026-11-21T00:00:00.000Z", now, false),
    ).toBe(false);
  });

  it("bloqueia quando o último sync ocorreu há menos de 6 horas", () => {
    const oneMinuteAgo = new Date(now - 60_000).toISOString();
    const almostSixHoursAgo = new Date(
      now - PERIODIC_SYNC_INTERVAL_MS + 1000,
    ).toISOString();

    expect(shouldTriggerPeriodicSync(oneMinuteAgo, now, true)).toBe(false);
    expect(shouldTriggerPeriodicSync(almostSixHoursAgo, now, true)).toBe(false);
  });

  it("libera quando passaram exatamente 6 horas ou mais desde o último sync", () => {
    const exactlySixHoursAgo = new Date(
      now - PERIODIC_SYNC_INTERVAL_MS,
    ).toISOString();
    const twelveHoursAgo = new Date(
      now - PERIODIC_SYNC_INTERVAL_MS * 2,
    ).toISOString();

    expect(shouldTriggerPeriodicSync(exactlySixHoursAgo, now, true)).toBe(true);
    expect(shouldTriggerPeriodicSync(twelveHoursAgo, now, true)).toBe(true);
  });

  it("libera quando ainda não existe registro de último sync ou a data é inválida", () => {
    expect(shouldTriggerPeriodicSync(null, now, true)).toBe(true);
    expect(shouldTriggerPeriodicSync("invalid-date", now, true)).toBe(true);
  });
});
