import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeading,
  Select,
  SubmitButton,
  Switch,
} from "@/components/ui";
import { createRedditAccount, updateActivityGoals, updateRedditAccount } from "./actions";

export default async function CompanyAccountsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, activity_generic_comments_per_week, activity_target_comments_per_week, activity_generic_post_interval_days, activity_company_post_per_week, activity_generic_posts_before_target",
    )
    .eq("id", companyId)
    .maybeSingle();
  if (!company) notFound();

  const [{ data: accounts }, { data: profiles }, { data: staffRoles }] = await Promise.all([
    supabase
      .from("reddit_accounts")
      .select("id, account_name, karma, owner_user_id, is_active")
      .eq("company_id", companyId)
      .order("account_name", { ascending: true }),
    supabase.from("profiles").select("id, display_name, email"),
    supabase.from("user_roles").select("user_id").in("role", ["admin", "coworker"]),
  ]);

  const staffIds = new Set((staffRoles ?? []).map((r) => r.user_id));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));
  const staffMembers = (profiles ?? []).filter((p) => staffIds.has(p.id));

  const goalsAction = updateActivityGoals.bind(null, companyId);
  const createAction = createRedditAccount.bind(null, companyId);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeading
        title="Reddit Accounts"
        description="Accounts dedicated to this company, who owns each one, and the weekly activity goals used to compute Today's tasks."
      />

      <form action={goalsAction}>
        <Card>
          <CardHeader>
            <CardTitle>Weekly activity goals</CardTitle>
            <CardDescription>
              Most fields below are a company-wide weekly total, split evenly across active accounts (remainder goes
              to the higher-karma accounts) — except &quot;Generic posts before 1 target post&quot;, which applies to
              each account individually. Drives the Today&apos;s tasks panel on Overview.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Generic comments / week" htmlFor="activity_generic_comments_per_week">
                <Input
                  id="activity_generic_comments_per_week"
                  name="activity_generic_comments_per_week"
                  type="number"
                  min={0}
                  defaultValue={company.activity_generic_comments_per_week}
                />
              </Field>
              <Field
                label="Target comments / week"
                htmlFor="activity_target_comments_per_week"
                hint="Comments mentioning or contributing on this company's target posts."
              >
                <Input
                  id="activity_target_comments_per_week"
                  name="activity_target_comments_per_week"
                  type="number"
                  min={0}
                  defaultValue={company.activity_target_comments_per_week}
                />
              </Field>
              <Field
                label="Generic post every (days)"
                htmlFor="activity_generic_post_interval_days"
                hint="Each account should make a generic post at least this often."
              >
                <Input
                  id="activity_generic_post_interval_days"
                  name="activity_generic_post_interval_days"
                  type="number"
                  min={1}
                  defaultValue={company.activity_generic_post_interval_days}
                />
              </Field>
              <Field
                label="Company-mention posts / week"
                htmlFor="activity_company_post_per_week"
                hint="Rotates which account does it, picking whoever's gone longest without one."
              >
                <Input
                  id="activity_company_post_per_week"
                  name="activity_company_post_per_week"
                  type="number"
                  min={0}
                  defaultValue={company.activity_company_post_per_week}
                />
              </Field>
              <Field
                label="Generic posts before 1 target post (per account)"
                htmlFor="activity_generic_posts_before_target"
                hint="Per account, not split like the fields above: each individual account needs this many generic posts since its own last target post before it's picked for the next one. 0 = no gate. As a last resort, an account can be picked at 70% of this if no account has fully cleared it."
              >
                <Input
                  id="activity_generic_posts_before_target"
                  name="activity_generic_posts_before_target"
                  type="number"
                  min={0}
                  defaultValue={company.activity_generic_posts_before_target}
                />
              </Field>
            </div>
            <SubmitButton pendingText="Saving…">Save goals</SubmitButton>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Add an account</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Account name" htmlFor="account_name">
                <Input id="account_name" name="account_name" placeholder="u/..." required />
              </Field>
              <Field label="Starting karma" htmlFor="karma">
                <Input id="karma" name="karma" type="number" min={0} defaultValue={0} />
              </Field>
            </div>
            <Field label="Owner" htmlFor="owner_user_id">
              <Select id="owner_user_id" name="owner_user_id" defaultValue="" required>
                <option value="" disabled>
                  Who owns this account?
                </option>
                {staffMembers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name ?? s.email}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton variant="secondary" pendingText="Adding…">
              Add account
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {(accounts ?? []).length > 0 ? (
        <div className="space-y-3">
          {(accounts ?? []).map((account) => (
            <Card key={account.id}>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{account.account_name}</p>
                  <Badge variant={account.is_active ? "good" : "neutral"}>
                    {account.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Owned by {profileMap.get(account.owner_user_id) ?? "unknown"}
                  </span>
                </div>
                <form
                  action={updateRedditAccount.bind(null, companyId, account.id)}
                  className="flex flex-wrap items-end gap-3"
                >
                  <Field label="Karma" htmlFor={`karma-${account.id}`} className="w-28">
                    <Input
                      id={`karma-${account.id}`}
                      name="karma"
                      type="number"
                      min={0}
                      defaultValue={account.karma}
                    />
                  </Field>
                  <Field label="Owner" htmlFor={`owner-${account.id}`} className="min-w-48">
                    <Select id={`owner-${account.id}`} name="owner_user_id" defaultValue={account.owner_user_id} required>
                      {staffMembers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.display_name ?? s.email}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Switch name="is_active" defaultChecked={account.is_active} label="Active" />
                  <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                    Save
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="No accounts yet"
          description="Add this company's dedicated Reddit accounts above to start tracking weekly activity."
        />
      )}
    </div>
  );
}
