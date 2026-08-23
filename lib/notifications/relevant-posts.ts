import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

type RelevantPostRow = {
  id: string;
  author: string | null;
  content: string | null;
  subreddit: string | null;
  url: string;
  relevance_score: number | null;
};

// Fixed bar for the email alert — deliberately higher than the classifier's
// own is_relevant cutoff (score >= 50, see lib/ai/classifier.ts's
// RELEVANCE_THRESHOLD): "relevant enough to review" and "relevant enough to
// interrupt someone's inbox" aren't the same bar. Not per-user configurable
// (that was tried and reverted — see git history — in favor of one number
// everyone understands).
const MIN_RELEVANCE_SCORE_FOR_EMAIL = 85;

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmailHtml(companyName: string, posts: RelevantPostRow[], postsUrl: string): string {
  const items = posts
    .map((p) => {
      const snippet = escapeHtml((p.content ?? "").slice(0, 280));
      return `
        <div style="padding:14px 0;border-bottom:1px solid #e5e5e5;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b6b6b;">
            r/${escapeHtml(p.subreddit ?? "unknown")} · u/${escapeHtml(p.author ?? "unknown")} · score ${p.relevance_score ?? "—"}
          </p>
          <p style="margin:0 0 8px;font-size:14px;color:#1a1a1a;">${snippet}${(p.content ?? "").length > 280 ? "…" : ""}</p>
          <a href="${p.url}" style="font-size:13px;color:#c04a2a;">View on Reddit →</a>
        </div>`;
    })
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="font-size:16px;margin:0 0 4px;">${posts.length} new relevant post${posts.length === 1 ? "" : "s"} for ${escapeHtml(companyName)}</h2>
      <p style="font-size:13px;color:#6b6b6b;margin:0 0 16px;">Just came back from the classifier as relevant.</p>
      ${items}
      <p style="margin:20px 0 0;">
        <a href="${postsUrl}" style="font-size:13px;color:#c04a2a;">Open Posts in GroundWave Hub →</a>
      </p>
    </div>`;
}

/**
 * Emails every opted-in staff member (profiles.notify_relevant_posts, an
 * admin-only toggle on /admin/users) when posts just classified as relevant
 * for a company. Called from insertAndClassifyPosts() right after
 * classification finishes — the one choke point both ingestion paths (Apify
 * runs and the external /api/webhooks/posts) already share, so this fires
 * for either without duplicating the hook.
 *
 * Never throws: a missing/invalid RESEND_API_KEY or a delivery failure must
 * not take down ingestion, so every failure mode here logs and returns
 * instead. `postIds` are the just-inserted candidates from this batch (pre-
 * classification) — this re-queries them fresh to see which ones the
 * classifier actually marked relevant.
 */
export async function notifyNewRelevantPosts(companyId: string, postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;

  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) return; // not configured yet — opt-in feature, not a hard ingestion requirement

    const admin = createAdminClient();

    const [{ data: relevantPosts }, { data: company }, { data: optedInProfiles }, { data: staffRoles }] =
      await Promise.all([
        admin
          .from("posts")
          .select("id, author, content, subreddit, url, relevance_score")
          .in("id", postIds)
          .gt("relevance_score", MIN_RELEVANCE_SCORE_FOR_EMAIL),
        admin.from("companies").select("name").eq("id", companyId).maybeSingle(),
        admin.from("profiles").select("id, email").eq("status", "approved").eq("notify_relevant_posts", true),
        admin.from("user_roles").select("user_id").in("role", ["admin", "coworker"]),
      ]);

    if (!relevantPosts || relevantPosts.length === 0) return;

    const staffIds = new Set((staffRoles ?? []).map((r) => r.user_id));
    const recipients = (optedInProfiles ?? []).filter((p) => staffIds.has(p.id));
    if (recipients.length === 0) return;

    const companyName = company?.name ?? "Unknown company";
    const postsUrl = `${siteUrl()}/companies/${companyId}/posts`;
    const subject = `${relevantPosts.length} new relevant post${relevantPosts.length === 1 ? "" : "s"} for ${companyName}`;
    const html = renderEmailHtml(companyName, relevantPosts, postsUrl);

    const resend = new Resend(apiKey);
    const results = await Promise.allSettled(
      recipients.map((r) => resend.emails.send({ from, to: r.email, subject, html })),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[notifyNewRelevantPosts] send threw", result.reason);
      } else if (result.value.error) {
        console.error("[notifyNewRelevantPosts] resend error", result.value.error);
      }
    }
  } catch (err) {
    console.error("[notifyNewRelevantPosts] failed", err);
  }
}
