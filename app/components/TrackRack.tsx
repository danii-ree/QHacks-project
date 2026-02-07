"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { AudioClip, ToolMode } from "./DAWWorkstation";
import { ClipWaveform } from "./ClipWaveform";

const TRACK_COUNT = 8;
const BASE_PIXELS_PER_BEAT = 40;
const TRACK_HEIGHT = 72;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

type Props = {
  clips: AudioClip[];
  toolMode: ToolMode;
  onRemoveClip: (id: string) => void;
  onUpdateClip: (id: string, updates: Partial<Pick<AudioClip, "startBeat" | "trackIndex" | "durationBeats">>) => void;
  onImportFile?: (name: string, blob: Blob) => void;
  zoomLevel: number;
  onZoomChange: (z: number) => void;
  loopOn: boolean;
  loopStartBeat: number;
  loopEndBeat: number;
  onLoopChange: (on: boolean, start?: number, end?: number) => void;
  playheadBeat: number;
  onSeek: (beat: number) => void;
  onSplitAtPlayhead: (clipId: string, atBeat: number) => void;
};

export function TrackRack({
  clips,
  toolMode,
  onRemoveClip,
  onUpdateClip,
  onImportFile,
  zoomLevel,
  onZoomChange,
  loopOn,
  loopStartBeat,
  loopEndBeat,
  onLoopChange,
  playheadBeat,
  onSeek,
  onSplitAtPlayhead,
}: Props) {
  const [draggingClip, setDraggingClip] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const rackRef = useRef<HTMLDivElement>(null);
  const pixelsPerBeat = BASE_PIXELS_PER_BEAT * zoomLevel;

  const handleClipMouseDown = (e: React.MouseEvent, clip: AudioClip) => {
    if (toolMode === "cut") return;
    e.preventDefault();
    setDraggingClip(clip.id);
    const rect = rackRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - (rect.left + 96 + clip.startBeat * pixelsPerBeat),
        y: e.clientY - (rect.top + 4 + clip.trackIndex * (TRACK_HEIGHT + 4)),
      });
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingClip || !rackRef.current) return;
      const rect = rackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - 96 - dragOffset.x;
      const y = e.clientY - rect.top - 4 - dragOffset.y;
      const startBeat = Math.max(0, x / pixelsPerBeat);
      const trackIndex = Math.max(0, Math.min(TRACK_COUNT - 1, Math.floor(y / (TRACK_HEIGHT + 4))));
      onUpdateClip(draggingClip, { startBeat, trackIndex });
    },
    [draggingClip, dragOffset, onUpdateClip, pixelsPerBeat]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingClip(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);


  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const handleCutClick = (clipId: string) => {
    if (toolMode !== "cut") return;
    setSelectedClipId((prev) => (prev === clipId ? null : clipId));
  };

  const deleteSelectedClip = () => {
    if (selectedClipId) {
      onRemoveClip(selectedClipId);
      setSelectedClipId(null);
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.wav,.mp3,.webm,.ogg,.m4a,.flac,.aac";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !onImportFile) return;
      onImportFile(file.name, file);
    };
    input.click();
  };

  const zoomIn = () => onZoomChange(Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP));
  const zoomOut = () => onZoomChange(Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP));

  const clientXToBeat = (clientX: number) => {
    const rect = rackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left - 96;
    return Math.max(0, x / pixelsPerBeat);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest("[data-clip]")) return;
    if ((e.target as Element).closest("[data-playhead-drag]")) return;
    onSeek(clientXToBeat(e.clientX));
  };

  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingPlayhead(true);
  };
  useEffect(() => {
    if (!draggingPlayhead) return;
    const onMove = (e: MouseEvent) => {
      const rect = rackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left - 96;
      onSeek(Math.max(0, x / pixelsPerBeat));
    };
    const onUp = () => setDraggingPlayhead(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingPlayhead, onSeek, pixelsPerBeat]);

  const contentWidth = Math.max(loopEndBeat, 16, ...clips.map((c) => c.startBeat + c.durationBeats), 0) * pixelsPerBeat;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--sepia)]/50 bg-[var(--wood)] px-3 py-2">
        <span className="text-sm text-[var(--cream)]/80">Timeline</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--sepia)] text-[var(--cream)] hover:bg-[var(--wood-light)]"
            title="Zoom out"
          >
            −
          </button>
          <span className="min-w-[4rem] text-center text-sm text-[var(--cream)]/80">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--sepia)] text-[var(--cream)] hover:bg-[var(--wood-light)]"
            title="Zoom in"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2 border-l border-[var(--sepia)]/50 pl-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-[var(--cream)]/80">
            <input
              type="checkbox"
              checked={loopOn}
              onChange={(e) => onLoopChange(e.target.checked)}
              className="rounded border-[var(--sepia)]"
            />
            Loop
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--cream)]/70">
            Start
            <input
              type="number"
              min={0}
              value={loopStartBeat}
              onChange={(e) => onLoopChange(loopOn, Number(e.target.value) || 0, loopEndBeat)}
              className="w-14 rounded border border-[var(--sepia)] bg-[var(--vintage-panel)] px-1 py-0.5 text-center text-[var(--cream)]"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--cream)]/70">
            End
            <input
              type="number"
              min={0}
              value={loopEndBeat}
              onChange={(e) => onLoopChange(loopOn, loopStartBeat, Number(e.target.value) || 0)}
              className="w-14 rounded border border-[var(--sepia)] bg-[var(--vintage-panel)] px-1 py-0.5 text-center text-[var(--cream)]"
            />
          </label>
        </div>
        {toolMode === "cut" && selectedClipId && (
          <>
            <button
              type="button"
              onClick={deleteSelectedClip}
              className="rounded bg-red-800 px-3 py-1 text-sm text-white hover:bg-red-700"
            >
              Delete selected clip
            </button>
            <button
              type="button"
              onClick={() => {
                const clip = clips.find((c) => c.id === selectedClipId);
                if (clip && playheadBeat > clip.startBeat && playheadBeat < clip.startBeat + clip.durationBeats) {
                  onSplitAtPlayhead(selectedClipId, playheadBeat);
                  setSelectedClipId(null);
                }
              }}
              disabled={
                !clips.find(
                  (c) =>
                    c.id === selectedClipId &&
                    playheadBeat > c.startBeat &&
                    playheadBeat < c.startBeat + c.durationBeats
                )
              }
              className="rounded bg-[var(--golden)] px-3 py-1 text-sm text-[var(--background)] disabled:opacity-50 hover:bg-[var(--amber)] disabled:hover:bg-[var(--golden)]"
              title="Split the selected clip at the playhead position"
            >
              Split at playhead
            </button>
          </>
        )}
        {toolMode === "import" && (
          <button
            type="button"
            onClick={handleImport}
            className="rounded bg-[var(--golden)] px-3 py-1 text-sm text-[var(--background)]"
          >
            Import Audio File
          </button>
        )}
      </div>

      <div
        ref={rackRef}
        className="relative flex-1 overflow-auto bg-[var(--vintage-panel)] p-4"
        style={{ overscrollBehavior: "contain" }}
      >
        <div className="relative" style={{ minWidth: 96 + contentWidth }}>
          {/* Time ruler */}
          <div
            className="sticky top-0 z-20 flex border-b border-[var(--sepia)]/40 bg-[var(--wood)]"
            style={{ height: 28 }}
          >
            <div className="w-24 shrink-0 border-r border-[var(--sepia)]/40 px-2 py-1 text-xs text-[var(--foreground)]/50">
              Beats
            </div>
            <div
              className="relative flex-1 cursor-pointer"
              style={{ minHeight: 28 }}
              onClick={handleTimelineClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).click()}
              aria-label="Click to move playhead"
            >
              {Array.from({ length: Math.ceil(contentWidth / pixelsPerBeat) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute border-l border-[var(--sepia)]/30 text-[10px] text-[var(--foreground)]/50"
                  style={{ left: i * pixelsPerBeat, top: 2, paddingLeft: 2 }}
                >
                  {i % 4 === 0 ? i : ""}
                </div>
              ))}
            </div>
          </div>
          {/* Loop region overlay */}
          {loopOn && loopEndBeat > loopStartBeat && (
            <div
              className="pointer-events-none absolute z-0 border-l border-r border-[var(--golden)]/60 bg-[var(--golden)]/10"
              style={{
                left: 96 + loopStartBeat * pixelsPerBeat,
                width: (loopEndBeat - loopStartBeat) * pixelsPerBeat,
                top: 28,
                bottom: 0,
                marginTop: 4,
                marginBottom: 4,
              }}
            />
          )}
          {/* Playhead - drag to seek */}
          <div
            data-playhead-drag
            className="absolute z-30 flex cursor-ew-resize items-stretch"
            style={{
              left: 96 + playheadBeat * pixelsPerBeat,
              top: 28,
              bottom: 0,
              width: 12,
              marginLeft: -6,
            }}
            onMouseDown={handlePlayheadMouseDown}
            aria-label="Drag to move playhead"
          >
            <div
              className="pointer-events-none w-0.5 flex-1 bg-[var(--golden)] shadow-[0_0_6px_var(--golden)]"
              style={{ margin: "0 auto" }}
            />
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--golden)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--background)]"
              style={{ top: 0 }}
            >
              ▶
            </div>
          </div>
          {/* Track lanes */}
          {Array.from({ length: TRACK_COUNT }).map((_, i) => (
            <div
              key={i}
              className="relative z-10 mb-1 flex items-center rounded border border-[var(--sepia)]/40 bg-[var(--wood)]"
              style={{ height: TRACK_HEIGHT - 4 }}
            >
              <div className="w-24 shrink-0 border-r border-[var(--sepia)]/40 px-2 py-1 text-xs text-[var(--foreground)]/60">
                Track {i + 1}
              </div>
              <div
                className="relative flex-1 overflow-hidden"
                style={{ minHeight: TRACK_HEIGHT - 4 }}
                onClick={handleTimelineClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).click()}
              >
                {clips
                  .filter((c) => c.trackIndex === i)
                  .map((clip) => {
                    const clipW = clip.durationBeats * pixelsPerBeat - 4;
                    const clipH = TRACK_HEIGHT - 12;
                    return (
                      <div
                        key={clip.id}
                        data-clip
                        role="button"
                        tabIndex={0}
                        onMouseDown={(e) => handleClipMouseDown(e, clip)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (toolMode === "cut") handleCutClick(clip.id);
                        }}
                        className={`absolute cursor-grab rounded border py-0.5 px-1 text-[var(--cream)] active:cursor-grabbing ${
                          selectedClipId === clip.id && toolMode === "cut"
                            ? "border-red-500 bg-red-900/40 ring-2 ring-red-500"
                            : "border-[var(--golden-dim)] bg-[var(--wood-light)]/80"
                        }`}
                        style={{
                          left: clip.startBeat * pixelsPerBeat,
                          top: 4,
                          width: clipW,
                          height: clipH,
                        }}
                      >
                        <div className="absolute inset-0 overflow-hidden rounded">
                          <ClipWaveform
                            url={clip.url}
                            width={Math.max(1, Math.floor(clipW))}
                            height={Math.max(1, Math.floor(clipH - 14))}
                            className="absolute inset-0 h-full w-full opacity-90"
                            sourceOffsetBeats={clip.sourceOffsetBeats ?? 0}
                            durationBeats={clip.durationBeats}
                            totalSourceBeats={clip.totalSourceBeats ?? clip.durationBeats}
                          />
                        </div>
                        <span className="absolute bottom-0 left-0 right-0 truncate bg-[var(--wood)]/90 px-1 py-0.5 text-xs">
                          {clip.name}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
