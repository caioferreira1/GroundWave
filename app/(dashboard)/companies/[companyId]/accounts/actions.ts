"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createRedditAccount(companyId: string, formData: FormData) {
  await requireStaff();

  const accountName = String(formData.get("account_name") ?? "").trim();
  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();
  const karmaRaw = String(formData.get("karma") ?? "").trim();
  const karma = karmaRaw === "" ? 0 : Number(karmaRaw);
  if (!accountName) throw new Error("Account name is required");
  if (!ownerUserId) throw new Error("Owner is required");
  if (!Number.isInteger(karma) || karma < 0) throw new Error("Karma must be a non-negative whole number");

  const supabase = await createClient();
  const { error } = await supabase.from("reddit_accounts").insert({
    company_id: companyId,
    account_name: accountName,
    owner_user_id: ownerUserId,
    karma,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/accounts`);
  revalidatePath(`/companies/${companyId}`);
}

export async function updateRedditAccount(companyId: string, accountId: string, formData: FormData) {
  await requireStaff();

  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();
  const karmaRaw = String(formData.get("karma") ?? "").trim();
  const karma = karmaRaw === "" ? 0 : Number(karmaRaw);
  const isActive = formData.get("is_active") === "on";
  if (!ownerUserId) throw new Error("Owner is required");
  if (!Number.isInteger(karma) || karma < 0) throw new Error("Karma must be a non-negative whole number");

  const supabase = await createClient();
  const { error } = await supabase
    .from("reddit_accounts")
    .update({ owner_user_id: ownerUserId, karma, is_active: isActive })
    .eq("id", accountId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/accounts`);
  revalidatePath(`/companies/${companyId}`);
}

/** Weekly activity goals live on `companies` (same convention as the posts_* config columns). */
export async function updateActivityGoals(companyId: string, formData: FormData) {
  await requireStaff();

  const fields = {
    activity_generic_comments_per_week: Number(formData.get("activity_generic_comments_per_week") ?? 12),
    activity_target_comments_per_week: Number(formData.get("activity_target_comments_per_week") ?? 3),
    activity_generic_post_interval_days: Number(formData.get("activity_generic_post_interval_days") ?? 2),
    activity_company_post_per_week: Number(formData.get("activity_company_post_per_week") ?? 1),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${key} must be a non-negative whole number`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update(fields).eq("id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/accounts`);
  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}/accounts`);
}
