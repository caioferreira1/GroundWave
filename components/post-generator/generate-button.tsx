"use client";

import { ChevronDown, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

/**
 * Presentational only — `GenerationPanel` owns the pending state and the
 * Server Action call. Without `subreddits` this is a plain button and the
 * server draws the subreddit at random; with them, clicking opens a dropdown
 * and `onSelect` gets the chosen one.
 */
export function GenerateButton({
  subreddits,
  onSelect,
  pending,
  hasFeatured,
}: {
  subreddits?: string[];
  onSelect: (subreddit?: string) => void;
  pending: boolean;
  hasFeatured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = pending ? "Generating…" : hasFeatured ? "Regenerate" : "Generate Post";

  if (!subreddits) {
    return (
      <Button type="button" onClick={() => onSelect()} disabled={pending} className="gap-2">
        <Wand2 className="h-4 w-4" strokeWidth={2} />
        {label}
      </Button>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <Button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending || subreddits.length === 0}
        aria-expanded={open}
        aria-haspopup="menu"
        title={subreddits.length === 0 ? "No subreddits configured yet" : undefined}
        className="gap-2"
      >
        <Wand2 className="h-4 w-4" strokeWidth={2} />
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" strokeWidth={2} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-20 mt-2 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-md"
        >
          {subreddits.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(s);
              }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              r/{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
