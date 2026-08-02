import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deeplTranslate,
  libreTranslate,
  translateText,
  translationConfigured,
  checkTranslateRateLimit,
  _resetTranslateRateLimit,
  MAX_PER_WINDOW,
  TranslateError,
} from "./translate";

const okResponse = (text: string, detected = "TR") =>
  new Response(
    JSON.stringify({ translations: [{ text, detected_source_language: detected }] }),
    { status: 200 }
  );

describe("translationConfigured", () => {
  afterEach(() => {
    delete process.env.DEEPL_API_KEY;
    delete process.env.LIBRETRANSLATE_URL;
  });

  it("is off without any provider (feature fully disabled per the order)", () => {
    expect(translationConfigured()).toBe(false);
  });

  it("is on with a DeepL key or a LibreTranslate URL", () => {
    process.env.DEEPL_API_KEY = "abc:fx";
    expect(translationConfigured()).toBe(true);
    delete process.env.DEEPL_API_KEY;
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

  it("dispatcher prefers DeepL, falls back to LibreTranslate, else not_configured", async () => {
    await expect(translateText("x", "de")).rejects.toThrow("not_configured");

    process.env.LIBRETRANSLATE_URL = "http://lt:5000";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ translatedText: "y" }), { status: 200 })
    );
    await translateText("x", "de");
    expect(fetchMock.mock.calls[0][0]).toBe("http://lt:5000/translate");

    fetchMock.mockClear();
    process.env.DEEPL_API_KEY = "k:fx";
    fetchMock.mockResolvedValue(okResponse("z"));
    await translateText("x", "de");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api-free.deepl.com/v2/translate");
  });

  // Qualitäts-Auftrag 2026-08-02: DeepL-Quota (456) darf die Übersetzung nicht
  // mehr komplett lahmlegen — LibreTranslate springt in der auto-Kette ein.
  it("auto: DeepL quota/upstream failure falls back to LibreTranslate", async () => {
    process.env.DEEPL_API_KEY = "k:fx";
    process.env.LIBRETRANSLATE_URL = "http://lt:5000";
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 456 })) // DeepL quota drained
      .mockResolvedValueOnce(new Response(JSON.stringify({ translatedText: "fallback" }), { status: 200 }));
    const r = await translateText("x", "tr");
    expect(r.text).toBe("fallback");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api-free.deepl.com/v2/translate");
    expect(fetchMock.mock.calls[1][0]).toBe("http://lt:5000/translate");
  });

  it("pinned engine 'libre' skips DeepL even when a key is set", async () => {
    process.env.DEEPL_API_KEY = "k:fx";
    process.env.LIBRETRANSLATE_URL = "http://lt:5000";
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ translatedText: "l" }), { status: 200 }));
    await translateText("x", "tr", null, "libre");
    expect(fetchMock.mock.calls[0][0]).toBe("http://lt:5000/translate");
  });

  it("pinned engine 'deepl' without a key is not_configured (no silent fallback)", async () => {
    process.env.LIBRETRANSLATE_URL = "http://lt:5000";
    await expect(translateText("x", "tr", null, "deepl")).rejects.toThrow("not_configured");
  });
});

describe("deeplTranslate", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEEPL_API_KEY;
  });

  it("throws not_configured without a key", async () => {
    await expect(deeplTranslate("hi", "ar")).rejects.toThrow("not_configured");
  });

  it("uses the free host for :fx keys and sends form-encoded body", async () => {
    process.env.DEEPL_API_KEY = "secret:fx";
    fetchMock.mockResolvedValue(okResponse("أنجزت المهمة"));
    const r = await deeplTranslate("Görevi tamamladım", "ar", "tr");
    expect(r).toEqual({ text: "أنجزت المهمة", detectedSource: "tr" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-free.deepl.com/v2/translate");
    expect(init.headers.Authorization).toBe("DeepL-Auth-Key secret:fx");
    const body = new URLSearchParams(init.body);
    expect(body.get("target_lang")).toBe("AR");
    expect(body.get("source_lang")).toBe("TR");
    expect(body.get("text")).toBe("Görevi tamamladım");
  });

  it("uses the paid host for normal keys and EN-US as English target", async () => {
    process.env.DEEPL_API_KEY = "secret";
    fetchMock.mockResolvedValue(okResponse("Done", "AR"));
    await deeplTranslate("تم", "en");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepl.com/v2/translate");
    const body = new URLSearchParams(init.body);
    expect(body.get("target_lang")).toBe("EN-US");
    expect(body.get("source_lang")).toBeNull(); // auto-detect when unsure
  });

  it("maps 429/456 to rate_limited and 5xx to upstream", async () => {
    process.env.DEEPL_API_KEY = "k";
    fetchMock.mockResolvedValue(new Response("", { status: 456 }));
    await expect(deeplTranslate("x", "de")).rejects.toThrow("rate_limited");
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    await expect(deeplTranslate("x", "de")).rejects.toThrow("upstream");
  });

  it("throws upstream on an empty/garbled payload", async () => {
    process.env.DEEPL_API_KEY = "k";
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(deeplTranslate("x", "de")).rejects.toThrow(TranslateError);
  });
});

describe("checkTranslateRateLimit", () => {
  beforeEach(() => _resetTranslateRateLimit());

  it("allows exactly MAX_PER_WINDOW requests per minute per user", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_PER_WINDOW; i++) {
      expect(checkTranslateRateLimit("u1", t0 + i)).toBe(true);
    }
    expect(checkTranslateRateLimit("u1", t0 + 100)).toBe(false);
    // a different user is unaffected
    expect(checkTranslateRateLimit("u2", t0 + 100)).toBe(true);
    // window slides: after 60s the first slots free up
    expect(checkTranslateRateLimit("u1", t0 + 61_000)).toBe(true);
  });
});
