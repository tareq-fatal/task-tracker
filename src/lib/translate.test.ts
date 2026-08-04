import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  libreTranslate,
  translateText,
  translationConfigured,
  checkTranslateRateLimit,
  _resetTranslateRateLimit,
  MAX_PER_WINDOW,
  TranslateError,
} from "./translate";

describe("translationConfigured — LibreTranslate only (SECURITY)", () => {
  afterEach(() => {
    delete process.env.DEEPL_API_KEY;
    delete process.env.LIBRETRANSLATE_URL;
  });

  it("is off without LibreTranslate", () => {
    expect(translationConfigured()).toBe(false);
  });

  it("a DeepL key alone does NOT enable the feature — external APIs are banned", () => {
    process.env.DEEPL_API_KEY = "abc:fx";
    expect(translationConfigured()).toBe(false);
  });

  it("is on with a LibreTranslate URL", () => {
    process.env.LIBRETRANSLATE_URL = "http://libretranslate:5000";
    expect(translationConfigured()).toBe(true);
  });
});

describe("libreTranslate + dispatcher", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEEPL_API_KEY;
    delete process.env.LIBRETRANSLATE_URL;
  });

  it("POSTs JSON with auto-detect and returns the detected source", async () => {
    process.env.LIBRETRANSLATE_URL = "http://libretranslate:5000/";
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ translatedText: "Görevi tamamladım", detectedLanguage: { language: "AR" } }),
        { status: 200 }
      )
    );
    const r = await libreTranslate("أنجزت المهمة", "tr");
    expect(r).toEqual({ text: "Görevi tamamladım", detectedSource: "ar" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://libretranslate:5000/translate"); // trailing slash normalized
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ q: "أنجزت المهمة", source: "auto", target: "tr", format: "text" });
  });

  it("passes a known source through instead of auto", async () => {
    process.env.LIBRETRANSLATE_URL = "http://lt:5000";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ translatedText: "x" }), { status: 200 })
    );
    const r = await libreTranslate("Hallo", "en", "de");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).source).toBe("de");
    expect(r.detectedSource).toBe("de"); // falls back to the given source
  });

  it("maps 429 to rate_limited, 5xx and bad payloads to upstream", async () => {
    process.env.LIBRETRANSLATE_URL = "http://lt:5000";
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    await expect(libreTranslate("x", "de")).rejects.toThrow("rate_limited");
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    await expect(libreTranslate("x", "de")).rejects.toThrow("upstream");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(libreTranslate("x", "de")).rejects.toThrow(TranslateError);
  });

  it("dispatcher NEVER calls an external API — a DeepL key is dead config", async () => {
    process.env.DEEPL_API_KEY = "k:fx";
    await expect(translateText("x", "de")).rejects.toThrow("not_configured");

    process.env.LIBRETRANSLATE_URL = "http://lt:5000";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ translatedText: "y" }), { status: 200 })
    );
    await translateText("x", "de");
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain("http://lt:5000"); // only the local host
    }
  });
});

describe("checkTranslateRateLimit", () => {
  beforeEach(() => _resetTranslateRateLimit());

  it("allows MAX_PER_WINDOW per user and window, isolated per user", () => {
    const now = 1_000_000;
    for (let i = 0; i < MAX_PER_WINDOW; i++) {
      expect(checkTranslateRateLimit("u1", now + i)).toBe(true);
    }
    expect(checkTranslateRateLimit("u1", now + 50)).toBe(false);
    expect(checkTranslateRateLimit("u2", now + 50)).toBe(true); // other user unaffected
    expect(checkTranslateRateLimit("u1", now + 61_000)).toBe(true); // window slides
  });
});
