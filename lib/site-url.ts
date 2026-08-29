import "server-only";

/**
 * Stable public base URL for this app — safe to hand to external services
 * (Apify webhooks, email links). Never derive this from the incoming
 * request's host/origin: Vercel's native cron and server actions get
 * invoked against the ephemeral per-deployment URL (also what `VERCEL_URL`
 * holds), which sits behind Vercel's Deployment Protection (SSO wall) and
 * returns 401 before our own route code ever runs. `VERCEL_PROJECT_PRODUCTION_URL`
 * is the one system env var Vercel guarantees always points at the actual
 * assigned production domain, regardless of which deployment is executing.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionUrl) return `https://${productionUrl}`;
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}
