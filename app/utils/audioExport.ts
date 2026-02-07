/**
 * Export timeline to a single WAV file. Mixes all clips at current BPM.
 * Uses OfflineAudioContext for efficient, non-realtime rendering.
 */

import type { AudioClip } from "@/app/components/DAWWorkstation";

const SAMPLE_RATE = 44100;
const MAX_CACHED_BUFFERS = 8; // Limit memory usage

// LRU cache for AudioBuffers
const audioBufferCache = new Map<string, { buffer: AudioBuffer; timestamp: number }>();
let cacheHits = 0;
let cacheMisses = 0;

function pruneCache() {
  if (audioBufferCache.size <= MAX_CACHED_BUFFERS) return;
  
  // Sort by timestamp (oldest first) and remove excess
  const entries = Array.from(audioBufferCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  
  const toRemove = entries.slice(0, entries.length - MAX_CACHED_BUFFERS);
  toRemove.forEach(([key]) => {
    audioBufferCache.delete(key);
  });
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length * numChannels * 2; // 16-bit
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);
  
  // Get all channel data at once to avoid repeated calls
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  
  // Write WAV header
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, length, true);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = channels[ch][i];
      const int16Value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16Value, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export async function exportTimelineToWav(
  clips: AudioClip[],
  bpm: number
): Promise<Blob> {
  if (clips.length === 0) throw new Error("No clips to export");
  
  // Calculate total duration
  const durationBeats = Math.max(
    ...clips.map((c) => c.startBeat + c.durationBeats),
    1
  );
  const durationSec = (durationBeats * 60) / bpm;
  const lengthSamples = Math.ceil(durationSec * SAMPLE_RATE);
  
  // Group by URL to avoid duplicate decoding
  const urlGroups = new Map<string, AudioClip[]>();
  clips.forEach(clip => {
    if (!urlGroups.has(clip.url)) {
      urlGroups.set(clip.url, []);
    }
    urlGroups.get(clip.url)!.push(clip);
  });
  
  const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    // Decode unique audio files with caching
    for (const [url, urlClips] of urlGroups) {
      if (audioBufferCache.has(url)) {
        cacheHits++;
        // Update timestamp for LRU
        const entry = audioBufferCache.get(url)!;
        entry.timestamp = Date.now();
        continue;
      }
      
      cacheMisses++;
      try {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
        
        audioBufferCache.set(url, {
          buffer: decoded,
          timestamp: Date.now()
        });
        
        pruneCache();
      } catch (error) {
        console.warn(`Failed to decode audio from ${url}:`, error);
        // Remove from cache if it fails
        audioBufferCache.delete(url);
      }
    }
    
    decodeCtx.close();
    
    // Create offline context
    const ctx = new OfflineAudioContext(2, lengthSamples, SAMPLE_RATE);
    
    // Schedule all clips
    for (const clip of clips) {
      const cacheEntry = audioBufferCache.get(clip.url);
      if (!cacheEntry) continue;
      
      const buffer = cacheEntry.buffer;
      const totalSource = clip.totalSourceBeats ?? clip.durationBeats;
      const offset = clip.sourceOffsetBeats ?? 0;
      
      const startTimeSec = (clip.startBeat * 60) / bpm;
      const clipDurationSec = (clip.durationBeats / totalSource) * buffer.duration;
      const offsetInBufferSec = (offset / totalSource) * buffer.duration;
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(startTimeSec, offsetInBufferSec, clipDurationSec);
    }
    
    // Render to buffer
    const rendered = await ctx.startRendering();
    return encodeWav(rendered);
    
  } catch (error) {
    decodeCtx.close();
    throw error;
  }
}

// Optional: Add cleanup function for memory management
export function clearAudioCache() {
  audioBufferCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

export function getCacheStats() {
  return {
    size: audioBufferCache.size,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: cacheHits / (cacheHits + cacheMisses) || 0
  };
}