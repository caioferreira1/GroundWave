import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { insertAndClassifyPosts } from "@/lib/reddit/ingest";
import type { NormalizedRedditPost } from "@/lib/reddit/apify";

const incomingPost = z.object({
  author: z.string().trim().min(1).default("[deleted]"),
  url: z.string().trim().min(1),
  content: z.string().trim().min(1),
  posted_at: z.string().datetime({ offset: true }).optional(),
  upvotes: z.number().int().optional(),
  subreddit: z.string().trim().optional(),
});

const payloadSchema = z.union([incomingPost, z.array(incomingPost).min(1)]);

/**
 * External-automation ingestion entry point (Zapier/Make/n8n) — the
 * alternative to the Apify cron search. Authenticated per company by
 * `inbound_webhook_token` (not a single global secret, unlike the reference
 * app) so one leaked URL only exposes one company's inbound feed. Reuses
 * the same dedupe+insert+classify path as the cron search.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Missing ?token=" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("id")
    .eq("inbound_webhook_token", token)
    .maybeSingle();
  if (!company) {
    return Response.json({ error: "Unknown webhook token" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const candidates: NormalizedRedditPost[] = items.map((p) => ({
    author: p.author,
    url: p.url,
    content: p.content,
    subreddit: p.subreddit ?? "",
    upvotes: p.upvotes ?? 0,
    posted_at: p.posted_at ?? new Date().toISOString(),
  }));

  try {
    const inserted = await insertAndClassifyPosts(company.id, candidates);
    return Response.json({ ok: true, inserted });
  } catch (e) {
    console.error("[webhooks/posts] ingestion failed", e);
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
