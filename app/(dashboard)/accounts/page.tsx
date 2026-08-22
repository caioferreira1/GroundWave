import { Users } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardContent, EmptyState, Field, Input, PageHeading, Select, SubmitButton, Switch } from "@/components/ui";
import { CategoryBarChart } from "@/components/analytics/category-bar-chart";
import { ChartLegend } from "@/components/analytics/legend";
import { AddAccountMenu } from "@/components/accounts/add-account-menu";
import {
  createRedditAccount,
  linkAccountToCompany,
  unlinkAccountFromCompany,
  updateRedditAccount,
} from "./actions";

type Metric = { posts: number; comments: number };

function addMetric(map: Map<string, Metric>, key: string, field: keyof Metric) {
  const entry = map.get(key) ?? { posts: 0, comments: 0 };
  entry[field] += 1;
  map.set(key, entry);
}

function addCompanyMetric(map: Map<string, Map<string, Metric>>, accountId: string, companyId: string, field: keyof Metric) {
  const byCompany = map.get(accountId) ?? new Map<string, Metric>();
  const entry = byCompany.get(companyId) ?? { posts: 0, comments: 0 };
  entry[field] += 1;
  byCompany.set(companyId, entry);
  map.set(accountId, byCompany);
}

const activityLegend = [
  { label: "Posts", color: "var(--color-primary)" },
  { label: "Comments", color: "var(--color-accent-2)" },
];

export default async function AccountsPage() {
  await requireStaff();

  const supabase = await createClient();

  const [
    { data: accounts },
    { data: links },
    { data: companies },
    { data: profiles },
    { data: staffRoles },
    { data: postGenerations },
    { data: comments },
  ] = await Promise.all([
    supabase
      .from("reddit_accounts")
      .select("id, account_name, karma, owner_user_id, is_active")
      .order("account_name", { ascending: true }),
    supabase.from("reddit_account_companies").select("reddit_account_id, company_id"),
    supabase.from("companies").select("id, name").order("name", { ascending: true }),
    supabase.from("profiles").select("id, display_name, email"),
    supabase.from("user_roles").select("user_id").in("role", ["admin", "coworker"]),
    supabase
      .from("post_generations")
      .select("reddit_account_id, company_id, post_type")
      .not("posted_at", "is", null)
      .not("reddit_account_id", "is", null),
    supabase
      .from("posts")
      .select("reddit_account_id, company_id, comment_type")
      .not("comment_posted_at", "is", null)
      .not("reddit_account_id", "is", null),
  ]);

  const staffIds = new Set((staffRoles ?? []).map((r) => r.user_id));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));
  const staffMembers = (profiles ?? []).filter((p) => staffIds.has(p.id));
  const companyNameById = new Map((companies ?? []).map((c) => [c.id, c.name]));

  const companiesByAccount = new Map<string, string[]>();
  for (const link of links ?? []) {
    const list = companiesByAccount.get(link.reddit_account_id) ?? [];
    list.push(link.company_id);
    companiesByAccount.set(link.reddit_account_id, list);
  }

  // Generic activity is account-level, not company-level — it's cover
  // content/comments keeping the account looking organic, regardless of
  // which company's flow happened to generate it. Target/company-mention
  // activity is the actual work product, broken out per linked company.
  const genericByAccount = new Map<string, Metric>();
  const targetByAccountCompany = new Map<string, Map<string, Metric>>();

  for (const row of postGenerations ?? []) {
    if (!row.reddit_account_id) continue;
    if (row.post_type === "generic") {
      addMetric(genericByAccount, row.reddit_account_id, "posts");
    } else if (row.post_type === "company_mention" && row.company_id) {
      addCompanyMetric(targetByAccountCompany, row.reddit_account_id, row.company_id, "posts");
    }
  }
  for (const row of comments ?? []) {
    if (!row.reddit_account_id) continue;
    if (row.comment_type === "generic") {
      addMetric(genericByAccount, row.reddit_account_id, "comments");
    } else if (row.comment_type === "target" && row.company_id) {
      addCompanyMetric(targetByAccountCompany, row.reddit_account_id, row.company_id, "comments");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeading
        title="Accounts"
        description="Every Reddit account across every company — who owns each one, which companies it's linked to, and its generic vs. per-company target activity."
        action={<AddAccountMenu action={createRedditAccount} staffMembers={staffMembers} companies={companies ?? []} />}
      />

      {(accounts ?? []).length > 0 ? (
        <div className="space-y-3">
          {(accounts ?? []).map((account) => {
            const linkedCompanyIds = companiesByAccount.get(account.id) ?? [];
            const unlinkedCompanies = (companies ?? []).filter((c) => !linkedCompanyIds.includes(c.id));
            const generic = genericByAccount.get(account.id);
            const targetByCompany = targetByAccountCompany.get(account.id);

            const chartData = [
              { label: "Generic", posts: generic?.posts ?? 0, comments: generic?.comments ?? 0 },
              ...linkedCompanyIds.map((companyId) => {
                const metric = targetByCompany?.get(companyId);
                return {
                  label: companyNameById.get(companyId) ?? "Unknown company",
                  posts: metric?.posts ?? 0,
                  comments: metric?.comments ?? 0,
                };
              }),
            ];
            const hasActivity = chartData.some((d) => d.posts > 0 || d.comments > 0);

            return (
              <Card key={account.id}>
                <CardContent className="space-y-4">
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
                    action={updateRedditAccount.bind(null, account.id)}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <Field label="Karma" htmlFor={`karma-${account.id}`} className="w-28">
                      <Input id={`karma-${account.id}`} name="karma" type="number" min={0} defaultValue={account.karma} />
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

                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Companies</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {linkedCompanyIds.length === 0 && (
                        <span className="text-xs text-muted-foreground">Not linked to any company yet.</span>
                      )}
                      {linkedCompanyIds.map((companyId) => (
                        <form key={companyId} action={unlinkAccountFromCompany.bind(null, account.id, companyId)}>
                          <Badge variant="accent" className="gap-1.5">
                            {companyNameById.get(companyId) ?? "Unknown company"}
                            <button type="submit" aria-label="Unlink" className="text-accent-foreground/60 hover:text-accent-foreground">
                              ×
                            </button>
                          </Badge>
                        </form>
                      ))}
                    </div>
                    {unlinkedCompanies.length > 0 && (
                      <form action={linkAccountToCompany.bind(null, account.id)} className="flex items-center gap-2">
                        <Select name="company_id" defaultValue="" required className="h-8 w-auto text-xs">
                          <option value="" disabled>
                            Link to a company…
                          </option>
                          {unlinkedCompanies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton variant="ghost" size="sm" pendingText="Linking…">
                          Link
                        </SubmitButton>
                      </form>
                    )}
                  </div>

                  <div className="border-t border-border pt-3">
                    <div className="flex items-center justify-between pb-1">
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Activity</p>
                      {hasActivity && <ChartLegend items={activityLegend} />}
                    </div>
                    {hasActivity ? (
                      <div className="h-[100px]">
                        <CategoryBarChart
                          data={chartData}
                          series={[
                            { key: "posts", name: "Posts", color: "var(--color-primary)" },
                            { key: "comments", name: "Comments", color: "var(--color-accent-2)" },
                          ]}
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No posted activity yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Users} title="No accounts yet" description="Add a Reddit account above to get started." />
      )}
    </div>
  );
}
