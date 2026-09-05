"use client";

import { useRef, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";

type StaffMember = { id: string; display_name: string | null; email: string | null };
type RedditAccount = { id: string; account_name: string };

/**
 * Mirrors ManualCommentDialog (components/posts/manual-comment-dialog.tsx):
 * a native <dialog> for logging an original post staff already wrote and
 * published on Reddit themselves, without going through AI generation. The
 * row is inserted already marked posted, same one-step UX as a manual
 * comment.
 */
export function ManualPostDialog({
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
        toast.success("Post logged!");
        close();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to log post.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => dialogRef.current?.showModal()}>
        <Plus className="h-4 w-4" /> Log a manual post
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
            <h2 className="text-sm font-semibold text-foreground">Log a manual post</h2>
            <p className="text-xs text-muted-foreground">
              For an original post staff wrote and published on Reddit without AI generation —
              credit who posted it, and it counts toward this company&apos;s metrics just like a
              generated post.
            </p>
          </div>

          <Field label="Subreddit" htmlFor="manual-post-subreddit">
            <Input
              id="manual-post-subreddit"
              name="subreddit"
              required
              placeholder="subredditname"
              autoFocus
            />
          </Field>
          <Field label="Theme / topic" htmlFor="manual-post-theme">
            <Input id="manual-post-theme" name="theme" required placeholder="e.g. productivity tips" />
          </Field>
          <Field label="Title" htmlFor="manual-post-title">
            <Input id="manual-post-title" name="title" required />
          </Field>
          <Field label="Body" htmlFor="manual-post-body">
            <Textarea id="manual-post-body" name="body" rows={4} required />
          </Field>
          <Field label="Posted by" htmlFor="manual-post-posted-by">
            <Select id="manual-post-posted-by" name="posted_by" defaultValue={currentUserId ?? ""} required>
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
              <Field label="Reddit account" htmlFor="manual-post-reddit-account">
                <Select id="manual-post-reddit-account" name="reddit_account_id" defaultValue="">
                  <option value="">No account tracked</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      u/{a.account_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type" htmlFor="manual-post-type">
                <Select id="manual-post-type" name="post_type" defaultValue="generic">
                  <option value="generic">Generic</option>
                  <option value="contribuites">Contribuites</option>
                  <option value="target">Target — mentions the company</option>
                </Select>
              </Field>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={close}>
              Cancel
            </button>
            <button type="submit" className={buttonClass("secondary", "sm")} disabled={isPending}>
              {isPending ? "Logging…" : "Log post"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
