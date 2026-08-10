import { createAdminClient } from "@/lib/supabase/admin";
import { ingestCompanyPosts, type IngestCompany } from "@/lib/reddit/ingest";

/**
 * Vercel Cron entry point (see vercel.json). Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}` automatically when CRON_SECRET is
 * configured on the project; also callable by hand with the same header for
 * manual testing. For each company whose configured fetch frequency has
 * elapsed (and, for daily-or-slower schedules, whose configured hour of day
 * matches the current UTC hour), searches Reddit and ingests new posts.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: companies, error } = await admin
    .from("companies")
    .select(
      "id, suggested_subreddits, search_keywords, posts_min_upvotes, posts_sort, posts_max_per_run, posts_fetch_frequency_hours, posts_fetch_hour_utc, posts_last_scheduled_run_at, posts_fetch_enabled",
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const currentHourUtc = new Date().getUTCHours();
  const due = (companies ?? []).filter((c) => {
    if (!c.posts_fetch_enabled) return false;
    if (!c.suggested_subreddits || c.suggested_subreddits.length === 0) return false;
    const frequency = c.posts_fetch_frequency_hours ?? 24;
    const last = c.posts_last_scheduled_run_at
      ? new Date(c.posts_last_scheduled_run_at).getTime()
      : null;

    if (frequency >= 24) {
      // Slot-based: run once per scheduled slot, at the configured hour.
      if ((c.posts_fetch_hour_utc ?? 12) !== currentHourUtc) return false;
      if (!last) return true;
      // Slightly under the period so clock drift never skips a slot.
      return (now - last) / 3_600_000 >= frequency - 1;
    }

    if (!last) return true;
    return (now - last) / 3_600_000 >= frequency;
  });

  const results: Array<{ company_id: string; fetched: number; error?: string }> = [];

  for (const company of due) {
    try {
      const fetched = await ingestCompanyPosts(company as IngestCompany, { scheduled: true });
      results.push({ company_id: company.id, fetched });
    } catch (e) {
      console.error("[cron/reddit-ingest] company failed", company.id, e);
      results.push({
        company_id: company.id,
        fetched: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return Response.json({ ok: true, results });
}
