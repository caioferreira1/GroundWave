import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";

export default async function CompanyOverviewPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, profile, guardrails_md, inbound_webhook_token, posts_fetch_enabled, posts_last_fetched_at, posts_last_error",
    )
    .eq("id", companyId)
    .maybeSingle();

  if (!company) notFound();

  const stats: Array<{ label: string; ready: boolean; readyText: string; notReadyText: string }> = [
    {
      label: "Ingestion",
      ready: company.posts_fetch_enabled,
      readyText: "Enabled",
      notReadyText: "Disabled",
    },
    {
      label: "Profile",
      ready: Boolean(company.profile),
      readyText: "Generated",
      notReadyText: "Not generated",
    },
    {
      label: "Guardrails",
      ready: Boolean(company.guardrails_md),
      readyText: "Set",
      notReadyText: "Not set",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{s.label}</p>
            <div className="mt-2">
              <Badge variant={s.ready ? "good" : "neutral"}>
                {s.ready ? s.readyText : s.notReadyText}
              </Badge>
            </div>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Last run</p>
          <div className="mt-2">
            {company.posts_last_error ? (
              <Badge variant="critical">Failed</Badge>
            ) : company.posts_last_fetched_at ? (
              <Badge variant="good">Ran</Badge>
            ) : (
              <Badge variant="neutral">Never</Badge>
            )}
          </div>
          {company.posts_last_fetched_at && (
            <p className="mt-2 text-xs text-ink-muted">
              {new Date(company.posts_last_fetched_at).toLocaleString()}
            </p>
          )}
          {company.posts_last_error && (
            <p className="mt-1 text-xs break-words text-critical">{company.posts_last_error}</p>
          )}
        </Card>
      </div>

      <p className="text-sm text-ink-muted">
        Configure keyword/subreddit search and review incoming posts in the Settings and Posts
        tabs above. Personas and the post generator are built out in later phases.
      </p>
    </div>
  );
}
