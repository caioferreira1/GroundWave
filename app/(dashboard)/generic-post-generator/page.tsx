import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCompaniesForAccounts } from "@/lib/activity/accounts";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeading } from "@/components/ui";
import { GenerationPanel } from "@/components/post-generator/generation-panel";
import { PostGenerationCard } from "@/components/post-generator/post-generation-card";
import { HistoryList } from "@/components/post-generator/history-list";
import { SubredditsManager } from "@/components/post-generator/subreddits-manager";
import type { PostGenerationActions, PostGenerationRow } from "@/components/post-generator/types";
import {
  generatePost,
  deletePostGeneration,
  addGenericSubreddit,
  removeGenericSubreddit,
  markPostGenerationPosted,
  unmarkPostGenerationPosted,
  setPostGenerationViews,
} from "./actions";

export default async function GenericPostGeneratorPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roles } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id)
    : { data: [] };
  const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "coworker");

  const { data } = await supabase
    .from("post_generations")
    .select("id, subreddit, theme, title, body, created_at, posted_at, posted_by, views_count, reddit_account_id, post_type")
    .eq("mode", "generic")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: genericSettings } = isStaff
    ? await supabase.from("generic_post_generator_settings").select("subreddits").eq("id", 1).maybeSingle()
    : { data: null };

  // Who's eligible to be credited as "posted this", and every company's
  // active Reddit accounts (each labeled with the company/companies it's
  // linked to — an account can belong to more than one, see
  // components/post-generator/posted-status.tsx) — mirrors the equivalent
  // lookups on the company post-generator page, just not scoped to one
  // company since a standalone generic post can be posted with any
  // company's account.
  const { data: profiles } = isStaff ? await supabase.from("profiles").select("id, display_name, email") : { data: [] };
  const { data: staffRoles } = isStaff
    ? await supabase.from("user_roles").select("user_id").in("role", ["admin", "coworker"])
    : { data: [] };
  const staffIds = new Set((staffRoles ?? []).map((r) => r.user_id));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));
  const staffMembers = (profiles ?? []).filter((p) => staffIds.has(p.id));

  const { data: redditAccounts } = isStaff
    ? await supabase.from("reddit_accounts").select("id, account_name, is_active").order("account_name", { ascending: true })
    : { data: [] };
  const companiesByAccount = isStaff
    ? await getCompaniesForAccounts(supabase, (redditAccounts ?? []).map((a) => a.id))
    : new Map<string, { id: string; name: string }[]>();
  const accountNameById = new Map((redditAccounts ?? []).map((a) => [a.id, a.account_name]));
  const activeAccounts = (redditAccounts ?? [])
    .filter((a) => a.is_active)
    .map((a) => ({
      id: a.id,
      account_name: a.account_name,
      company_names: (companiesByAccount.get(a.id) ?? []).map((c) => c.name),
    }));

  const posts: PostGenerationRow[] = (data ?? []).map((row) => ({
    id: row.id,
    subreddit: row.subreddit,
    theme: row.theme,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    posted_at: row.posted_at,
    posted_by_display_name: row.posted_by ? (profileMap.get(row.posted_by) ?? "unknown") : null,
    reddit_account_name: row.reddit_account_id ? (accountNameById.get(row.reddit_account_id) ?? "unknown") : null,
    post_type: row.post_type,
    views_count: row.views_count,
  }));
  const [featured, ...history] = posts;

  const postGenerationActions: PostGenerationActions = {
    isStaff,
    staffMembers,
    currentUserId: user?.id ?? null,
    accounts: activeAccounts,
    markPostedAction: markPostGenerationPosted,
    unmarkPostedAction: unmarkPostGenerationPosted,
    setViewsAction: setPostGenerationViews,
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Post Generator"
        description="Generate authentic Reddit posts with AI. Each one picks a random subreddit and theme, no company targeting."
      />

      {isStaff ? (
        <Card>
          <CardHeader>
            <CardTitle>Subreddits</CardTitle>
          </CardHeader>
          <CardContent>
            <SubredditsManager
              subreddits={genericSettings?.subreddits ?? []}
              addAction={addGenericSubreddit}
              removeAction={removeGenericSubreddit}
            />
          </CardContent>
        </Card>
      ) : null}

      {isStaff ? (
        <GenerationPanel action={generatePost} hasFeatured={Boolean(featured)}>
          {featured ? (
            <div className="space-y-6">
              <PostGenerationCard post={featured} actions={postGenerationActions} />
              <HistoryList posts={history} deleteAction={deletePostGeneration} actions={postGenerationActions} />
            </div>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No posts yet"
              description='Click "Generate Post" to create your first Reddit post.'
            />
          )}
        </GenerationPanel>
      ) : featured ? (
        <PostGenerationCard post={featured} />
      ) : (
        <EmptyState icon={Sparkles} title="No posts yet" description="No Reddit posts have been generated yet." />
      )}
    </div>
  );
}
