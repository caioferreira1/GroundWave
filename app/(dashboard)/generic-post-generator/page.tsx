import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeading } from "@/components/ui";
import { GenerationPanel } from "@/components/post-generator/generation-panel";
import { PostGenerationCard } from "@/components/post-generator/post-generation-card";
import { HistoryList } from "@/components/post-generator/history-list";
import type { PostGenerationRow } from "@/components/post-generator/types";
import { generatePost, deletePostGeneration } from "./actions";

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
    .select("id, subreddit, theme, title, body, created_at")
    .eq("mode", "generic")
    .order("created_at", { ascending: false })
    .limit(20);

  const posts: PostGenerationRow[] = (data ?? []).map((row) => ({
    ...row,
    posted_at: null,
    posted_by_display_name: null,
    reddit_account_name: null,
    post_type: null,
    views_count: null,
  }));
  const [featured, ...history] = posts;

  return (
    <div className="space-y-6">
      <PageHeading
        title="Post Generator"
        description="Generate authentic Reddit posts with AI. Each one picks a random subreddit and theme, no company targeting."
      />

      {isStaff ? (
        <GenerationPanel action={generatePost} hasFeatured={Boolean(featured)}>
          {featured ? (
            <div className="space-y-6">
              <PostGenerationCard post={featured} />
              <HistoryList posts={history} deleteAction={deletePostGeneration} />
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
