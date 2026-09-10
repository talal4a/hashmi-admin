"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/format";

/**
 * Voice-order audio player (PRD §7.2): waveform with progress, playback speed,
 * duration and source timestamp.
 *
 * The audio URL is served through authenticated delivery, so the recording is
 * never publicly enumerable. When no audio is attached the player says so
 * plainly rather than pretending to have something to play.
 */
export function WaveformPlayer({
  src,
  waveform,
  durationSeconds,
  recordedAt,
}: {
  src: string | null;
  waveform: number[] | null;
  durationSeconds: number | null;
  recordedAt: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(1);
  const [duration, setDuration] = useState(durationSeconds ?? 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onMeta = () => setDuration(audio.duration);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("loadedmetadata", onMeta);
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const seek = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = fraction * audio.duration;
    setProgress(fraction);
  };

  const bars = waveform ?? Array.from({ length: 56 }, () => 0.35);

  return (
    <div className="rounded-[var(--hm-radius-card)] border border-[var(--hm-border)] bg-[var(--hm-ink-50)] p-3.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!src}
          aria-label={playing ? "Pause recording" : "Play recording"}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
            src
              ? "bg-[var(--hm-cyan-500)] text-white hover:bg-[var(--hm-cyan-600)]"
              : "cursor-not-allowed bg-[var(--hm-ink-200)] text-[var(--hm-ink-400)]",
          )}
        >
          {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
        </button>

        <button
          type="button"
          disabled={!src}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            seek((event.clientX - rect.left) / rect.width);
          }}
          aria-label="Seek in recording"
          className="flex h-11 flex-1 cursor-pointer items-end gap-[2px] disabled:cursor-not-allowed"
        >
          {bars.map((value, index) => {
            const played = index / bars.length <= progress;
            return (
              <span
                key={index}
                aria-hidden
                className={cn(
                  "flex-1 rounded-[1px] transition-colors",
                  played ? "bg-[var(--hm-cyan-500)]" : "bg-[var(--hm-ink-300)]",
                )}
                style={{ height: `${Math.max(10, value * 100)}%` }}
              />
            );
          })}
        </button>

        <span className="shrink-0 font-mono text-[12px] text-[var(--hm-ink-600,#475569)] tabular-nums">
          {formatDuration(progress * duration)} / {formatDuration(duration)}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <Volume2 aria-hidden className="size-3.5 text-[var(--hm-ink-400)]" />
          {[1, 1.25, 1.5, 2].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRate(value)}
              aria-pressed={rate === value}
              className={cn(
                "rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold transition-colors",
                rate === value
                  ? "bg-[var(--hm-cyan-100)] text-[var(--hm-cyan-800)]"
                  : "text-[var(--hm-ink-500)] hover:bg-[var(--hm-ink-200)]",
              )}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-[var(--hm-ink-400)]">
        {src
          ? `Recorded ${new Date(recordedAt).toLocaleString("en-PK")} · access is restricted to authorized roles`
          : "No audio attached to this request — review the transcript and detected items instead."}
      </p>

      {src ? <audio ref={audioRef} src={src} preload="metadata" className="sr-only" /> : null}
    </div>
  );
}
