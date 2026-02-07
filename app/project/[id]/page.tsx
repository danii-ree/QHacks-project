import { Suspense } from "react";
import DAWWorkstation from "@/app/components/DAWWorkstation";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  const { id } = await params;
  const { name } = await searchParams;
  const projectName = name || "Untitled Project";

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--golden)]">Loading workstation…</div>}>
      <DAWWorkstation projectId={id} projectName={projectName} />
    </Suspense>
  );
}
