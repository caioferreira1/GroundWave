"use client";

import type { ReactNode, RefObject } from "react";

/**
 * A centered floating panel — still the native <dialog> element
 * (showModal() gives focus trap, Escape-to-close, and a real backdrop for
 * free, same reasoning as components/posts/manual-comment-dialog.tsx).
 *
 * `inset-0` + `m-auto` is deliberate on all four sides, not just two: the
 * <dialog> UA stylesheet already sets `inset: 0` on `dialog:modal`, so
 * pinning only one edge (e.g. `right-0`) while leaving the opposite edge's
 * default `0` in place over-constrains left/width/right and the browser
 * resolves it by anchoring to the UA's edge — that's what pinned this to
 * the left before. Setting all four sides equally and centering via
 * `margin: auto` sidesteps that entirely.
 */
export function ScheduleDrawer({
  dialogRef,
  onClose,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      onCancel={onClose}
      className="fixed inset-0 m-auto h-[85vh] w-[92vw] max-w-lg scale-100 overflow-hidden rounded-2xl border border-border/70 bg-card p-0 text-foreground opacity-100 shadow-2xl transition-all duration-200 ease-out starting:scale-95 starting:opacity-0 backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      {children}
    </dialog>
  );
}
