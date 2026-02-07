"use client";

import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [projects, setProjects] = useState<{ id: string; name: string; createdAt: string }[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);

  const createProject = () => {
    if (!newProjectName.trim()) return;
    const id = `proj_${Date.now()}`;
    setProjects((p) => [...p, { id, name: newProjectName.trim(), createdAt: new Date().toISOString() }]);
    setNewProjectName("");
    setShowNewDialog(false);
    window.location.href = `/project/${id}?name=${encodeURIComponent(newProjectName.trim())}`;
  };

  return (
    <div className="vintage-grain min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <header className="mb-12 border-b border-[var(--sepia)]/50 pb-8">
          <h1 className="font-display text-4xl font-bold tracking-widest text-[var(--golden)]">
            STUDIO ONE
          </h1>
          <p className="mt-2 font-sans text-lg text-[var(--cream)]/80">
            Digital Audio Workstation — Est. 2025
          </p>
        </header>

        {/* Library section */}
        <section className="mb-12">
          <h2 className="font-display mb-4 text-xl font-semibold uppercase tracking-wider text-[var(--amber)]">
            Library
          </h2>
          <div className="rounded-lg border border-[var(--sepia)]/60 bg-[var(--vintage-panel)] p-6 shadow-inner">
            {projects.length === 0 ? (
              <p className="text-[var(--foreground)]/70">
                No projects yet. Create your first project to enter the workstation.
              </p>
            ) : (
              <ul className="space-y-2">
                {projects.map((proj) => (
                  <li key={proj.id}>
                    <Link
                      href={`/project/${proj.id}?name=${encodeURIComponent(proj.name)}`}
                      className="block rounded border border-[var(--sepia)]/40 bg-[var(--wood)] px-4 py-3 text-[var(--cream)] transition hover:border-[var(--golden-dim)] hover:bg-[var(--wood-light)]"
                    >
                      <span className="font-medium">{proj.name}</span>
                      <span className="ml-2 text-sm text-[var(--foreground)]/50">{proj.id}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Create new project */}
        <section>
          <button
            onClick={() => setShowNewDialog(true)}
            className="flex items-center gap-3 rounded-lg border-2 border-[var(--golden)] bg-[var(--wood)] px-6 py-4 font-display text-lg uppercase tracking-wider text-[var(--golden)] transition hover:bg-[var(--golden)] hover:text-[var(--background)]"
          >
            <span className="text-2xl">＋</span>
            Create New Project
          </button>
        </section>

        {/* New project dialog */}
        {showNewDialog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowNewDialog(false)}
          >
            <div
              className="w-full max-w-md rounded-xl border border-[var(--sepia)] bg-[var(--vintage-panel)] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display mb-4 text-xl text-[var(--golden)]">New Project</h3>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                className="mb-4 w-full rounded border border-[var(--sepia)] bg-[var(--wood)] px-4 py-2 text-[var(--cream)] placeholder:text-[var(--foreground)]/40 focus:border-[var(--golden)] focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowNewDialog(false)}
                  className="rounded border border-[var(--sepia)] px-4 py-2 text-[var(--foreground)]/80 hover:bg-[var(--wood)]"
                >
                  Cancel
                </button>
                <button
                  onClick={createProject}
                  disabled={!newProjectName.trim()}
                  className="rounded bg-[var(--golden)] px-4 py-2 font-medium text-[var(--background)] disabled:opacity-50 hover:bg-[var(--amber)]"
                >
                  Create & Open
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
