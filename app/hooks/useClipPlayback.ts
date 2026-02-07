"use client";

import { useEffect, useRef } from "react";
import type { AudioClip } from "@/app/components/DAWWorkstation";

const FADE_MS = 0.003;
const MAX_CACHED_BUFFERS = 12;

function createLruCache<K, V>(maxSize: number) {
  const map = new Map<K, V>();
  const order: K[] = [];
  return {
    get(key: K): V | undefined {
      const v = map.get(key);
      if (v === undefined) return undefined;
      const i = order.indexOf(key);
      if (i >= 0) {
        order.splice(i, 1);
        order.push(key);
      }
      return v;
    },
    set(key: K, value: V) {
      if (map.has(key)) {
        const i = order.indexOf(key);
        if (i >= 0) order.splice(i, 1);
      } else if (order.length >= maxSize) {
        const evict = order.shift();
        if (evict !== undefined) map.delete(evict);
      }
      map.set(key, value);
      order.push(key);
    },
  };
}

export function useClipPlayback(
  clips: AudioClip[],
  playheadBeat: number,
  isPlaying: boolean,
  bpm: number
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef(createLruCache<string, AudioBuffer>(MAX_CACHED_BUFFERS));
  const currentNodesRef = useRef<{ source: AudioBufferSourceNode; gain: GainNode }[]>([]);
  const currentClipIdsRef = useRef<Set<string>>(new Set());
  const prevPlayheadRef = useRef(0);
  const SEEK_THRESHOLD_BEATS = 0.5;

  const stopAll = () => {
    const ctx = ctxRef.current;
    const now = ctx ? ctx.currentTime : 0;
    currentNodesRef.current.forEach(({ source, gain }) => {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + FADE_MS);
        source.stop(now + FADE_MS + 0.001);
      } catch (_) {}
    });
    currentNodesRef.current = [];
    currentClipIdsRef.current.clear();
  };

  useEffect(() => {
    if (!isPlaying || clips.length === 0) {
      stopAll();
      return;
    }

    const clipsUnderPlayhead = clips.filter(
      (c) =>
        playheadBeat >= c.startBeat &&
        playheadBeat < c.startBeat + c.durationBeats
    );

    const prevIds = currentClipIdsRef.current;
    const nextIds = new Set(clipsUnderPlayhead.map((c) => c.id));
    const idsChanged =
      prevIds.size !== nextIds.size ||
      [...nextIds].some((id) => !prevIds.has(id));
    const seeked =
      Math.abs(playheadBeat - prevPlayheadRef.current) > SEEK_THRESHOLD_BEATS;
    prevPlayheadRef.current = playheadBeat;

    if (clipsUnderPlayhead.length === 0) {
      stopAll();
      return;
    }

    if (!idsChanged && !seeked) return;

    stopAll();

    const playAll = async () => {
      if (!ctxRef.current) {
        ctxRef.current = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
      }
      const ctx = ctxRef.current;
      const now = ctx.currentTime;
      const cache = bufferCacheRef.current;

      for (const clip of clipsUnderPlayhead) {
        const cacheKey = clip.url;
        let buffer = cache.get(cacheKey);
        if (!buffer) {
          try {
            const buf = await fetch(clip.url).then((r) => r.arrayBuffer());
            buffer = await ctx.decodeAudioData(buf);
            cache.set(cacheKey, buffer);
          } catch (e) {
            console.warn("Decode failed for clip", clip.id, e);
            continue;
          }
        }

        const totalSource = clip.totalSourceBeats ?? clip.durationBeats;
        const offset = clip.sourceOffsetBeats ?? 0;
        const bufferDurationSec = buffer.duration;
        const offsetInBufferSec =
          ((offset + (playheadBeat - clip.startBeat)) / totalSource) *
          bufferDurationSec;
        const remainingBeats =
          clip.startBeat + clip.durationBeats - playheadBeat;
        const playDurationSec =
          (remainingBeats / totalSource) * bufferDurationSec;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        source.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.linearRampToValueAtTime(1, now + FADE_MS);
        source.start(now, Math.max(0, offsetInBufferSec), playDurationSec);
        currentNodesRef.current.push({ source, gain });
        currentClipIdsRef.current.add(clip.id);
        source.onended = () => {
          currentNodesRef.current = currentNodesRef.current.filter(
            (n) => n.source !== source
          );
          currentClipIdsRef.current.delete(clip.id);
        };
      }
    };

    playAll();
  }, [clips, playheadBeat, isPlaying, bpm]);
}
