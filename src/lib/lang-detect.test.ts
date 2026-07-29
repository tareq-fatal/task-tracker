import { describe, expect, it } from "vitest";
import { detectCommentLanguage } from "./lang-detect";

describe("detectCommentLanguage", () => {
  it("detects Arabic script", () => {
    expect(detectCommentLanguage("أنجزت المهمة والحمد لله")).toBe("ar");
    expect(detectCommentLanguage("تم ✅")).toBe("ar");
  });

  it("detects Turkish via unique characters", () => {
    expect(detectCommentLanguage("Görevi tamamladım")).toBe("tr");
    expect(detectCommentLanguage("Yarın başlıyoruz")).toBe("tr");
  });

  it("detects Turkish via stopwords when no special chars appear", () => {
    expect(detectCommentLanguage("bu bir test ve tamam")).toBe("tr");
  });

  it("detects German via ß and stopwords", () => {
    expect(detectCommentLanguage("Das ist noch nicht fertig")).toBe("de");
    expect(detectCommentLanguage("Ich muß das prüfen")).toBe("de");
  });

  it("detects English via stopwords", () => {
    expect(detectCommentLanguage("This task is not done yet, please check")).toBe("en");
  });

  it("returns null when unsure (caller falls back to author locale)", () => {
    expect(detectCommentLanguage("ok")).toBeNull();
    expect(detectCommentLanguage("👍")).toBeNull();
    expect(detectCommentLanguage("123 456")).toBeNull();
    expect(detectCommentLanguage("")).toBeNull();
  });
});
