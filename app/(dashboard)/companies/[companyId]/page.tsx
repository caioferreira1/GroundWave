import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, FileText, Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeading, StatCard, buttonClass } from "@/components/ui";

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
      "id, name, profile, inbound_webhook_token, posts_fetch_enabled, posts_last_fetched_at, posts_last_error",
    )
    .eq("id", companyId)
    .maybeSingle();

  if (!company) notFound();

  const hasProfile = Boolean(company.profile);

  return (
    <div className="space-y-6">
      <PageHeading title="Overview" description="Monitoring status for this company." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Radio}
          label="Ingestion"
          value={
            <Badge
              variant={company.posts_fetch_enabled ? "good" : "neutral"}
              dot
              pulse={company.posts_fetch_enabled}
            >
              {company.posts_fetch_enabled ? "Enabled" : "Disabled"}
            </Badge>
          }
        />
        <StatCard
          icon={FileText}
          label="Profile"
          value={
            <Badge variant={hasProfile ? "good" : "neutral"}>
              {hasProfile ? "Generated" : "Not generated"}
            </Badge>
          }
        />
        <StatCard
          icon={Activity}
          label="Last run"
          value={
            company.posts_last_error ? (
              <Badge variant="critical">Failed</Badge>
            ) : company.posts_last_fetched_at ? (
              <Badge variant="good">Ran</Badge>
            ) : (
              <Badge variant="neutral">Never</Badge>
            )
          }
          hint={
            <>
              {company.posts_last_fetched_at && (
                <p className="mt-2 text-xs text-ink-muted">
                  {new Date(company.posts_last_fetched_at).toLocaleString()}
                </p>
              )}
              {company.posts_last_error && (
                <p className="mt-1 text-xs break-words text-critical">{company.posts_last_error}</p>
              )}
            </>
          }
        />
      </div>

      {!hasProfile && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">Add a company profile</p>
            <p className="text-sm text-ink-muted">
              The relevance classifier uses this as ground truth — without it, every post is
              marked not relevant.
            </p>
          </div>
          <Link href={`/companies/${companyId}/settings`} className={buttonClass("secondary", "md", "shrink-0")}>
            Go to Settings
          </Link>
        </Card>
      )}
    </div>
  );
}
