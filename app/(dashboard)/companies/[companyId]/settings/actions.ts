"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dispatchCompanyIngestion, type IngestCompany } from "@/lib/reddit/ingest";

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

export async function runIngestionNow(companyId: string) {
  await requireStaff();

  const supabase = await createClient();
  const { data: company, error } = await supabase
    .from("companies")
    .select(
      "id, suggested_subreddits, search_keywords, posts_min_upvotes, posts_sort, posts_time_window, posts_max_per_run",
    )
    .eq("id", companyId)
    .single();
  if (error) throw new Error(error.message);

  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("APIFY_WEBHOOK_SECRET is not configured.");
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const webhookUrl = `${proto}://${host}/api/webhooks/apify-run-complete?secret=${encodeURIComponent(webhookSecret)}`;

  // This only DISPATCHES the Apify run — a real run takes minutes, so it
  // finishes later via the webhook (lib/reddit/ingest.ts::completeCompanyIngestion),
  // not before this redirect. Errors here mean the run couldn't even be
  // started (e.g. bad token); those are persisted to companies.posts_last_error
  // by dispatchCompanyIngestion itself — swallow here so a failed dispatch
  // doesn't crash the page, staff just sees it on the Overview tab.
  try {
    await dispatchCompanyIngestion(company as IngestCompany, webhookUrl, { scheduled: false });
  } catch (e) {
    console.error("[runIngestionNow] failed", e);
  }

  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/companies/${companyId}/posts`);
  revalidatePath(`/companies/${companyId}/settings`);
  redirect(`/companies/${companyId}`);
}
