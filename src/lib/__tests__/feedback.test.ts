import { afterEach, describe, expect, it, vi } from "vitest";
import { detectOs } from "../feedback";

describe("detectOs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("identifica Android antes de Linux mesmo quando o UA contém Linux", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    });
    expect(detectOs()).toBe("Android");
  });

  it("identifica iOS antes de macOS mesmo quando o UA contém like Mac OS X", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    });
    expect(detectOs()).toBe("iOS");
  });

  it("identifica macOS, Windows, Linux e fallback desconhecido", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    });
    expect(detectOs()).toBe("macOS");

    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    expect(detectOs()).toBe("Windows");

    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    });
    expect(detectOs()).toBe("Linux");

    vi.stubGlobal("navigator", { userAgent: "CustomAgent/1.0" });
    expect(detectOs()).toBe("Desconhecido");
  });

  it("retorna Desconhecido quando navigator não está disponível", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectOs()).toBe("Desconhecido");
  });
});
