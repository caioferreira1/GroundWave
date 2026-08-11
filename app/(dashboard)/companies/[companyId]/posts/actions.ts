"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateReply } from "@/lib/ai/reply-generator";

/**
 * Records the staff verdict on a post's relevance and always logs it as a
 * classifier_example (few-shot ground truth for that company's next
 * classifications) — regardless of whether it agrees with the AI's verdict,
 * since a human call is ground truth either way.
 */
export async function setHumanVerdict(
  companyId: string,
  postId: string,
  verdict: "relevant" | "irrelevant",
) {
  const { user } = await requireStaff();

  const supabase = await createClient();
  const { data: post, error } = await supabase
    .from("posts")
    .update({
      human_verdict: verdict,
      human_verdict_by: user.id,
      human_verdict_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .select("company_id, content")
    .single();
  if (error) throw new Error(error.message);
  if (!post.company_id || post.content === null) return;

  const { error: exampleError } = await supabase.from("classifier_examples").insert({
    company_id: post.company_id,
    post_id: postId,
    content: post.content,
    correct_is_relevant: verdict === "relevant",
  });
  if (exampleError) throw new Error(exampleError.message);

  revalidatePath(`/companies/${companyId}/posts`);
}

/**
 * Runs the persona-aware reply generator for one post. `formData.persona_id`
 * is an optional manual override (empty string = let the AI pick from the
 * company's active persona catalog).
 */
export async function generateComment(companyId: string, postId: string, formData: FormData) {
  await requireStaff();

  const personaId = String(formData.get("persona_id") ?? "").trim() || undefined;
  await generateReply(postId, personaId ? { personaId } : undefined);

  revalidatePath(`/companies/${companyId}/posts`);
}

/** Saves a staff hand edit to the draft without calling the AI again. */
export async function saveGeneratedComment(companyId: string, postId: string, formData: FormData) {
  await requireStaff();

  const comment = String(formData.get("generated_comment") ?? "").trim();
  if (!comment) throw new Error("Comment cannot be empty");

  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({ generated_comment: comment })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/posts`);
}

/**
 * The poster is a manual choice (formData.posted_by), not necessarily the
 * staff member clicking the button — someone else's Reddit account may have
 * been used to post the reply. Recorded for future per-poster metrics.
 */
export async function markCommentPosted(companyId: string, postId: string, formData: FormData) {
  const { user } = await requireStaff();

  const postedBy = String(formData.get("posted_by") ?? "").trim() || user.id;

  const supabase = await createClient();
  const { data: posterRoles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", postedBy)
    .in("role", ["admin", "coworker"]);
  if (roleError) throw new Error(roleError.message);
  if (!posterRoles || posterRoles.length === 0) throw new Error("Selected user is not a staff member");

  const { error } = await supabase
    .from("posts")
    .update({ comment_posted_at: new Date().toISOString(), comment_posted_by: postedBy })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/posts`);
}

/**
 * Logs a comment staff already posted on a Reddit thread that never went
 * through ingestion/AI classification — e.g. one they found and replied to
 * organically. Just the link, the comment text, and who posted it; writes a
 * `posts` row with comment_posted_at/comment_generated_at set immediately
 * (it's already live by the time this form is submitted) so it flows into
 * the same "comments posted" / "reported views" metrics as AI-assisted
 * replies (see lib/analytics/queries.ts) without needing author/content of
 * the original post, which staff never pasted in.
 */
export async function addManualComment(companyId: string, formData: FormData) {
  const { user } = await requireStaff();

  const url = String(formData.get("url") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim();
  const postedBy = String(formData.get("posted_by") ?? "").trim() || user.id;
  if (!url) throw new Error("Reddit post URL is required");
  if (!comment) throw new Error("Comment is required");

  const supabase = await createClient();
  const { data: posterRoles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", postedBy)
    .in("role", ["admin", "coworker"]);
  if (roleError) throw new Error(roleError.message);
  if (!posterRoles || posterRoles.length === 0) throw new Error("Selected user is not a staff member");

  const subreddit = url.match(/reddit\.com\/r\/([^/]+)/i)?.[1] ?? null;
  const now = new Date().toISOString();

  const { error } = await supabase.from("posts").insert({
    company_id: companyId,
    url,
    subreddit,
    is_manual: true,
    ai_status: "processed",
    is_relevant: true,
    generated_comment: comment,
    comment_generated_at: now,
    comment_posted_at: now,
    comment_posted_by: postedBy,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/posts`);
}

export async function unmarkCommentPosted(companyId: string, postId: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({ comment_posted_at: null, comment_posted_by: null })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/posts`);
}

/** Manually-reported view count on a posted comment — Reddit's API doesn't expose this. */
export async function setCommentViews(companyId: string, postId: string, formData: FormData) {
  await requireStaff();

  const raw = String(formData.get("comment_views_count") ?? "").trim();
  const viewsCount = raw === "" ? null : Number(raw);
  if (viewsCount !== null && (!Number.isInteger(viewsCount) || viewsCount < 0)) {
    throw new Error("Views must be a non-negative whole number");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({ comment_views_count: viewsCount })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/posts`);
}
