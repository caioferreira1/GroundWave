"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generatePostGeneration } from "@/lib/ai/post-generator";

export async function generatePost() {
  const { user } = await requireStaff();

  const generation = await generatePostGeneration({ mode: "generic", createdBy: user.id });

  revalidatePath("/generic-post-generator");

  return { id: generation.id };
}

export async function deletePostGeneration(id: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.from("post_generations").delete().eq("id", id).eq("mode", "generic");
  if (error) throw new Error(error.message);

  revalidatePath("/generic-post-generator");
}

export async function addGenericSubreddit(subreddit: string) {
  await requireStaff();

  const clean = subreddit.trim().replace(/^r\//i, "");
  if (!clean) throw new Error("Enter a subreddit name");

  const supabase = await createClient();
  const { data: settings, error: fetchError } = await supabase
    .from("generic_post_generator_settings")
    .select("subreddits")
    .eq("id", 1)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const current = settings?.subreddits ?? [];
  if (current.some((s) => s.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`r/${clean} is already in the list`);
  }

  const { error } = await supabase
    .from("generic_post_generator_settings")
    .update({ subreddits: [...current, clean] })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  revalidatePath("/generic-post-generator");
}

/**
 * Mirrors markPostGenerationPosted in the company post-generator's
 * actions.ts, minus a bound companyId: generic-mode rows have no company_id
 * (see the post_generations_mode_matches_company check constraint), so
 * attribution to a company happens entirely through the chosen
 * reddit_account_id — every account belongs to exactly one company, and
 * lib/activity/queries.ts + lib/analytics/queries.ts already fold generic-mode
 * rows tagged this way into that company's weekly goal and dashboard.
 */
export async function markPostGenerationPosted(id: string, formData: FormData) {
  const { user } = await requireStaff();

  const postedBy = String(formData.get("posted_by") ?? "").trim() || user.id;
  const redditAccountId = String(formData.get("reddit_account_id") ?? "").trim() || null;
  const postTypeRaw = String(formData.get("post_type") ?? "").trim();
  const postType = postTypeRaw === "generic" || postTypeRaw === "company_mention" ? postTypeRaw : null;

  const supabase = await createClient();
  const { data: posterRoles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", postedBy)
    .in("role", ["admin", "coworker"]);
  if (roleError) throw new Error(roleError.message);
  if (!posterRoles || posterRoles.length === 0) throw new Error("Selected user is not a staff member");

  const { error } = await supabase
    .from("post_generations")
    .update({
      posted_at: new Date().toISOString(),
      posted_by: postedBy,
      reddit_account_id: redditAccountId,
      post_type: postType,
    })
    .eq("id", id)
    .eq("mode", "generic");
  if (error) throw new Error(error.message);

  revalidatePath("/generic-post-generator");
  await revalidateAttributedCompanies(supabase, redditAccountId);
}

export async function unmarkPostGenerationPosted(id: string) {
  await requireStaff();

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("post_generations")
    .select("reddit_account_id")
    .eq("id", id)
    .eq("mode", "generic")
    .maybeSingle();

  const { error } = await supabase
    .from("post_generations")
    .update({ posted_at: null, posted_by: null })
    .eq("id", id)
    .eq("mode", "generic");
  if (error) throw new Error(error.message);

  revalidatePath("/generic-post-generator");
  await revalidateAttributedCompanies(supabase, existing?.reddit_account_id ?? null);
}

/** Manually-reported view count — Reddit's API doesn't expose this. Mirrors setPostGenerationViews in the company post-generator's actions.ts. */
export async function setPostGenerationViews(id: string, formData: FormData) {
  await requireStaff();

  const raw = String(formData.get("views_count") ?? "").trim();
  const viewsCount = raw === "" ? null : Number(raw);
  if (viewsCount !== null && (!Number.isInteger(viewsCount) || viewsCount < 0)) {
    throw new Error("Views must be a non-negative whole number");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("post_generations")
    .update({ views_count: viewsCount })
    .eq("id", id)
    .eq("mode", "generic");
  if (error) throw new Error(error.message);

  revalidatePath("/generic-post-generator");
}

/**
 * Every company dashboard reads its posted activity live, so a mark/unmark
 * here needs to bust each of their caches too — same reasoning as the
 * company post-generator's actions revalidating `/companies/${companyId}`.
 * An account can now be linked to more than one company (see
 * supabase/migrations/0022_reddit_account_companies.sql), so this revalidates
 * every company it's linked to, not just one.
 */
async function revalidateAttributedCompanies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  redditAccountId: string | null,
) {
  if (!redditAccountId) return;

  const { data: links } = await supabase
    .from("reddit_account_companies")
    .select("company_id")
    .eq("reddit_account_id", redditAccountId);
  for (const link of links ?? []) {
    revalidatePath(`/companies/${link.company_id}`);
  }
}

export async function removeGenericSubreddit(subreddit: string) {
  await requireStaff();

  const supabase = await createClient();
  const { data: settings, error: fetchError } = await supabase
    .from("generic_post_generator_settings")
    .select("subreddits")
    .eq("id", 1)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const current = settings?.subreddits ?? [];
  const { error } = await supabase
    .from("generic_post_generator_settings")
    .update({ subreddits: current.filter((s) => s !== subreddit) })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  revalidatePath("/generic-post-generator");
}
