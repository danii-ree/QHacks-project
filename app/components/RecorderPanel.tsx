"use client";

import { useRef, useState, useEffect, useCallback } from "react";

const BPM = 120;
const SAMPLE_INTERVAL_MS = 40;
const PIXELS_PER_SECOND = 80;
const MAX_STRIP_WIDTH = 2400;
const WAVEFORM_HEIGHT = 140;

type Props = {
  onClose: () => void;
  onDone: (name: string, blob: Blob, durationBeats: number) => void;
};

export function RecorderPanel({ onClose, onDone }: Props) {
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [clipName, setClipName] = useState("Recording");
  const [durationMs, setDurationMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedSamplesRef = useRef<{ min: number; max: number }[]>([]);
  const durationMsRef = useRef(0);

  useEffect(() => {
    durationMsRef.current = durationMs;
  }, [durationMs]);

  const drawEdisonWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    const H = WAVEFORM_HEIGHT;
    const centerY = H / 2;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      const elapsed = durationMsRef.current;
      const stripWidth = Math.min(Math.max(elapsed * (PIXELS_PER_SECOND / 1000), 200), MAX_STRIP_WIDTH);
      if (canvas.width !== stripWidth) {
        canvas.width = stripWidth;
        canvas.height = H;
      }
      analyser.getByteTimeDomainData(dataArray);

      const samples = recordedSamplesRef.current;
      const colCount = samples.length;

      ctx.fillStyle = "#1a1510";
      ctx.fillRect(0, 0, stripWidth, H);

      const halfH = (H / 2) * 0.85;

      if (colCount > 0) {
        const colWidth = Math.max(1, stripWidth / colCount);
        ctx.fillStyle = "rgba(201, 162, 39, 0.5)";
        ctx.strokeStyle = "rgba(212, 168, 75, 0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        for (let i = 0; i < colCount; i++) {
          const s = samples[i]!;
          const minNorm = (s.min - 128) / 128;
          const x = i * colWidth + colWidth / 2;
          const yTop = centerY + minNorm * halfH;
          ctx.lineTo(x, yTop);
        }
        for (let i = colCount - 1; i >= 0; i--) {
          const s = samples[i]!;
          const maxNorm = (s.max - 128) / 128;
          const x = i * colWidth + colWidth / 2;
          const yBottom = centerY + maxNorm * halfH;
          ctx.lineTo(x, yBottom);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      const liveMin = Math.min(...Array.from(dataArray));
      const liveMax = Math.max(...Array.from(dataArray));
      const liveX = Math.max(0, stripWidth - 20);
      ctx.fillStyle = "rgba(201, 162, 39, 0.7)";
      ctx.fillRect(liveX, centerY + ((liveMin - 128) / 128) * halfH, 16, ((liveMax - liveMin) / 128) * halfH);
    };
    draw();
  }, []);

  const captureSample = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    let min = 255, max = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    recordedSamplesRef.current.push({ min, max });
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setRecording(true);
      setDurationMs(0);
      recordedSamplesRef.current = [];

      durationIntervalRef.current = setInterval(() => {
        setDurationMs((d) => d + SAMPLE_INTERVAL_MS);
        captureSample();
      }, SAMPLE_INTERVAL_MS);
      drawEdisonWaveform();
    } catch (err) {
      console.error(err);
      alert("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setRecording(false);
  };

  const handleDone = () => {
    if (!recordedBlob) return;
    const durationBeats = Math.max(1, Math.ceil((durationMs / 1000) * (BPM / 60)));
    onDone(clipName, recordedBlob, durationBeats);
  };

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!recording && recordedSamplesRef.current.length > 0 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const samples = recordedSamplesRef.current;
      const W = Math.min(Math.max(durationMs * (PIXELS_PER_SECOND / 1000), 200), MAX_STRIP_WIDTH);
      const H = WAVEFORM_HEIGHT;
      canvas.width = W;
      canvas.height = H;
      const colCount = samples.length;
      const colWidth = Math.max(1, W / colCount);
      const centerY = H / 2;
      const halfH = (H / 2) * 0.85;
      ctx.fillStyle = "#1a1510";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(201, 162, 39, 0.5)";
      ctx.strokeStyle = "rgba(212, 168, 75, 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      for (let i = 0; i < colCount; i++) {
        const s = samples[i]!;
        const minNorm = (s.min - 128) / 128;
        const x = i * colWidth + colWidth / 2;
        ctx.lineTo(x, centerY + minNorm * halfH);
      }
      for (let i = colCount - 1; i >= 0; i--) {
        const s = samples[i]!;
        const maxNorm = (s.max - 128) / 128;
        const x = i * colWidth + colWidth / 2;
        ctx.lineTo(x, centerY + maxNorm * halfH);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }, [recording, durationMs]);

  const stripWidth = Math.min(
    Math.max(recording || recordedBlob ? durationMs * (PIXELS_PER_SECOND / 1000) : 200, 200),
    MAX_STRIP_WIDTH
  );

  return (
    <div className="border-b border-[var(--sepia)] bg-[var(--vintage-panel)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg text-[var(--golden)]">Record Audio (Edison-style)</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-[var(--sepia)] px-2 py-1 text-sm text-[var(--cream)] hover:bg-[var(--wood)]"
        >
          Close
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="overflow-x-auto rounded border border-[var(--sepia)] bg-[var(--wood)]" style={{ maxWidth: "100%" }}>
          <canvas
            ref={canvasRef}
            width={stripWidth}
            height={WAVEFORM_HEIGHT}
            className="block rounded"
            style={{ width: stripWidth, height: WAVEFORM_HEIGHT, minWidth: 200 }}
          />
          <p className="mt-2 px-2 pb-1 text-sm text-[var(--foreground)]/70">
            {recording ? `Recording… ${(durationMs / 1000).toFixed(1)}s` : recordedBlob ? "Recording complete." : "Press Record to start."}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {!recording && !recordedBlob && (
            <button
              type="button"
              onClick={startRecording}
              className="rounded bg-red-800 px-4 py-2 text-white hover:bg-red-700"
            >
              Start Record
            </button>
          )}
          {recording && (
            <button
              type="button"
              onClick={stopRecording}
              className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-700"
            >
              Stop & Done
            </button>
          )}
          {recordedBlob && (
            <>
              <input
                type="text"
                value={clipName}
                onChange={(e) => setClipName(e.target.value)}
                placeholder="Clip name"
                className="rounded border border-[var(--sepia)] bg-[var(--wood)] px-3 py-2 text-[var(--cream)] placeholder:text-[var(--foreground)]/40"
              />
              <button
                type="button"
                onClick={handleDone}
                className="rounded bg-[var(--golden)] px-4 py-2 text-[var(--background)] hover:bg-[var(--amber)]"
              >
                Add to Track
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
