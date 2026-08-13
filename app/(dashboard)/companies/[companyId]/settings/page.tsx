import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CopyButton,
  Field,
  Input,
  PageHeading,
  Select,
  SubmitButton,
  Switch,
  Textarea,
} from "@/components/ui";
import { regenerateWebhookToken, updateCompanySettings } from "./actions";

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
      "id, search_keywords, suggested_subreddits, posts_min_upvotes, posts_fetch_frequency_hours, posts_fetch_hour_utc, posts_sort, posts_time_window, posts_max_per_run, posts_fetch_enabled, profile, guardrails_md, inbound_webhook_token",
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

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeading title="Settings" description="Configure Reddit search, the AI classifier, and ingestion." />

      <form action={updateAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Reddit search</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Search keywords (one per line)" htmlFor="search_keywords">
              <Textarea
                id="search_keywords"
                name="search_keywords"
                rows={5}
                defaultValue={(company.search_keywords ?? []).join("\n")}
              />
            </Field>

            <Field
              label="Subreddits (one per line, with or without r/)"
              htmlFor="suggested_subreddits"
              hint="Each keyword becomes its own search covering all of these subreddits at once — Max posts per run is a shared cap across every keyword combined, not per keyword."
            >
              <Textarea
                id="suggested_subreddits"
                name="suggested_subreddits"
                rows={4}
                defaultValue={(company.suggested_subreddits ?? []).join("\n")}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Min upvotes" htmlFor="posts_min_upvotes">
                <Input
                  id="posts_min_upvotes"
                  name="posts_min_upvotes"
                  type="number"
                  min={0}
                  defaultValue={company.posts_min_upvotes}
                />
              </Field>
              <Field label="Max posts per run" htmlFor="posts_max_per_run">
                <Input
                  id="posts_max_per_run"
                  name="posts_max_per_run"
                  type="number"
                  min={10}
                  max={200}
                  defaultValue={company.posts_max_per_run}
                />
              </Field>
              <Field label="Fetch frequency (hours)" htmlFor="posts_fetch_frequency_hours">
                <Input
                  id="posts_fetch_frequency_hours"
                  name="posts_fetch_frequency_hours"
                  type="number"
                  min={1}
                  defaultValue={company.posts_fetch_frequency_hours}
                />
              </Field>
              <Field label="Fetch hour (UTC)" htmlFor="posts_fetch_hour_utc">
                <Input
                  id="posts_fetch_hour_utc"
                  name="posts_fetch_hour_utc"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={company.posts_fetch_hour_utc}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Sort"
                htmlFor="posts_sort"
                hint={
                  <>
                    &quot;Relevance&quot; matches the keyword/subreddit query strictly but ignores
                    recency entirely — in testing it surfaced posts years old. &quot;New&quot; keeps
                    results fresh (mixed with some off-topic noise); the AI classifier is what
                    filters that noise for relevance, not the search step.
                  </>
                }
              >
                <Select id="posts_sort" name="posts_sort" defaultValue={company.posts_sort}>
                  <option value="new">New (recommended)</option>
                  <option value="relevance">Relevance</option>
                  <option value="top">Top</option>
                  <option value="hot">Hot</option>
                  <option value="comments">Comments</option>
                </Select>
              </Field>
              <Field
                label="Time window"
                htmlFor="posts_time_window"
                hint="How far back the search looks (Reddit's own rolling window, e.g. 'day' = last 24h)."
              >
                <Select id="posts_time_window" name="posts_time_window" defaultValue={company.posts_time_window}>
                  <option value="hour">Hour</option>
                  <option value="day">Day (recommended)</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                  <option value="all">All time</option>
                </Select>
              </Field>
            </div>

            <Switch
              name="posts_fetch_enabled"
              defaultChecked={company.posts_fetch_enabled}
              label="Ingestion enabled (cron will fetch on schedule)"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI classifier</CardTitle>
          </CardHeader>
          <CardContent>
            <Field
              label="Company profile"
              htmlFor="profile"
              hint="This is what the relevance classifier uses as ground truth — leaving it empty means every post gets marked not relevant."
            >
              <Textarea
                id="profile"
                name="profile"
                rows={8}
                placeholder="Core topics, adjacent topics to ignore, ideal customer profile..."
                defaultValue={company.profile ?? ""}
              />
            </Field>
            <Field label="Guardrails" htmlFor="guardrails_md">
              <Textarea
                id="guardrails_md"
                name="guardrails_md"
                rows={5}
                placeholder="Brand tone rules, required disclaimers..."
                defaultValue={company.guardrails_md ?? ""}
              />
            </Field>
          </CardContent>
        </Card>

        <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription>
            POST a post (or array of posts) to the inbound webhook from Zapier/Make/n8n as an
            alternative to the Apify search — same dedupe + AI classification pipeline either
            way.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={webhookUrl} className="min-w-0 flex-1 font-mono text-xs" />
            <CopyButton value={webhookUrl} />
          </div>
          <form action={regenerateAction}>
            <SubmitButton variant="secondary" size="sm" pendingText="Regenerating…">
              Regenerate token
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
