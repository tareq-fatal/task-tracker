// Voice-note helpers shared by the recorder (client), player (client) and the
// upload server action. Pure functions — unit-tested in voice.test.ts.

/** Bars stored per note; enough for a smooth waveform, tiny in the DB. */
export const WAVEFORM_BARS = 48;

/** "audio/webm;codecs=opus" → "audio/webm" (MediaRecorder reports codecs). */
export function normalizeAudioMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/** MIME → file extension for the stored upload. */
export function audioExtension(mime: string): string {
  const map: Record<string, string> = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/aac": ".aac",
    "audio/x-m4a": ".m4a",
  };
  return map[normalizeAudioMime(mime)] ?? ".webm";
}

/**
 * Reduce raw recording peaks (one per animation frame / sample tick) to a fixed
 * number of bars, each the max of its bucket. Values are clamped to 0..1.
 */
export function downsamplePeaks(peaks: number[], bars = WAVEFORM_BARS): number[] {
  if (peaks.length === 0) return Array(bars).fill(0);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * peaks.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / bars));
    let max = 0;
    for (let j = start; j < end; j++) max = Math.max(max, peaks[j]);
    out.push(Math.min(1, Math.max(0, max)));
  }
  return out;
}

/** 0..1 peaks → compact JSON int array (0-100) for the DB. */
export function serializeWaveform(peaks: number[]): string {
  return JSON.stringify(downsamplePeaks(peaks).map((p) => Math.round(p * 100)));
}

/**
 * Parse a stored/submitted waveform. Returns 0..1 floats, or a flat fallback
 * when the input is malformed — a broken waveform must never break playback.
 */
export function parseWaveform(json: string | null | undefined): number[] {
  try {
    const arr = JSON.parse(json ?? "");
    if (!Array.isArray(arr) || arr.length === 0 || arr.length > 400) throw new Error();
    return arr
      .slice(0, WAVEFORM_BARS)
      .map((v) => (typeof v === "number" && isFinite(v) ? Math.min(100, Math.max(0, v)) / 100 : 0));
  } catch {
    return Array(WAVEFORM_BARS).fill(0.3);
  }
}

/** 83.4 → "1:23" (used by recorder timer and player). */
export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
