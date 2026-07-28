"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Mic, Send, Square, Trash2 } from "lucide-react";
import { MAX_VOICE_SECONDS } from "@/lib/validation";
import { audioExtension, downsamplePeaks, formatSeconds, serializeWaveform } from "@/lib/voice";
import { VoiceNotePlayer } from "@/components/voice-note-player";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

type Preview = {
  blob: Blob;
  url: string;
  mimeType: string;
  durationSec: number;
  peaks: number[]; // 0..1, downsampled
};

const RECORDER_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

/**
 * Inline voice-note recorder (MediaRecorder, max 2 min). Mic button →
 * recording with live waveform + countdown → preview (player) → send.
 * `action` is a bound server action receiving the FormData (file,
 * durationSec, waveform) — addVoiceNoteAction or addVoiceCommentAction.
 */
export function VoiceRecorder({
  action,
  label,
}: {
  action: (formData: FormData) => Promise<{ error?: string }>;
  label?: string;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<"idle" | "recording" | "preview">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval>>();
  const chunksRef = useRef<Blob[]>([]);
  const peaksRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);

  const ERRORS: Record<string, string> = {
    NO_FILE: t("voice.uploadFailed"),
    BAD_TYPE: t("voice.uploadFailed"),
    TOO_LARGE: t("voice.tooLarge"),
    TOO_LONG: t("voice.tooLong"),
  };

  useEffect(() => () => cleanup(), []); // stop mic/ctx when unmounting mid-recording

  function cleanup() {
    cancelAnimationFrame(rafRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recorderRef.current = null;
  }

  async function start() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(t("voice.unsupported"));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t("voice.micDenied"));
      return;
    }
    streamRef.current = stream;

    const mimeType = RECORDER_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];
    peaksRef.current = [];
    startedAtRef.current = Date.now();

    // Live waveform: sample the mic through an AnalyserNode; every frame keeps
    // the peak amplitude — drawn scrolling on the canvas and kept for the
    // stored waveform.
    const AudioCtx = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    const draw = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
      peaksRef.current.push(peak);
      const canvas = canvasRef.current;
      const c2d = canvas?.getContext("2d");
      if (canvas && c2d) {
        const { width, height } = canvas;
        c2d.clearRect(0, 0, width, height);
        c2d.fillStyle = "hsl(0 72% 51%)";
        const bars = 48;
        const recent = peaksRef.current.slice(-bars);
        const barW = width / bars;
        recent.forEach((p, i) => {
          const h = Math.max(2, p * height);
          c2d.fillRect(i * barW + 1, (height - h) / 2, barW - 2, h);
        });
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const durationSec = Math.min(MAX_VOICE_SECONDS, (Date.now() - startedAtRef.current) / 1000);
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const peaks = downsamplePeaks(peaksRef.current);
      cleanup();
      if (durationSec < 0.5 || blob.size === 0) {
        setMode("idle");
        setElapsed(0);
        return;
      }
      setPreview({ blob, url: URL.createObjectURL(blob), mimeType: type, durationSec, peaks });
      setMode("preview");
    };

    recorder.start(1000); // 1s chunks — nothing is lost if the tab dies
    setElapsed(0);
    setMode("recording");
    tickRef.current = setInterval(() => {
      const sec = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(sec);
      if (sec >= MAX_VOICE_SECONDS) stop();
    }, 200);
  }

  function stop() {
    if (tickRef.current) clearInterval(tickRef.current);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  function discard() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setElapsed(0);
    setMode("idle");
  }

  function send() {
    if (!preview) return;
    setError(null);
    const ext = audioExtension(preview.mimeType);
    const fd = new FormData();
    fd.append("file", new File([preview.blob], `voice-note${ext}`, { type: preview.mimeType }));
    fd.append("durationSec", String(preview.durationSec));
    fd.append("waveform", serializeWaveform(preview.peaks));
    startTransition(async () => {
      const res = await action(fd);
      if (res.error) {
        setError(ERRORS[res.error] ?? res.error);
      } else {
        discard();
      }
    });
  }

  if (mode === "recording") {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>
        <canvas ref={canvasRef} width={192} height={32} className="h-8 w-48 rounded border bg-card" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatSeconds(elapsed)} / {formatSeconds(MAX_VOICE_SECONDS)}
        </span>
        <Button type="button" variant="destructive" size="sm" onClick={stop}>
          <Square className="me-1 h-4 w-4" />
          {t("voice.stop")}
        </Button>
      </div>
    );
  }

  if (mode === "preview" && preview) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <VoiceNotePlayer
            src={preview.url}
            peaks={preview.peaks}
            durationSec={preview.durationSec}
            compact
          />
          <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={pending}>
            <Trash2 className="me-1 h-4 w-4" />
            {t("voice.discard")}
          </Button>
          <Button type="button" size="sm" onClick={send} disabled={pending}>
            {pending ? (
              <Loader2 className="me-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="me-1 h-4 w-4" />
            )}
            {t("task.send")}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={start}>
        <Mic className="me-1 h-4 w-4" />
        {label ?? t("voice.record")}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
