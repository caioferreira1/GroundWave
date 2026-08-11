import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, Eye, FileText, MessagesSquare, Radio, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeading, StatCard, buttonClass } from "@/components/ui";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartLegend } from "@/components/analytics/legend";
import { TrendAreaChart } from "@/components/analytics/trend-area-chart";
import { TrendDualAreaChart } from "@/components/analytics/trend-dual-area-chart";
import { getCommentsTrend, getOverviewTotals, getPostsPostedTrend, getViewsTrend } from "@/lib/analytics/queries";

export default async function CompanyOverviewPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  const [{ data: company }, postsTrend, commentsTrend, viewsTrend, totals] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, profile, inbound_webhook_token, posts_fetch_enabled, posts_last_fetched_at, posts_last_error",
      )
      .eq("id", companyId)
      .maybeSingle(),
    getPostsPostedTrend(supabase, companyId),
    getCommentsTrend(supabase, companyId),
    getViewsTrend(supabase, companyId),
    getOverviewTotals(supabase, companyId),
  ]);

  if (!company) notFound();

  const hasProfile = Boolean(company.profile);

  return (
    <div className="space-y-6">
      <PageHeading title="Overview" description="Monitoring status and activity for this company." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <StatCard
          className="lg:col-span-3"
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
          className="lg:col-span-3"
          icon={FileText}
          label="Profile"
          value={
            <Badge variant={hasProfile ? "good" : "neutral"}>
              {hasProfile ? "Generated" : "Not generated"}
            </Badge>
          }
        />
        <StatCard
          className="sm:col-span-2 lg:col-span-6"
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
        <StatCard
          className="lg:col-span-4"
          icon={Send}
          label="Posts posted"
          value={<span className="text-2xl font-semibold text-ink">{totals.postsPosted}</span>}
        />
        <StatCard
          className="lg:col-span-4"
          icon={MessagesSquare}
          label="Comments posted"
          value={<span className="text-2xl font-semibold text-ink">{totals.commentsPosted}</span>}
        />
        <StatCard
          className="lg:col-span-4"
          icon={Eye}
          label="Reported views"
          value={<span className="text-2xl font-semibold text-ink">{totals.reportedViews}</span>}
          hint={<p className="mt-2 text-xs text-ink-muted">Manually entered</p>}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ChartCard
            title="Posts posted"
            description="By week — last 12 weeks, plus 4 weeks ahead"
            isEmpty={postsTrend.every((p) => p.count === 0)}
            emptyDescription="No posts marked as posted in this window yet."
          >
            <TrendAreaChart data={postsTrend} color="var(--color-accent)" name="Posts posted" />
          </ChartCard>
        </div>

        <div className="lg:col-span-5">
          <ChartCard
            title="Comments"
            description="Generated vs. posted, by week"
            isEmpty={commentsTrend.every((p) => p.generated === 0 && p.posted === 0)}
            emptyDescription="No reply drafts generated or posted in this window yet."
            legend={
              <ChartLegend
                items={[
                  { label: "Generated", color: "var(--color-accent)" },
                  { label: "Posted", color: "var(--color-accent-2)" },
                ]}
              />
            }
          >
            <TrendDualAreaChart
              data={commentsTrend}
              series={[
                { key: "generated", name: "Generated", color: "var(--color-accent)" },
                { key: "posted", name: "Posted", color: "var(--color-accent-2)" },
              ]}
              glow
            />
          </ChartCard>
        </div>
      </div>

      <ChartCard
        title="Reported views"
        description="Manually entered, summed by week posted"
        isEmpty={viewsTrend.every((p) => p.postViews === 0 && p.commentViews === 0)}
        emptyDescription="No views reported for this window yet."
        legend={
          <ChartLegend
            items={[
              { label: "From posts", color: "var(--color-accent)" },
              { label: "From comments", color: "var(--color-accent-2)" },
            ]}
          />
        }
      >
        <TrendDualAreaChart
          data={viewsTrend}
          series={[
            { key: "postViews", name: "From posts", color: "var(--color-accent)" },
            { key: "commentViews", name: "From comments", color: "var(--color-accent-2)" },
          ]}
          stacked
          glow
        />
      </ChartCard>
    </div>
  );
}
