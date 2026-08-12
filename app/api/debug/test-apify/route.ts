import { createAdminClient } from "@/lib/supabase/admin";
import { ingestCompanyPosts, type IngestCompany } from "@/lib/reddit/ingest";

// TEMPORARY debug route to verify the RapidAPI->Apify migration end-to-end
// against a real company, without needing a logged-in browser session.
// Delete after use — not part of the app.
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const companyId = new URL(request.url).searchParams.get("company_id");
  if (!companyId) return Response.json({ error: "Missing ?company_id=" }, { status: 400 });

  const admin = createAdminClient();
  const { data: company, error } = await admin
    .from("companies")
    .select(
      "id, suggested_subreddits, search_keywords, posts_min_upvotes, posts_sort, posts_time_window, posts_max_per_run",
    )
    .eq("id", companyId)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  try {
    const fetched = await ingestCompanyPosts(company as IngestCompany, { scheduled: false });
    return Response.json({ ok: true, fetched });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
