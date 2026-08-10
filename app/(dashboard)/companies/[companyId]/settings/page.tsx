import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { regenerateWebhookToken, runIngestionNow, updateCompanySettings } from "./actions";

export default async function CompanySettingsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, search_keywords, suggested_subreddits, posts_min_upvotes, posts_fetch_frequency_hours, posts_fetch_hour_utc, posts_sort, posts_max_per_run, posts_fetch_enabled, profile, guardrails_md, inbound_webhook_token",
    )
    .eq("id", companyId)
    .maybeSingle();

  if (!company) notFound();

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const webhookUrl = `${proto}://${host}/api/webhooks/posts?token=${company.inbound_webhook_token}`;

  const updateAction = updateCompanySettings.bind(null, companyId);
  const regenerateAction = regenerateWebhookToken.bind(null, companyId);
  const runNowAction = runIngestionNow.bind(null, companyId);

  return (
    <div className="max-w-2xl space-y-6">
      <form action={updateAction} className="space-y-6">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink">Reddit search</h2>

          <div>
            <Label htmlFor="search_keywords">Search keywords (one per line)</Label>
            <Textarea
              id="search_keywords"
              name="search_keywords"
              rows={5}
              defaultValue={(company.search_keywords ?? []).join("\n")}
            />
          </div>
          <div>
            <Label htmlFor="suggested_subreddits">Subreddits (one per line, with or without r/)</Label>
            <Textarea
              id="suggested_subreddits"
              name="suggested_subreddits"
              rows={4}
              defaultValue={(company.suggested_subreddits ?? []).join("\n")}
            />
            <p className="mt-1 text-xs text-ink-muted">
              Long combinations of keywords + subreddits can make the underlying Reddit search
              return zero results — if that happens the search adapter automatically drops
              subreddits (keeping keywords) until the query fits.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="posts_min_upvotes">Min upvotes</Label>
              <Input
                id="posts_min_upvotes"
                name="posts_min_upvotes"
                type="number"
                min={0}
                defaultValue={company.posts_min_upvotes}
              />
            </div>
            <div>
              <Label htmlFor="posts_max_per_run">Max posts per run</Label>
              <Input
                id="posts_max_per_run"
                name="posts_max_per_run"
                type="number"
                min={10}
                max={200}
                defaultValue={company.posts_max_per_run}
              />
            </div>
            <div>
              <Label htmlFor="posts_fetch_frequency_hours">Fetch frequency (hours)</Label>
              <Input
                id="posts_fetch_frequency_hours"
                name="posts_fetch_frequency_hours"
                type="number"
                min={1}
                defaultValue={company.posts_fetch_frequency_hours}
              />
            </div>
            <div>
              <Label htmlFor="posts_fetch_hour_utc">Fetch hour (UTC)</Label>
              <Input
                id="posts_fetch_hour_utc"
                name="posts_fetch_hour_utc"
                type="number"
                min={0}
                max={23}
                defaultValue={company.posts_fetch_hour_utc}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="posts_sort">Sort</Label>
            <Select id="posts_sort" name="posts_sort" defaultValue={company.posts_sort}>
              <option value="relevance">Relevance (recommended)</option>
              <option value="new">New</option>
              <option value="top">Top</option>
              <option value="hot">Hot</option>
            </Select>
            <p className="mt-1 text-xs text-ink-muted">
              &quot;New&quot; barely honors the keyword/subreddit filter in testing — most results
              come back unrelated. &quot;Relevance&quot; matches the topic reliably; the AI
              classifier filters out the stale/news-share posts it tends to surface.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="posts_fetch_enabled"
              defaultChecked={company.posts_fetch_enabled}
              className="h-4 w-4 rounded border-border"
            />
            Ingestion enabled (cron will fetch on schedule)
          </label>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink">AI classifier</h2>
          <div>
            <Label htmlFor="profile">Company profile</Label>
            <Textarea
              id="profile"
              name="profile"
              rows={8}
              placeholder="Core topics, adjacent topics to ignore, ideal customer profile..."
              defaultValue={company.profile ?? ""}
            />
            <p className="mt-1 text-xs text-ink-muted">
              This is what the relevance classifier uses as ground truth — leaving it empty means
              every post gets marked not relevant.
            </p>
          </div>
          <div>
            <Label htmlFor="guardrails_md">Guardrails</Label>
            <Textarea
              id="guardrails_md"
              name="guardrails_md"
              rows={5}
              placeholder="Brand tone rules, required disclaimers..."
              defaultValue={company.guardrails_md ?? ""}
            />
          </div>
        </Card>

        <Button type="submit">Save settings</Button>
      </form>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-ink">Inbound webhook</h2>
        <p className="text-xs text-ink-muted">
          POST a post (or array of posts) here from Zapier/Make/n8n as an alternative to the
          RapidAPI search — same dedupe + AI classification pipeline either way.
        </p>
        <Input readOnly value={webhookUrl} />
        <form action={regenerateAction}>
          <Button type="submit" variant="secondary">
            Regenerate token
          </Button>
        </form>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-ink">Test</h2>
        <p className="text-xs text-ink-muted">
          Runs the RapidAPI search for this company right now (uses real quota) and classifies
          any new posts — same code path as the daily cron, without waiting for it.
        </p>
        <form action={runNowAction}>
          <Button type="submit" variant="secondary">
            Run ingestion now
          </Button>
        </form>
      </Card>
    </div>
  );
}
