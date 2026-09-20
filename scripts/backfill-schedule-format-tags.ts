// One-time backfill for migration 0028: creates a tag row for every
// distinct "format" prefix already used in scheduled_posts.format_note
// (that column combined "Format — theme", e.g. "Educational — protocol
// registration" — only the "Educational" part becomes a tag; the specific
// theme half isn't preserved, since it varied almost per-post and isn't
// the reusable category the tag system is for) and points each existing
// row's format_tag_id at the right tag. Safe to run once; does not touch
// any other column (is_posted, post_url, etc. from posts already marked
// done are left untouched).
//
// Usage: npx tsx scripts/backfill-schedule-format-tags.ts
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

process.loadEnvFile(join(__dirname, "..", ".env.local"));

function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const admin = createAdminClient();

  const { data: posts, error: postsError } = await admin
    .from("scheduled_posts")
    .select("id, format_note, format_tag_id");
  if (postsError) throw new Error(postsError.message);

  const rowsNeedingBackfill = (posts ?? []).filter((p) => p.format_note && !p.format_tag_id);
  if (rowsNeedingBackfill.length === 0) {
    console.log("Nothing to backfill — no rows have format_note set without a format_tag_id.");
    return;
  }

  const labelFor = (formatNote: string) => formatNote.split(" — ")[0].trim();
  const distinctLabels = [...new Set(rowsNeedingBackfill.map((p) => labelFor(p.format_note!)))].sort();

  console.log(`Creating ${distinctLabels.length} format tags:`, distinctLabels);
  const { data: insertedTags, error: insertError } = await admin
    .from("schedule_format_tags")
    .insert(distinctLabels.map((label) => ({ label })))
    .select("id, label");
  if (insertError) throw new Error(insertError.message);

  const tagIdByLabel = new Map((insertedTags ?? []).map((t) => [t.label, t.id]));

  let updated = 0;
  for (const post of rowsNeedingBackfill) {
    const label = labelFor(post.format_note!);
    const tagId = tagIdByLabel.get(label);
    if (!tagId) throw new Error(`No tag id found for label "${label}" (post ${post.id})`);

    const { error } = await admin.from("scheduled_posts").update({ format_tag_id: tagId }).eq("id", post.id);
    if (error) throw new Error(error.message);
    updated++;
  }

  console.log(`Backfilled format_tag_id on ${updated} scheduled_posts rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
