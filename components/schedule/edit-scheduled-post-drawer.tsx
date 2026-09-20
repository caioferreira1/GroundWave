"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock3, Sparkles, Target, X } from "lucide-react";
import { CopyButton, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { cx } from "@/lib/cx";
import { formatWeekInputValue } from "@/lib/schedule/iso-week";
import { COLLABORATORS, POST_KIND_LABEL } from "./constants";
import { FormatTagPicker } from "./format-tag-picker";
import { ScheduleDrawer } from "./schedule-drawer";
import type { AccountOption, CompanyOption, FormatTagOption, ScheduledPost } from "./types";

const EDIT_FORM_ID = "schedule-edit-form";

/**
 * Posted-status control — deliberately NOT a <form>. It used to be nested
 * inside the edit <form> below, which is invalid HTML: browsers flatten
 * nested forms, so its submit button was silently firing the outer form's
 * submit (Save) instead of this one. Plain state + a manual action() call
 * sidesteps the whole nested-form problem.
 */
function MarkPostedRow({
  post,
  markPostedAction,
  unmarkPostedAction,
}: {
  post: ScheduledPost;
  markPostedAction: (postId: string, formData: FormData) => Promise<void>;
  unmarkPostedAction: (postId: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(post.post_url ?? "");
  const [isPending, startTransition] = useTransition();

  function handleMark() {
    if (!url.trim()) {
      toast.error("Paste the live Reddit URL first.");
      return;
    }
    const formData = new FormData();
    formData.set("post_url", url.trim());
    startTransition(async () => {
      try {
        await markPostedAction(post.id, formData);
        toast.success("Marked as posted!");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to mark as posted.");
      }
    });
  }

  function handleUnmark() {
    startTransition(async () => {
      try {
        await unmarkPostedAction(post.id);
        toast.success("Unmarked.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to undo.");
      }
    });
  }

  if (post.is_posted) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Posted
          </span>
          {post.post_url && (
            <a
              href={post.post_url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs text-primary hover:underline"
            >
              {post.post_url}
            </a>
          )}
        </div>
        <button type="button" className={buttonClass("ghost", "sm")} onClick={handleUnmark} disabled={isPending}>
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" /> Not posted
      </span>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        type="url"
        placeholder="Paste the live Reddit URL…"
        className="flex-1"
      />
      <button type="button" className={buttonClass("secondary", "sm")} onClick={handleMark} disabled={isPending}>
        {isPending ? "Saving…" : "Mark posted"}
      </button>
    </div>
  );
}

function KindToggle({ defaultValue }: { defaultValue: "target" | "generic" }) {
  return (
    <div className="flex gap-2">
      {(["generic", "target"] as const).map((kind) => (
        <label key={kind} className="cursor-pointer">
          <input type="radio" name="post_kind" value={kind} defaultChecked={kind === defaultValue} className="peer sr-only" />
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors peer-checked:border-transparent",
              kind === "target"
                ? "peer-checked:bg-warning/15 peer-checked:text-warning"
                : "peer-checked:bg-secondary peer-checked:text-foreground",
            )}
          >
            {kind === "target" ? <Target className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {POST_KIND_LABEL[kind]}
          </span>
        </label>
      ))}
    </div>
  );
}

function CollaboratorToggle({ defaultValue }: { defaultValue: string | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className="cursor-pointer">
        <input type="radio" name="collaborator" value="" defaultChecked={!defaultValue} className="peer sr-only" />
        <span className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors peer-checked:border-transparent peer-checked:bg-secondary peer-checked:text-foreground">
          Unassigned
        </span>
      </label>
      {COLLABORATORS.map((c) => (
        <label key={c} className="cursor-pointer">
          <input type="radio" name="collaborator" value={c} defaultChecked={defaultValue === c} className="peer sr-only" />
          <span className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-checked:text-accent-foreground">
            {c}
          </span>
        </label>
      ))}
    </div>
  );
}

/** A single shared edit drawer instance, used by both the list and calendar views (rather than one per week group) — opened by setting `editing`, closed via `onClose`. */
export function EditScheduledPostDrawer({
  editing,
  onClose,
  companies,
  accounts,
  formatTags,
  updateAction,
  markPostedAction,
  unmarkPostedAction,
  createFormatTagAction,
}: {
  editing: ScheduledPost | null;
  onClose: () => void;
  companies: CompanyOption[];
  accounts: AccountOption[];
  formatTags: FormatTagOption[];
  updateAction: (postId: string, formData: FormData) => Promise<void>;
  markPostedAction: (postId: string, formData: FormData) => Promise<void>;
  unmarkPostedAction: (postId: string) => Promise<void>;
  createFormatTagAction: (formData: FormData) => Promise<FormatTagOption>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (editing) dialogRef.current?.showModal();
  }, [editing]);

  function close() {
    dialogRef.current?.close();
    onClose();
  }

  function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateAction(editing.id, formData);
        toast.success("Saved!");
        close();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  return (
    <ScheduleDrawer dialogRef={dialogRef} onClose={close}>
      {editing && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Editing</p>
              <h2 className="text-base font-semibold text-foreground">Scheduled post</h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-border/70 px-5 py-3">
            <MarkPostedRow post={editing} markPostedAction={markPostedAction} unmarkPostedAction={unmarkPostedAction} />
          </div>

          <form id={EDIT_FORM_ID} onSubmit={handleSave} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Kind</p>
              <KindToggle defaultValue={editing.post_kind} />
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Collaborator</p>
              <CollaboratorToggle defaultValue={editing.collaborator} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Company" htmlFor="ep-company">
                <Select id="ep-company" name="company_id" defaultValue={editing.company_id} required>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Week" htmlFor="ep-week" hint="ISO calendar week">
                <Input
                  id="ep-week"
                  name="week"
                  type="week"
                  defaultValue={formatWeekInputValue(editing.iso_year, editing.iso_week)}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Reddit account" htmlFor="ep-account">
                <Select id="ep-account" name="reddit_account_id" defaultValue={editing.reddit_account_id ?? ""}>
                  <option value="">Not chosen yet</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Planned date" htmlFor="ep-date" hint="Optional">
                <Input id="ep-date" name="planned_date" type="date" defaultValue={editing.planned_date ?? ""} />
              </Field>
            </div>

            <Field label="Title" htmlFor="ep-title">
              <Input id="ep-title" name="title" defaultValue={editing.title} required />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="ep-body" className="text-sm font-medium text-foreground">
                  Body copy
                </label>
                <CopyButton value={editing.body_copy} label="Copy" />
              </div>
              <Textarea id="ep-body" name="body_copy" rows={8} defaultValue={editing.body_copy} required />
            </div>
            <FormatTagPicker
              key={editing.id}
              tags={formatTags}
              defaultValue={editing.format_tag_id ?? ""}
              createAction={createFormatTagAction}
            />
            <Field label="Objective note" htmlFor="ep-objective" hint="Optional">
              <Textarea id="ep-objective" name="objective_note" rows={2} defaultValue={editing.objective_note ?? ""} />
            </Field>
          </form>

          <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={close}>
              Close
            </button>
            <button type="submit" form={EDIT_FORM_ID} className={buttonClass("primary", "sm")} disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </ScheduleDrawer>
  );
}
