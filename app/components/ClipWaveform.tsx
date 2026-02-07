"use client";

import { useRef, useEffect, useState } from "react";

type Props = {
  url: string;
  width: number;
  height: number;
  className?: string;
  /** For split/trimmed clips: offset into source in beats */
  sourceOffsetBeats?: number;
  /** This clip's duration in beats */
  durationBeats?: number;
  /** Total source length in beats */
  totalSourceBeats?: number;
};

export function ClipWaveform({ url, width, height, className, sourceOffsetBeats = 0, durationBeats, totalSourceBeats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [error, setError] = useState(false);

  const PEAK_RES = 512;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((buffer) => {
        if (cancelled) return;
        const ch = buffer.getChannelData(0);
        const total = totalSourceBeats ?? 1;
        const startFrac = totalSourceBeats != null && durationBeats != null ? sourceOffsetBeats / total : 0;
        const endFrac = totalSourceBeats != null && durationBeats != null ? (sourceOffsetBeats + durationBeats) / total : 1;
        const startSample = Math.floor(startFrac * ch.length);
        const endSample = Math.min(ch.length, Math.ceil(endFrac * ch.length));
        const sliceLength = Math.max(1, endSample - startSample);
        const out: number[] = [];
        const step = Math.max(1, Math.floor(sliceLength / PEAK_RES));
        for (let i = 0; i < PEAK_RES; i++) {
          const start = startSample + Math.floor((i / PEAK_RES) * sliceLength);
          const end = Math.min(endSample, start + step);
          let min = 0, max = 0;
          for (let j = start; j < end; j++) {
            const v = ch[j]!;
            if (v < min) min = v;
            if (v > max) max = v;
          }
          out.push(min, max);
        }
        setPeaks(out);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      ctx.close();
    };
  }, [url, sourceOffsetBeats, durationBeats, totalSourceBeats]);

  useEffect(() => {
    if (!peaks || !canvasRef.current || width <= 0 || height <= 0) return;
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = width;
    const H = height;
    const centerY = H / 2;
    const halfH = centerY * 0.9;
    const numBars = peaks.length / 2;
    const barWidth = W / numBars;
    ctx.fillStyle = "rgba(26, 21, 16, 0.4)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(201, 162, 39, 0.65)";
    for (let i = 0; i < numBars; i++) {
      const min = peaks[i * 2]!;
      const max = peaks[i * 2 + 1]!;
      const x = i * barWidth;
      const yTop = centerY + min * halfH;
      const yBottom = centerY + max * halfH;
      ctx.fillRect(x, Math.min(yTop, yBottom), barWidth + 0.5, Math.abs(yBottom - yTop) || 1);
    }
  }, [peaks, width, height]);

  if (error) return null;
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ width, height, display: "block" }}
    />
  );
}
