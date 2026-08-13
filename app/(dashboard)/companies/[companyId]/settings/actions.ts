"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function linesToList(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateCompanySettings(companyId: string, formData: FormData) {
  await requireStaff();

  const searchKeywords = linesToList(String(formData.get("search_keywords") ?? ""));
  const suggestedSubreddits = linesToList(String(formData.get("suggested_subreddits") ?? "")).map(
    (s) => s.replace(/^r\//i, ""),
  );
  const postsMinUpvotes = Number(formData.get("posts_min_upvotes") ?? 2);
  const postsFetchFrequencyHours = Number(formData.get("posts_fetch_frequency_hours") ?? 24);
  const postsFetchHourUtc = Number(formData.get("posts_fetch_hour_utc") ?? 12);
  const postsSort = String(formData.get("posts_sort") ?? "new") as
    | "new"
    | "top"
    | "hot"
    | "relevance"
    | "comments";
  const postsTimeWindow = String(formData.get("posts_time_window") ?? "day") as
    | "hour"
    | "day"
    | "week"
    | "month"
    | "year"
    | "all";
  const postsMaxPerRun = Number(formData.get("posts_max_per_run") ?? 100);
  const postsFetchEnabled = formData.get("posts_fetch_enabled") === "on";
  const profile = String(formData.get("profile") ?? "").trim() || null;
  const guardrailsMd = String(formData.get("guardrails_md") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      search_keywords: searchKeywords,
      suggested_subreddits: suggestedSubreddits,
      posts_min_upvotes: postsMinUpvotes,
      posts_fetch_frequency_hours: postsFetchFrequencyHours,
      posts_fetch_hour_utc: postsFetchHourUtc,
      posts_sort: postsSort,
      posts_time_window: postsTimeWindow,
      posts_max_per_run: postsMaxPerRun,
      posts_fetch_enabled: postsFetchEnabled,
      profile,
      guardrails_md: guardrailsMd,
    })
    .eq("id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/companies/${companyId}/settings`);
  redirect(`/companies/${companyId}/settings`);
}

export async function regenerateWebhookToken(companyId: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ inbound_webhook_token: crypto.randomUUID() })
    .eq("id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/settings`);
  redirect(`/companies/${companyId}/settings`);
}
