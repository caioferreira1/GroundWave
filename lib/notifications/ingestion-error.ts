import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Emails every approved admin when a company's posts ingestion fails —
 * either at dispatch (Apify refused to start the run) or at completion
 * (run failed, or insert/classify threw). Exists because an ingestion
 * failure used to be recorded only in companies.posts_last_error, which
 * nobody watches: in Oct/Nov 2026 the pinned Apify build was deleted and
 * the daily cron failed silently for 12 days.
 *
 * Sent to all admins regardless of profiles.notify_relevant_posts — that
 * toggle is for the (opt-in) relevant-posts digest, while a broken pipeline
 * is something admins always need to know about. The cron fires at most
 * once a day, so this is at most one email per company per day from it.
 *
 * Never throws: alerting must not mask or replace the original error.
 */
export async function notifyIngestionError(companyId: string, message: string): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) return;

    const admin = createAdminClient();
    const [{ data: company }, { data: adminRoles }] = await Promise.all([
      admin.from("companies").select("name").eq("id", companyId).maybeSingle(),
      admin.from("user_roles").select("user_id").eq("role", "admin"),
    ]);

    const adminIds = (adminRoles ?? []).map((r) => r.user_id);
    if (adminIds.length === 0) return;

    const { data: recipients } = await admin
      .from("profiles")
      .select("email")
      .eq("status", "approved")
      .in("id", adminIds);
    if (!recipients || recipients.length === 0) return;

    const companyName = company?.name ?? "Unknown company";
    const postsUrl = `${siteUrl()}/companies/${companyId}/posts`;
    const subject = `Reddit ingestion failed for ${companyName}`;
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="font-size:16px;margin:0 0 8px;">Reddit ingestion failed for ${escapeHtml(companyName)}</h2>
        <p style="font-size:13px;color:#6b6b6b;margin:0 0 12px;">
          No new posts were fetched. The daily cron will retry automatically, but it will keep
          failing until the cause below is fixed.
        </p>
        <pre style="font-size:12px;background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(message.slice(0, 2000))}</pre>
        <p style="margin:16px 0 0;">
          <a href="${postsUrl}" style="font-size:13px;color:#c04a2a;">Open Posts in GroundWave Hub →</a>
        </p>
      </div>`;

    const resend = new Resend(apiKey);
    const results = await Promise.allSettled(
      recipients.map((r) => resend.emails.send({ from, to: r.email, subject, html })),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[notifyIngestionError] send threw", result.reason);
      } else if (result.value.error) {
        console.error("[notifyIngestionError] resend error", result.value.error);
      }
    }
  } catch (err) {
    console.error("[notifyIngestionError] failed", err);
  }
}
