"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generatePostGeneration } from "@/lib/ai/post-generator";

export async function generatePost(companyId: string) {
  const { user } = await requireStaff();

  await generatePostGeneration({ mode: "company", companyId, createdBy: user.id });

  revalidatePath(`/companies/${companyId}/post-generator`);
}

export async function deletePostGeneration(companyId: string, id: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from("post_generations")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/post-generator`);
}

/**
 * The poster is a manual choice (formData.posted_by), not necessarily the
 * staff member clicking the button — mirrors markCommentPosted in the Posts
 * flow (someone else's Reddit account may have been used to post it).
 * reddit_account_id/post_type are optional (companies with no registered
 * accounts yet can still mark posts posted) — left null when not chosen.
 */
export async function markPostGenerationPosted(companyId: string, id: string, formData: FormData) {
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
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/post-generator`);
  revalidatePath(`/companies/${companyId}`);
}

export async function unmarkPostGenerationPosted(companyId: string, id: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from("post_generations")
    .update({ posted_at: null, posted_by: null })
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/post-generator`);
}

/** Manually-reported view count — Reddit's API doesn't expose this. */
export async function setPostGenerationViews(companyId: string, id: string, formData: FormData) {
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
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/post-generator`);
}
