import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeading } from "@/components/ui";
import { GenerationPanel } from "@/components/post-generator/generation-panel";
import { PostGenerationCard } from "@/components/post-generator/post-generation-card";
import { HistoryList } from "@/components/post-generator/history-list";
import type { PostGenerationActions, PostGenerationRow } from "@/components/post-generator/types";
import {
  generatePost,
  deletePostGeneration,
  markPostGenerationPosted,
  unmarkPostGenerationPosted,
  setPostGenerationViews,
} from "./actions";

export default async function CompanyPostGeneratorPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roles } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id)
    : { data: [] };
  const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "coworker");

  const { data: generations } = await supabase
    .from("post_generations")
    .select("id, subreddit, theme, title, body, created_at, persona_id, posted_at, posted_by, views_count")
    .eq("mode", "company")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(20);

  const personaIds = [...new Set((generations ?? []).map((g) => g.persona_id).filter((id): id is string => Boolean(id)))];
  const { data: personas } =
    personaIds.length > 0
      ? await supabase.from("personas").select("id, display_name").in("id", personaIds)
      : { data: [] };
  const personaNameById = new Map((personas ?? []).map((p) => [p.id, p.display_name]));

  // Who's eligible to be credited as "posted this" — staff only, mirrors the
  // equivalent lookup on the Posts page's reply flow.
  const { data: profiles } = await supabase.from("profiles").select("id, display_name, email");
  const { data: staffRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "coworker"]);
  const staffIds = new Set((staffRoles ?? []).map((r) => r.user_id));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));
  const staffMembers = (profiles ?? []).filter((p) => staffIds.has(p.id));

  const posts: PostGenerationRow[] = (generations ?? []).map((row) => ({
    id: row.id,
    subreddit: row.subreddit,
    theme: row.theme,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    persona_display_name: row.persona_id ? (personaNameById.get(row.persona_id) ?? null) : null,
    posted_at: row.posted_at,
    posted_by_display_name: row.posted_by ? (profileMap.get(row.posted_by) ?? "unknown") : null,
    views_count: row.views_count,
  }));
  const [featured, ...history] = posts;

  const boundGenerate = generatePost.bind(null, companyId);
  const boundDelete = deletePostGeneration.bind(null, companyId);

  const postGenerationActions: PostGenerationActions = {
    isStaff,
    staffMembers,
    currentUserId: user?.id ?? null,
    markPostedAction: markPostGenerationPosted.bind(null, companyId),
    unmarkPostedAction: unmarkPostGenerationPosted.bind(null, companyId),
    setViewsAction: setPostGenerationViews.bind(null, companyId),
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Post Generator"
        description="Generate original Reddit posts for this company's suggested subreddits, calibrated to an active persona when one fits."
      />

      {isStaff ? (
        <GenerationPanel action={boundGenerate} hasFeatured={Boolean(featured)}>
          {featured ? (
            <div className="space-y-6">
              <PostGenerationCard post={featured} actions={postGenerationActions} />
              <HistoryList posts={history} deleteAction={boundDelete} actions={postGenerationActions} />
            </div>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No posts yet"
              description='Click "Generate Post" to create the first Reddit post for this company.'
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
