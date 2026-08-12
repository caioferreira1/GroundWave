import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeCompanyIngestion } from "@/lib/reddit/ingest";
import type { ApifyRunResource } from "@/lib/reddit/apify";

// Apify's own webhook HTTP timeout is 2 minutes; classifying a batch of new
// posts (parallel AI gateway calls) should be well under that, but give it
// real room. 60s is also the ceiling Vercel Hobby allows without Fluid
// Compute, so this route has no Fluid Compute dependency.
export const maxDuration = 60;

const resourceSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    defaultDatasetId: z.string().nullish(),
    usageTotalUsd: z.number().optional(),
    stats: z
      .object({ computeUnits: z.number().optional(), runTimeSecs: z.number().optional() })
      .optional(),
    startedAt: z.string(),
    finishedAt: z.string().nullish(),
  })
  .passthrough();

const payloadSchema = z
  .object({
    eventType: z.string().optional(),
    resource: resourceSchema,
  })
  .passthrough();

/**
 * Ad-hoc webhook target for the Apify run started by
 * lib/reddit/apify.ts::startRedditRun — fires once when the run reaches a
 * terminal state (SUCCEEDED/FAILED/ABORTED/TIMED_OUT). Authenticated by a
 * shared secret in the query string (the same pattern Apify's own docs
 * recommend for webhook URLs, since there's no built-in request signing).
 */
export async function POST(request: Request) {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  const provided = new URL(request.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return new Response("Unauthorized", { status: 401 });
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
  const resource = parsed.data.resource as ApifyRunResource;

  const admin = createAdminClient();
  const { data: runRow } = await admin
    .from("apify_runs")
    .select("company_id, status")
    .eq("run_id", resource.id)
    .maybeSingle();

  if (!runRow) {
    // Unknown run_id (e.g. a webhook from a run we never dispatched) — ack
    // with 200 so Apify doesn't keep retrying something we can't resolve.
    return Response.json({ ok: true, skipped: "unknown run_id" });
  }
  if (runRow.status !== "RUNNING") {
    // Apify can deliver a webhook more than once (retries on non-2xx) —
    // idempotent no-op if this run was already completed.
    return Response.json({ ok: true, skipped: "already processed" });
  }
  if (!runRow.company_id) {
    return Response.json({ ok: true, skipped: "company deleted" });
  }

  await completeCompanyIngestion(runRow.company_id, resource);
  return Response.json({ ok: true });
}
