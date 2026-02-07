"use client";

import Link from "next/link";
import { useState } from "react";
import type { AudioClip, ToolMode } from "./DAWWorkstation";

const MENU_ITEMS = [
  { label: "File", items: ["New", "Open", "Save", "Import", "Export", "Exit"] },
  { label: "Edit", items: ["Undo", "Redo", "Cut", "Copy", "Paste", "Delete"] },
  { label: "Tools", items: ["Select", "Cut", "Slice", "Paint", "Zoom"] },
  { label: "View", items: ["Playlist", "Mixer", "Piano Roll", "Browser"] },
  { label: "Options", items: ["Settings", "Metronome", "Audio Settings"] },
  { label: "Help", items: ["Documentation", "About"] },
] as const;

type Props = {
  projectName: string;
  projectId: string;
  toolMode: ToolMode;
  onToolChange: (t: ToolMode) => void;
  clips: AudioClip[];
  onExportWav: () => Promise<void>;
};

export function MenuBar({ projectName, projectId, toolMode, onToolChange, clips, onExportWav }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleMenuAction = (menu: string, item: string) => {
    if (menu === "File" && item === "Import") onToolChange("import");
    if (menu === "File" && item === "Export") setShowExport(true);
    if (menu === "Tools" && item === "Select") onToolChange("select");
    if (menu === "Tools" && item === "Cut") onToolChange("cut");
    setOpenMenu(null);
  };

  const handleExportWav = async () => {
    if (clips.length === 0) {
      alert("No clips to export.");
      setShowExport(false);
      return;
    }
    setExporting(true);
    try {
      await onExportWav();
      setShowExport(false);
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="flex items-center justify-between border-b border-[var(--sepia)] bg-[var(--vintage-panel)] px-2 py-1">
      <div className="flex items-center gap-1">
        {MENU_ITEMS.map(({ label, items }) => (
          <div key={label} className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === label ? null : label)}
              className="rounded px-3 py-1.5 text-sm font-medium text-[var(--cream)] hover:bg-[var(--wood)]"
            >
              {label}
            </button>
            {openMenu === label && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setOpenMenu(null)}
                  aria-hidden
                />
                <ul className="absolute left-0 top-full z-50 mt-0.5 min-w-[160px] rounded border border-[var(--sepia)] bg-[var(--wood)] py-1 shadow-lg">
                  {items.map((item) => (
                    <li key={item}>
                      <button
                        type="button"
                        onClick={() => handleMenuAction(label, item)}
                        className="w-full px-4 py-2 text-left text-sm text-[var(--cream)] hover:bg-[var(--wood-light)]"
                      >
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-[var(--foreground)]/70">Tool: {toolMode}</span>
        <Link
          href="/"
          className="rounded border border-[var(--sepia)] px-3 py-1 text-sm text-[var(--golden)] hover:bg-[var(--wood)]"
        >
          ← Library
        </Link>
        <span className="font-display text-sm text-[var(--golden)]">{projectName}</span>
      </div>

      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-xl border border-[var(--sepia)] bg-[var(--vintage-panel)] p-6">
            <p className="mb-4 text-[var(--cream)]">
              Export the full timeline as a single WAV file (44.1 kHz, stereo). All clips are mixed at the current BPM.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowExport(false)}
                disabled={exporting}
                className="rounded border border-[var(--sepia)] px-4 py-2 text-[var(--cream)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExportWav}
                disabled={exporting || clips.length === 0}
                className="rounded bg-[var(--golden)] px-4 py-2 text-[var(--background)] disabled:opacity-50 hover:bg-[var(--amber)]"
              >
                {exporting ? "Exporting…" : "Export WAV"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
