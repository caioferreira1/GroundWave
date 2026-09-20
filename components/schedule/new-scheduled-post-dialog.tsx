"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Sparkles, Target, X } from "lucide-react";
import { Button, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { cx } from "@/lib/cx";
import { COLLABORATORS, POST_KIND_LABEL } from "./constants";
import { FormatTagPicker } from "./format-tag-picker";
import { ScheduleDrawer } from "./schedule-drawer";
import type { AccountOption, CompanyOption, FormatTagOption } from "./types";

const FORM_ID = "new-scheduled-post-form";

export function NewScheduledPostDialog({
  action,
  companies,
  accounts,
  formatTags,
  createFormatTagAction,
}: {
  action: (formData: FormData) => Promise<void>;
  companies: CompanyOption[];
  accounts: AccountOption[];
  formatTags: FormatTagOption[];
  createFormatTagAction: (formData: FormData) => Promise<FormatTagOption>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  // Bumped every time the drawer opens, so FormatTagPicker (which owns its
  // own controlled state) remounts fresh instead of keeping the last
  // post's selection — formRef.reset() only resets native uncontrolled
  // fields, not React state.
  const [formInstance, setFormInstance] = useState(0);

  function close() {
    dialogRef.current?.close();
    formRef.current?.reset();
  }

  function open() {
    setFormInstance((n) => n + 1);
    dialogRef.current?.showModal();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await action(formData);
        toast.success("Post scheduled!");
        close();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to schedule post.");
      }
    });
  }

  return (
    <>
      <Button type="button" onClick={open}>
        <Plus className="h-4 w-4" /> New post
      </Button>

      <ScheduleDrawer dialogRef={dialogRef} onClose={close}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">New</p>
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

          <form
            id={FORM_ID}
            ref={formRef}
            onSubmit={handleSubmit}
            className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
          >
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Kind</p>
              <div className="flex gap-2">
                {(["generic", "target"] as const).map((kind) => (
                  <label key={kind} className="cursor-pointer">
                    <input type="radio" name="post_kind" value={kind} defaultChecked={kind === "generic"} className="peer sr-only" />
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
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Collaborator</p>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer">
                  <input type="radio" name="collaborator" value="" defaultChecked className="peer sr-only" />
                  <span className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors peer-checked:border-transparent peer-checked:bg-secondary peer-checked:text-foreground">
                    Unassigned
                  </span>
                </label>
                {COLLABORATORS.map((c) => (
                  <label key={c} className="cursor-pointer">
                    <input type="radio" name="collaborator" value={c} className="peer sr-only" />
                    <span className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-checked:text-accent-foreground">
                      {c}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Company" htmlFor="sp-company">
                <Select id="sp-company" name="company_id" defaultValue="" required>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Week" htmlFor="sp-week" hint="ISO calendar week">
                <Input id="sp-week" name="week" type="week" required />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Reddit account" htmlFor="sp-account">
                <Select id="sp-account" name="reddit_account_id" defaultValue="">
                  <option value="">Not chosen yet</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Planned date" htmlFor="sp-date" hint="Optional">
                <Input id="sp-date" name="planned_date" type="date" />
              </Field>
            </div>

            <Field label="Title" htmlFor="sp-title">
              <Input id="sp-title" name="title" required autoFocus />
            </Field>
            <Field label="Body copy" htmlFor="sp-body">
              <Textarea id="sp-body" name="body_copy" rows={6} required />
            </Field>
            <FormatTagPicker
              key={formInstance}
              tags={formatTags}
              defaultValue=""
              createAction={createFormatTagAction}
            />
            <Field label="Objective note" htmlFor="sp-objective" hint="Optional">
              <Textarea id="sp-objective" name="objective_note" rows={2} />
            </Field>
          </form>

          <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={close}>
              Cancel
            </button>
            <button type="submit" form={FORM_ID} className={buttonClass("primary", "sm")} disabled={isPending}>
              {isPending ? "Scheduling…" : "Schedule post"}
            </button>
          </div>
        </div>
      </ScheduleDrawer>
    </>
  );
}
