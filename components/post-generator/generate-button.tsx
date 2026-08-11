"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * The one place in the app that calls a Server Action directly (via
 * useTransition) instead of a plain `<form action>` — needed so a failed AI
 * call can surface as a toast instead of Next's default error boundary, and
 * so the button can show a "Generating…" pending state.
 */
export function GenerateButton({
  action,
  hasFeatured,
}: {
  action: () => Promise<void>;
  hasFeatured: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await action();
        toast.success("Post generated!");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to generate post.");
      }
    });
  }

  return (
    <Button type="button" onClick={handleClick} disabled={isPending} className="gap-2">
      <Wand2 className="h-4 w-4" strokeWidth={2} />
      {isPending ? "Generating…" : hasFeatured ? "Regenerate" : "Generate Post"}
    </Button>
  );
}
