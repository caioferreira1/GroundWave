import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui";

/** Presentational only — `GenerationPanel` owns the pending state and the Server Action call. */
export function GenerateButton({
  onClick,
  pending,
  hasFeatured,
}: {
  onClick: () => void;
  pending: boolean;
  hasFeatured: boolean;
}) {
  return (
    <Button type="button" onClick={onClick} disabled={pending} className="gap-2">
      <Wand2 className="h-4 w-4" strokeWidth={2} />
      {pending ? "Generating…" : hasFeatured ? "Regenerate" : "Generate Post"}
    </Button>
  );
}
