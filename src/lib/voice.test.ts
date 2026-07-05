import { describe, expect, it } from "vitest";
import {
  WAVEFORM_BARS,
  audioExtension,
  downsamplePeaks,
  formatSeconds,
  normalizeAudioMime,
  parseWaveform,
  serializeWaveform,
} from "./voice";

describe("normalizeAudioMime", () => {
  it("strips codecs and lowercases", () => {
    expect(normalizeAudioMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeAudioMime("Audio/MP4; codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(normalizeAudioMime("audio/ogg")).toBe("audio/ogg");
  });
});

describe("audioExtension", () => {
  it("maps known types", () => {
    expect(audioExtension("audio/webm;codecs=opus")).toBe(".webm");
    expect(audioExtension("audio/mp4")).toBe(".m4a");
    expect(audioExtension("audio/mpeg")).toBe(".mp3");
  });
  it("falls back to .webm", () => {
    expect(audioExtension("audio/whatever")).toBe(".webm");
  });
});

describe("downsamplePeaks", () => {
  it("returns exactly WAVEFORM_BARS values", () => {
    expect(downsamplePeaks([0.5])).toHaveLength(WAVEFORM_BARS);
    expect(downsamplePeaks(Array(1000).fill(0.2))).toHaveLength(WAVEFORM_BARS);
  });
  it("keeps bucket maxima and clamps to 0..1", () => {
    const peaks = Array(WAVEFORM_BARS * 10).fill(0.1);
    peaks[5] = 9; // spike, clamped
    const out = downsamplePeaks(peaks);
    expect(out[0]).toBe(1);
    expect(out[1]).toBeCloseTo(0.1);
  });
  it("handles empty input", () => {
    expect(downsamplePeaks([])).toEqual(Array(WAVEFORM_BARS).fill(0));
  });
});

describe("serializeWaveform / parseWaveform", () => {
  it("round-trips", () => {
    const json = serializeWaveform([0, 0.25, 0.5, 0.75, 1]);
    const parsed = parseWaveform(json);
    expect(parsed).toHaveLength(WAVEFORM_BARS);
    expect(Math.max(...parsed)).toBe(1);
    expect(Math.min(...parsed)).toBe(0);
  });
  it("clamps out-of-range ints on parse", () => {
    expect(Math.max(...parseWaveform("[500, -3, 50]"))).toBe(1);
    expect(Math.min(...parseWaveform("[500, -3, 50]"))).toBe(0);
  });
  it.each(["not json", "{}", "[]", null, undefined, JSON.stringify(Array(500).fill(1))])(
    "falls back on malformed input %#",
    (bad) => {
      const out = parseWaveform(bad as never);
      expect(out).toHaveLength(WAVEFORM_BARS);
      expect(out.every((v) => v === 0.3)).toBe(true);
    }
  );
});

describe("formatSeconds", () => {
  it("formats m:ss", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(7.9)).toBe("0:07");
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(120)).toBe("2:00");
    expect(formatSeconds(-5)).toBe("0:00");
  });
});
