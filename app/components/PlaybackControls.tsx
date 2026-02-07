"use client";

import { useRef, useEffect } from "react";

type Props = {
  metronomeOn: boolean;
  onMetronomeToggle: (on: boolean) => void;
  onRecordClick: () => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  playheadBeat: number;
};

export function PlaybackControls({
  metronomeOn,
  onMetronomeToggle,
  onRecordClick,
  isPlaying,
  onPlayPause,
  bpm,
  onBpmChange,
  playheadBeat,
}: Props) {
  const metronomeCtx = useRef<AudioContext | null>(null);
  const metronomeInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!metronomeOn) {
      if (metronomeInterval.current) {
        clearInterval(metronomeInterval.current);
        metronomeInterval.current = null;
      }
      return;
    }
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    metronomeCtx.current = ctx;

    const playTick = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1000;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    };

    const interval = 60000 / bpm;
    metronomeInterval.current = setInterval(playTick, interval);
    return () => {
      if (metronomeInterval.current) clearInterval(metronomeInterval.current);
      ctx.close();
    };
  }, [metronomeOn, bpm]);

  const sec = (playheadBeat / bpm) * 60;
  const timeStr = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-[var(--sepia)]/50 bg-[var(--wood)] px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPlayPause}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--golden)] text-[var(--background)] hover:bg-[var(--amber)]"
          title={isPlaying ? "Stop" : "Play"}
        >
          {isPlaying ? "■" : "▶"}
        </button>
        <span className="text-sm text-[var(--cream)]/80">{isPlaying ? "Playing" : "Stopped"}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--golden)]" title="Current position (beat)">
          Beat {playheadBeat.toFixed(1)}
        </span>
        <span className="text-sm text-[var(--cream)]/60">{timeStr}</span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--cream)]/80">BPM</label>
        <input
          type="number"
          min={40}
          max={240}
          value={bpm}
          onChange={(e) => onBpmChange(Number(e.target.value) || 120)}
          className="w-16 rounded border border-[var(--sepia)] bg-[var(--vintage-panel)] px-2 py-1 text-center text-[var(--cream)]"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMetronomeToggle(!metronomeOn)}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            metronomeOn
              ? "bg-[var(--golden)] text-[var(--background)]"
              : "border border-[var(--sepia)] text-[var(--cream)] hover:bg-[var(--wood-light)]"
          }`}
        >
          Metronome {metronomeOn ? "On" : "Off"}
        </button>
      </div>

      <button
        type="button"
        onClick={onRecordClick}
        className="flex items-center gap-2 rounded bg-red-800/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        <span className="h-3 w-3 rounded-full bg-red-500" /> Record
      </button>
    </div>
  );
}
