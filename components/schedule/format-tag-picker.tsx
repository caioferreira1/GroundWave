"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Input, buttonClass } from "@/components/ui";
import type { FormatTagOption } from "./types";

/**
 * Clickable pills, not a dropdown — same pattern as the Kind and
 * Collaborator toggles, so all three "pick one" fields in this form look
 * and behave the same way. The tag list isn't a hardcoded array (like
 * COLLABORATORS), it's a real table (schedule_format_tags) staff can grow
 * from right here via "+ New tag", without editing code. createAction
 * returns the created tag so it can be added as a pill and selected
 * immediately, no page reload needed.
 */
export function FormatTagPicker({
  tags: initialTags,
  defaultValue,
  createAction,
}: {
  tags: FormatTagOption[];
  defaultValue: string;
  createAction: (formData: FormData) => Promise<FormatTagOption>;
}) {
  const [tags, setTags] = useState(initialTags);
  const [selected, setSelected] = useState(defaultValue);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    const formData = new FormData();
    formData.set("label", label);
    startTransition(async () => {
      try {
        const tag = await createAction(formData);
        setTags((prev) => [...prev, tag].sort((a, b) => a.label.localeCompare(b.label)));
        setSelected(tag.id);
        setNewLabel("");
        setAdding(false);
        toast.success("Tag added!");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add tag.");
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Format</p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> New tag
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer">
          <input
            type="radio"
            name="format_tag_id"
            value=""
            checked={selected === ""}
            onChange={() => setSelected("")}
            className="peer sr-only"
          />
          <span className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors peer-checked:border-transparent peer-checked:bg-secondary peer-checked:text-foreground">
            None
          </span>
        </label>
        {tags.map((t) => (
          <label key={t.id} className="cursor-pointer">
            <input
              type="radio"
              name="format_tag_id"
              value={t.id}
              checked={selected === t.id}
              onChange={() => setSelected(t.id)}
              className="peer sr-only"
            />
            <span className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-checked:text-accent-foreground">
              {t.label}
            </span>
          </label>
        ))}
      </div>

      {adding && (
        <div className="flex gap-2 pt-1">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New tag name…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <button type="button" onClick={handleAdd} disabled={isPending} className={buttonClass("secondary", "sm")}>
            {isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
