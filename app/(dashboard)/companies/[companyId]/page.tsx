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
      "id, name, website_url, profile, guardrails_md, inbound_webhook_token, posts_fetch_enabled",
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
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-semibold text-accent-strong">
          {company.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{company.name}</h1>
          {company.website_url && <p className="text-sm text-ink-muted">{company.website_url}</p>}
        </div>
      </div>

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
      </div>

      <p className="text-sm text-ink-muted">
        Settings, personas, posts, and post-generator tabs are built out in later phases
        (see the plan) — this overview is the Phase 1 placeholder.
      </p>
    </div>
  );
}
