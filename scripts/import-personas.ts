// Operator script, not part of the app runtime — run directly via tsx/node,
// outside Next's bundler. Reads persona markdown files (as authored in the
// MAA-personas repo) and upserts them into `personas`.
// Usage: npm run import-personas -- --company-id <uuid> --dir <path/to/personas>
//
// Builds its own Supabase client instead of importing lib/supabase/admin.ts:
// that module (and everything it pulls in, like lib/ai/gateway.ts) is marked
// "server-only", which throws on import outside Next's "react-server"
// bundler condition — exactly what a plain tsx/node run is.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

process.loadEnvFile(join(__dirname, "..", ".env.local"));

function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function main() {
  const { "company-id": companyId, dir } = parseArgs(process.argv.slice(2));
  if (!companyId || !dir) {
    console.error("Usage: import-personas --company-id <uuid> --dir <path/to/personas>");
    process.exit(1);
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    console.error(`No .md files found in ${dir}`);
    process.exit(1);
  }

  const admin = createAdminClient();

  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf-8");
    const { data: frontmatter, content } = matter(raw);

    const slug: string | undefined = frontmatter.slug;
    if (!slug) {
      console.warn(`Skipping ${file}: no "slug" in frontmatter`);
      continue;
    }
    const basedOnFichas: string[] = Array.isArray(frontmatter.baseada_em)
      ? frontmatter.baseada_em
      : [];

    // Only set is_active/display_name on first insert — don't clobber a
    // display_name someone customized, or reactivate a persona staff
    // deliberately turned off, on a re-import after editing the source .md.
    const { data: existing } = await admin
      .from("personas")
      .select("id")
      .eq("company_id", companyId)
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("personas")
        .update({ content_md: content.trim(), based_on_fichas: basedOnFichas })
        .eq("id", existing.id);
      if (error) throw new Error(`${slug}: ${error.message}`);
      console.log(`Updated: ${slug}`);
    } else {
      const { error } = await admin.from("personas").insert({
        company_id: companyId,
        slug,
        display_name: slugToDisplayName(slug),
        content_md: content.trim(),
        based_on_fichas: basedOnFichas,
        is_active: true,
      });
      if (error) throw new Error(`${slug}: ${error.message}`);
      console.log(`Created: ${slug}`);
    }
  }

  console.log(`Done. ${files.length} persona file(s) processed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
