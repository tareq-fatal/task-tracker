import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deeplTranslate,
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
  });

  it("is off without a key (feature fully disabled per the order)", () => {
    delete process.env.DEEPL_API_KEY;
    expect(translationConfigured()).toBe(false);
  });

  it("is on with a key", () => {
    process.env.DEEPL_API_KEY = "abc:fx";
    expect(translationConfigured()).toBe(true);
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
