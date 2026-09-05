import { Badge, Input, Select, SubmitButton } from "@/components/ui";
import type { PostGenerationActions, PostGenerationRow } from "./types";

function accountLabel(account: { account_name: string; company_names?: string[] }): string {
  if (!account.company_names || account.company_names.length === 0) return `u/${account.account_name}`;
  return `u/${account.account_name} (${account.company_names.join(", ")})`;
}

/**
 * Shared by the featured card and each history item — mark-as-posted +
 * manually-reported views, mirroring the equivalent block in
 * app/(dashboard)/companies/[companyId]/posts/page.tsx for comment replies.
 * Only rendered when `actions` is passed. On the company post-generator,
 * `actions.accounts` is scoped to the current company; on the generic
 * post-generator, it spans every company's accounts, each labeled with the
 * company/companies it's linked to (an account can belong to more than one)
 * since the account chosen is what attributes a generic post to a company's
 * weekly goal and dashboard.
 */
export function PostedStatus({
  post,
  actions,
}: {
  post: PostGenerationRow;
  actions: PostGenerationActions;
}) {
  if (!actions.isStaff) return null;

  const crossCompanyPicker = actions.accounts.some((a) => a.company_names);

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      {post.posted_at ? (
        <>
          <Badge variant="good">
            Posted{post.posted_by_display_name && ` by ${post.posted_by_display_name}`}
            {post.reddit_account_name && ` · u/${post.reddit_account_name}`}
            {post.post_type &&
              ` · ${post.post_type === "target" ? "target" : post.post_type === "contribuites" ? "contribuites" : "generic"}`}
          </Badge>
          <form action={actions.unmarkPostedAction.bind(null, post.id)}>
            <SubmitButton variant="ghost" size="sm" pendingText="Unmarking…">
              Unmark as posted
            </SubmitButton>
          </form>
          <form action={actions.setViewsAction.bind(null, post.id)} className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor={`views-${post.id}`}>
              Views
            </label>
            <Input
              id={`views-${post.id}`}
              type="number"
              name="views_count"
              min={0}
              defaultValue={post.views_count ?? ""}
              className="h-8 w-24 text-xs"
            />
            <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
              Save
            </SubmitButton>
          </form>
        </>
      ) : (
        <form action={actions.markPostedAction.bind(null, post.id)} className="flex flex-wrap items-center gap-2">
          <Select
            name="posted_by"
            defaultValue={actions.currentUserId ?? ""}
            required
            className="h-8 w-auto text-xs"
          >
            <option value="" disabled>
              Who posted this?
            </option>
            {actions.staffMembers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name ?? s.email}
              </option>
            ))}
          </Select>
          {actions.accounts.length > 0 && (
            <>
              <Select name="reddit_account_id" defaultValue="" required className="h-8 w-auto text-xs">
                <option value="" disabled>
                  Which account?
                </option>
                {actions.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </Select>
              <Select
                name="post_type"
                defaultValue={crossCompanyPicker ? "generic" : "target"}
                className="h-8 w-auto text-xs"
              >
                <option value="target">Target — mentions the company</option>
                <option value="contribuites">Contribuites</option>
                <option value="generic">Generic</option>
              </Select>
            </>
          )}
          <SubmitButton variant="secondary" size="sm" pendingText="Marking…">
            Mark as posted
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
