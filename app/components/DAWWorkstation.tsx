"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MenuBar } from "./MenuBar";
import { PlaybackControls } from "./PlaybackControls";
import { RecorderPanel } from "./RecorderPanel";
import { TrackRack } from "./TrackRack";
import { useClipPlayback } from "@/app/hooks/useClipPlayback";
import { exportTimelineToWav, clearAudioCache } from "@/app/utils/audioExport";

export type AudioClip = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  startBeat: number;
  trackIndex: number;
  durationBeats: number;
  totalSourceBeats?: number;
  sourceOffsetBeats?: number;
};

export type ToolMode = "select" | "cut" | "import" | "export";

export default function DAWWorkstation({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [showRecorder, setShowRecorder] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [loopOn, setLoopOn] = useState(false);
  const [loopStartBeat, setLoopStartBeat] = useState(0);
  const [loopEndBeat, setLoopEndBeat] = useState(16);

  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const startBeatRef = useRef(0);

  useClipPlayback(clips, playheadBeat, isPlaying, bpm);

  useEffect(() => {
    if (!isPlaying) return;
    startTimeRef.current = performance.now() / 1000;
    startBeatRef.current = playheadBeat;
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    const beatsPerSec = bpm / 60;
    const totalBeats = Math.max(
      loopEndBeat,
      16,
      ...clips.map((c) => c.startBeat + c.durationBeats),
      0
    );
    
    const tick = () => {
      const now = performance.now() / 1000;
      let elapsed = now - startTimeRef.current;
      let beat = startBeatRef.current + elapsed * beatsPerSec;
      
      if (loopOn && loopEndBeat > loopStartBeat) {
        const loopLen = loopEndBeat - loopStartBeat;
        if (beat >= loopEndBeat) {
          beat = loopStartBeat + ((beat - loopStartBeat) % loopLen);
          startBeatRef.current = beat;
          startTimeRef.current = now;
        }
      } else if (beat >= totalBeats) {
        setIsPlaying(false);
        setPlayheadBeat(totalBeats);
        return;
      }
      
      setPlayheadBeat(beat);
      rafRef.current = requestAnimationFrame(tick);
    };
    
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, bpm, loopOn, loopStartBeat, loopEndBeat, clips]);

  // Track URL references for cleanup
  const urlRefCountRef = useRef<Map<string, number>>(new Map());
  
  // Cleanup function
  const cleanupAudio = useCallback(() => {
    // Revoke all object URLs
    urlRefCountRef.current.forEach((count, url) => {
      URL.revokeObjectURL(url);
    });
    urlRefCountRef.current.clear();
    
    // Clear audio buffer cache
    clearAudioCache();
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup on component unmount
      cleanupAudio();
      cancelAnimationFrame(rafRef.current);
    };
  }, [cleanupAudio]);

  const addClip = useCallback((clip: Omit<AudioClip, "id" | "url"> & { blob: Blob }) => {
    const id = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const url = URL.createObjectURL(clip.blob);
    
    // Track this URL
    urlRefCountRef.current.set(url, 1);
    
    const durationBeats = clip.durationBeats ?? 8;
    
    setClips((c) => [
      ...c,
      {
        id,
        name: clip.name,
        blob: clip.blob,
        url,
        startBeat: clip.startBeat,
        trackIndex: clip.trackIndex,
        durationBeats,
        totalSourceBeats: durationBeats,
        sourceOffsetBeats: 0,
      },
    ]);
  }, []);

  const splitClipAtPlayhead = useCallback(
    (clipId: string, atBeat: number) => {
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return;
      
      const clipEnd = clip.startBeat + clip.durationBeats;
      const totalSource = clip.totalSourceBeats ?? clip.durationBeats;
      const offset = clip.sourceOffsetBeats ?? 0;
      
      if (atBeat <= clip.startBeat || atBeat >= clipEnd) return;
      
      const leftDuration = atBeat - clip.startBeat;
      const rightDuration = clipEnd - atBeat;
      const rightSourceOffset = offset + leftDuration;
      
      // Increment ref count for shared URL
      urlRefCountRef.current.set(
        clip.url, 
        (urlRefCountRef.current.get(clip.url) ?? 0) + 1
      );
      
      setClips((c) => {
        const next = c.map((x) =>
          x.id === clipId
            ? { ...x, durationBeats: leftDuration }
            : x
        );
        
        next.push({
          id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: `${clip.name} (2)`,
          blob: clip.blob,
          url: clip.url,
          startBeat: atBeat,
          trackIndex: clip.trackIndex,
          durationBeats: rightDuration,
          totalSourceBeats: totalSource,
          sourceOffsetBeats: rightSourceOffset,
        });
        
        return next;
      });
    },
    [clips]
  );

  const removeClip = useCallback((id: string) => {
    setClips((c) => {
      const found = c.find((x) => x.id === id);
      if (!found) return c;
      
      const url = found.url;
      const count = (urlRefCountRef.current.get(url) ?? 1) - 1;
      
      if (count <= 0) {
        URL.revokeObjectURL(url);
        urlRefCountRef.current.delete(url);
      } else {
        urlRefCountRef.current.set(url, count);
      }
      
      return c.filter((x) => x.id !== id);
    });
  }, []);

  const updateClip = useCallback((id: string, updates: Partial<Pick<AudioClip, "startBeat" | "trackIndex" | "durationBeats">>) => {
    setClips((c) => c.map((x) => (x.id === id ? { ...x, ...updates } : x)));
  }, []);

  const seek = useCallback((beat: number) => {
    const newBeat = Math.max(0, beat);
    setPlayheadBeat(newBeat);
    startBeatRef.current = newBeat;
    startTimeRef.current = performance.now() / 1000;
  }, []);

  const addClipFromFile = useCallback(
    async (blob: Blob, name: string) => {
      let durationBeats = 8;
      
      try {
        // Use a temporary audio context to get duration
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        durationBeats = Math.max(1, Math.ceil((audioBuffer.duration * bpm) / 60));
        ctx.close();
      } catch (error) {
        console.warn("Could not decode audio file, using default duration:", error);
        // Use default 8 beats if decode fails
      }
      
      addClip({
        name: name.replace(/\.[^.]+$/, ""),
        blob,
        startBeat: 0,
        trackIndex: 0,
        durationBeats,
      });
    },
    [bpm, addClip]
  );

  const handleExportWav = useCallback(async () => {
    try {
      const wavBlob = await exportTimelineToWav(clips, bpm);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName.replace(/[^a-zA-Z0-9-_]/g, "_")}_export.wav`;
      a.click();
      
      // Clean up the URL after download
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Ensure you have at least one clip and try again.");
    }
  }, [clips, bpm, projectName]);

  return (
    <div className="vintage-grain flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <MenuBar
        projectName={projectName}
        projectId={projectId}
        toolMode={toolMode}
        onToolChange={setToolMode}
        clips={clips}
        onExportWav={handleExportWav}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <PlaybackControls
          metronomeOn={metronomeOn}
          onMetronomeToggle={setMetronomeOn}
          onRecordClick={() => setShowRecorder(true)}
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying((p) => !p)}
          bpm={bpm}
          onBpmChange={setBpm}
          playheadBeat={playheadBeat}
        />

        {showRecorder && (
          <RecorderPanel
            onClose={() => setShowRecorder(false)}
            onDone={(name, blob, durationBeats) => {
              addClip({
                name,
                blob,
                startBeat: 0,
                trackIndex: 0,
                durationBeats,
              });
              setShowRecorder(false);
            }}
          />
        )}

        <TrackRack
          clips={clips}
          toolMode={toolMode}
          onRemoveClip={removeClip}
          onUpdateClip={updateClip}
          onImportFile={(name, blob) => addClipFromFile(blob, name)}
          zoomLevel={zoomLevel}
          onZoomChange={setZoomLevel}
          loopOn={loopOn}
          loopStartBeat={loopStartBeat}
          loopEndBeat={loopEndBeat}
          onLoopChange={(on, start, end) => {
            setLoopOn(on);
            if (start !== undefined) setLoopStartBeat(start);
            if (end !== undefined) setLoopEndBeat(end);
          }}
          playheadBeat={playheadBeat}
          onSeek={seek}
          onSplitAtPlayhead={splitClipAtPlayhead}
        />
      </div>
    </div>
  );
}