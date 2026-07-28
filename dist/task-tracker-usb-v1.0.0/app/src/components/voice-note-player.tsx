"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatSeconds } from "@/lib/voice";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 1.5, 2, 0.5];

/**
 * WhatsApp-style voice-note player: play/pause, clickable waveform with
 * progress, speed toggle (1x → 1.5x → 2x → 0.5x). `peaks` are 0..1 floats
 * (from lib/voice parseWaveform); `durationSec` comes from the DB because
 * MediaRecorder blobs often report Infinity as duration.
 */
export function VoiceNotePlayer({
  src,
  peaks,
  durationSec,
  transcript,
  compact,
}: {
  src: string;
  peaks: number[];
  durationSec: number;
  transcript?: string | null;
  compact?: boolean;
}) {
  const { t } = useT();
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);

  const duration =
    audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0
      ? audioRef.current.duration
      : durationSec;
  const fraction = duration > 0 ? Math.min(1, current / duration) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      audio.currentTime = 0;
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.playbackRate = SPEEDS[speedIdx];
      void audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  }

  function seek(e: React.PointerEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    const wave = waveRef.current;
    if (!audio || !wave || duration <= 0) return;
    const rect = wave.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = f * duration;
    setCurrent(f * duration);
  }

  return (
    <div className={cn("min-w-0", compact ? "max-w-sm" : "max-w-md")}>
      {/* dir=ltr: playback always progresses start→end, also in RTL locales */}
      <div dir="ltr" className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2">
        <audio ref={audioRef} src={src} preload="metadata" />
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t("voice.pause") : t("voice.play")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
        </button>
        <div
          ref={waveRef}
          onPointerDown={seek}
          role="slider"
          aria-label={t("voice.voiceNote")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          className="flex h-8 flex-1 cursor-pointer items-center gap-px"
        >
          {peaks.map((p, i) => (
            <span
              key={i}
              className={cn(
                "min-w-[2px] flex-1 rounded-full",
                i / peaks.length <= fraction ? "bg-primary" : "bg-muted-foreground/30"
              )}
              style={{ height: `${Math.round(15 + p * 85)}%` }}
            />
          ))}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatSeconds(playing || current > 0 ? current : duration)}
        </span>
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label={t("voice.speed")}
          className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground hover:bg-secondary"
        >
          {SPEEDS[speedIdx]}x
        </button>
      </div>
      {transcript && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {t("voice.transcript")}
          </button>
          {showTranscript && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{transcript}</p>
          )}
        </div>
      )}
    </div>
  );
}
