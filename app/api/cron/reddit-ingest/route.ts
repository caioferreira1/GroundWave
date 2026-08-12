import { createAdminClient } from "@/lib/supabase/admin";
import { ingestCompanyPosts, type IngestCompany } from "@/lib/reddit/ingest";

// Each due company runs an Apify actor synchronously (start -> poll -> fetch
// dataset) inside this request; give it room to finish. Requires Fluid
// Compute on the Vercel project to actually honor durations past 60s.
export const maxDuration = 300;

/**
 * Vercel Cron entry point (see vercel.json). Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}` automatically when CRON_SECRET is
 * configured on the project; also callable by hand with the same header for
 * manual testing. For each company whose configured fetch frequency has
 * elapsed (and, for daily-or-slower schedules, whose configured hour of day
 * matches the current UTC hour), searches Reddit (via Apify) and ingests new
 * posts. Companies run concurrently — each one's Apify run/poll can already
 * take tens of seconds on its own, so running them sequentially would sum
 * their wall-clock time and risk hitting the function's duration ceiling.
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
      "id, suggested_subreddits, search_keywords, posts_min_upvotes, posts_sort, posts_time_window, posts_max_per_run, posts_fetch_frequency_hours, posts_fetch_hour_utc, posts_last_scheduled_run_at, posts_fetch_enabled",
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

  const settled = await Promise.allSettled(
    due.map((company) => ingestCompanyPosts(company as IngestCompany, { scheduled: true })),
  );
  const results = due.map((company, i) => {
    const r = settled[i];
    if (r.status === "fulfilled") return { company_id: company.id, fetched: r.value };
    console.error("[cron/reddit-ingest] company failed", company.id, r.reason);
    return {
      company_id: company.id,
      fetched: 0,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });

  return Response.json({ ok: true, results });
}
