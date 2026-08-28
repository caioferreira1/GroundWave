import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchCompanyIngestion, type IngestCompany } from "@/lib/reddit/ingest";

/**
 * Cron entry point, called once daily by Vercel's native cron (see
 * vercel.json — the Hobby plan caps native crons at 1 invocation/day, which
 * is why this only ever fires once and every company's fetch frequency is
 * effectively "at most once a day", see docs/PLAN.md). Requires
 * `Authorization: Bearer ${CRON_SECRET}`; also callable by hand with the
 * same header for manual testing. For each company whose configured fetch
 * frequency has elapsed, DISPATCHES an Apify run and returns — it does not
 * wait for the run to finish (a real run has been measured at ~4min, too
 * long to hold this request open). Apify calls back
 * app/api/webhooks/apify-run-complete once each run is done, which is where
 * posts actually get ingested/classified. No Fluid Compute dependency here:
 * dispatching is just a couple of fast HTTP calls per company.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json({ error: "APIFY_WEBHOOK_SECRET is not configured." }, { status: 500 });
  }
  const webhookUrl = `${new URL(request.url).origin}/api/webhooks/apify-run-complete?secret=${encodeURIComponent(webhookSecret)}`;

  const admin = createAdminClient();
  const { data: companies, error } = await admin
    .from("companies")
    .select(
      "id, suggested_subreddits, search_keywords, posts_min_upvotes, posts_sort, posts_time_window, posts_max_per_run, posts_fetch_frequency_hours, posts_last_scheduled_run_at, posts_fetch_enabled",
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const due = (companies ?? []).filter((c) => {
    if (!c.posts_fetch_enabled) return false;
    if (!c.suggested_subreddits || c.suggested_subreddits.length === 0) return false;
    const frequency = c.posts_fetch_frequency_hours ?? 24;
    const last = c.posts_last_scheduled_run_at
      ? new Date(c.posts_last_scheduled_run_at).getTime()
      : null;
    if (!last) return true;
    // Slightly under the period so clock drift never skips this cron's one daily slot.
    return (now - last) / 3_600_000 >= frequency - 1;
  });

  const settled = await Promise.allSettled(
    due.map((company) => dispatchCompanyIngestion(company as IngestCompany, webhookUrl, { scheduled: true })),
  );
  const results = due.map((company, i) => {
    const r = settled[i];
    if (r.status === "fulfilled") return { company_id: company.id, dispatched: r.value };
    console.error("[cron/reddit-ingest] company failed", company.id, r.reason);
    return {
      company_id: company.id,
      dispatched: false,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });

  return Response.json({ ok: true, results });
}
