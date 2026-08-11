// Throwaway verification fixture, not part of the app runtime. Seeds
// backdated post_generations/posts rows spread across the last 30 days so
// the new Overview charts (lib/analytics/queries.ts) can be sanity-checked
// with more than 1-2 real data points, then cleans itself up.
// Usage:
//   npm run seed-analytics-demo -- --company-id <uuid>
//   npm run seed-analytics-demo -- --company-id <uuid> --cleanup
//
// Same client-construction pattern as scripts/import-personas.ts (own
// service-role client — lib/supabase/admin.ts is "server-only" and can't be
// imported outside Next's bundler).
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

process.loadEnvFile(join(__dirname, "..", ".env.local"));

const SEED_MARKER = "__seed_demo__";

function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function cleanup(admin: ReturnType<typeof createAdminClient>, companyId: string) {
  const { error: genError, count: genCount } = await admin
    .from("post_generations")
    .delete({ count: "exact" })
    .eq("company_id", companyId)
    .eq("theme", SEED_MARKER);
  if (genError) throw new Error(genError.message);

  const { error: postsError, count: postsCount } = await admin
    .from("posts")
    .delete({ count: "exact" })
    .eq("company_id", companyId)
    .eq("author", SEED_MARKER);
  if (postsError) throw new Error(postsError.message);

  console.log(`Cleaned up ${genCount ?? 0} seeded post_generations and ${postsCount ?? 0} seeded posts.`);
}

async function seed(admin: ReturnType<typeof createAdminClient>, companyId: string) {
  const generations = Array.from({ length: 15 }).map((_, i) => {
    const postedAt = Math.random() < 0.75 ? daysAgo(randomInt(0, 29)).toISOString() : null;
    return {
      company_id: companyId,
      mode: "company" as const,
      subreddit: "seeddemo",
      theme: SEED_MARKER,
      title: `Seed demo post #${i + 1}`,
      body: "Seed data for analytics verification — safe to delete.",
      posted_at: postedAt,
      views_count: postedAt && Math.random() < 0.8 ? randomInt(20, 900) : null,
    };
  });

  const { error: genError } = await admin.from("post_generations").insert(generations);
  if (genError) throw new Error(genError.message);

  const posts = Array.from({ length: 15 }).map(() => {
    const generatedAt = daysAgo(randomInt(0, 29)).toISOString();
    const postedAt = Math.random() < 0.6 ? daysAgo(randomInt(0, 29)).toISOString() : null;
    return {
      company_id: companyId,
      author: SEED_MARKER,
      url: `https://reddit.com/${SEED_MARKER}/${randomUUID()}`,
      content: "Seed data for analytics verification — safe to delete.",
      subreddit: "seeddemo",
      received_at: generatedAt,
      ai_status: "processed" as const,
      is_relevant: true,
      generated_comment: "Seed reply draft.",
      comment_generated_at: generatedAt,
      comment_posted_at: postedAt,
      comment_views_count: postedAt && Math.random() < 0.8 ? randomInt(5, 400) : null,
    };
  });

  const { error: postsError } = await admin.from("posts").insert(posts);
  if (postsError) throw new Error(postsError.message);

  console.log(`Seeded ${generations.length} post_generations and ${posts.length} posts for company ${companyId}.`);
  console.log(`Run with --cleanup once you've verified the Overview charts.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = args["company-id"];
  if (!companyId || typeof companyId !== "string") {
    console.error("Usage: seed-analytics-demo --company-id <uuid> [--cleanup]");
    process.exit(1);
  }

  const admin = createAdminClient();

  if (args.cleanup) {
    await cleanup(admin, companyId);
  } else {
    await seed(admin, companyId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
