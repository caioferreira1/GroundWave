"use client";

import { useRef, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";

type StaffMember = { id: string; display_name: string | null; email: string | null };
type RedditAccount = { id: string; account_name: string };

/**
 * Native <dialog> instead of a custom overlay component — showModal() gives
 * us centering, focus trap, and Esc-to-close for free, no extra dependency
 * needed for what is currently this app's only modal.
 */
export function ManualCommentDialog({
  action,
  staffMembers,
  currentUserId,
  accounts,
}: {
  action: (formData: FormData) => Promise<void>;
  staffMembers: StaffMember[];
  currentUserId: string | null;
  accounts: RedditAccount[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    dialogRef.current?.close();
    formRef.current?.reset();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await action(formData);
        toast.success("Comment logged!");
        close();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to log comment.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => dialogRef.current?.showModal()}>
        <Plus className="h-4 w-4" /> Log a manual comment
      </Button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        onCancel={close}
        className="fixed top-1/2 left-1/2 m-0 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/20 backdrop:backdrop-blur-sm"
      >
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Log a manual comment</h2>
            <p className="text-xs text-muted-foreground">
              For a reply posted on a thread we never ingested or classified — paste the link and
              the comment, credit who posted it, and it counts toward this company&apos;s metrics
              just like an AI-assisted reply.
            </p>
          </div>

          <Field label="Reddit post URL" htmlFor="manual-url">
            <Input
              id="manual-url"
              name="url"
              type="url"
              required
              placeholder="https://reddit.com/r/..."
              autoFocus
            />
          </Field>
          <Field label="Our comment" htmlFor="manual-comment">
            <Textarea id="manual-comment" name="comment" rows={3} required />
          </Field>
          <Field label="Posted by" htmlFor="manual-posted-by">
            <Select id="manual-posted-by" name="posted_by" defaultValue={currentUserId ?? ""} required>
              <option value="" disabled>
                Who posted this?
              </option>
              {staffMembers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name ?? s.email}
                </option>
              ))}
            </Select>
          </Field>

          {accounts.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reddit account" htmlFor="manual-reddit-account">
                <Select id="manual-reddit-account" name="reddit_account_id" defaultValue="">
                  <option value="">No account tracked</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      u/{a.account_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type" htmlFor="manual-comment-type">
                <Select id="manual-comment-type" name="comment_type" defaultValue="generic">
                  <option value="generic">Generic</option>
                  <option value="target">Target (mentions/contributes)</option>
                </Select>
              </Field>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={close}>
              Cancel
            </button>
            <button type="submit" className={buttonClass("secondary", "sm")} disabled={isPending}>
              {isPending ? "Logging…" : "Log comment"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
