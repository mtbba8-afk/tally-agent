"use client";

export default function OfficeError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-lg space-y-3">
      <h1 className="font-display text-3xl">The desk could not load.</h1>
      <p className="text-sm text-muted">The ledger did not answer. Try again. If this keeps happening, check the data file or Supabase.</p>
      <button type="button" onClick={reset} className="rounded-full bg-accent px-4 py-2 text-sm text-[var(--accent-foreground)]">
        Try again
      </button>
    </div>
  );
}
