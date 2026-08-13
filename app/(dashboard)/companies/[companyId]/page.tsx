import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, MessagesSquare, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeading, StatCard, buttonClass } from "@/components/ui";
import { CategoryBarChart } from "@/components/analytics/category-bar-chart";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartLegend } from "@/components/analytics/legend";
import { TrendAreaChart } from "@/components/analytics/trend-area-chart";
import { TrendDualAreaChart } from "@/components/analytics/trend-dual-area-chart";
import { TodaysTasksCard } from "@/components/activity/todays-tasks";
import { getActiveRedditAccounts } from "@/lib/activity/accounts";
import {
  getManualCompletionActivity,
  getTodaysRealActivity,
  getTodaysTaskCompletions,
  getWeekActivityForRotation,
} from "@/lib/activity/queries";
import {
  computeAccountDailyTasks,
  computeAutoCompletedKeys,
  computeWeeklyGoalProgress,
  groupTasksByCollaborator,
  mergeActivity,
  pickCompanyMentionOwnerAccountId,
  type WeeklyGoalProgress,
} from "@/lib/activity/rotation";
import { setDailyTaskCompletion } from "./actions";
import {
  getActivityByRedditAccount,
  getCollaboratorActivity,
  getCommentsBySubreddit,
  getCommentsTrend,
  getOverviewTotals,
  getPostsBySubreddit,
  getPostsPostedTrend,
  getViewsTrend,
} from "@/lib/analytics/queries";

export default async function CompanyOverviewPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roles } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id)
    : { data: [] };
  const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "coworker");

  const [
    { data: company },
    postsTrend,
    commentsTrend,
    viewsTrend,
    totals,
    postsBySubreddit,
    commentsBySubreddit,
    collaboratorActivity,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, profile, inbound_webhook_token, activity_generic_comments_per_week, activity_target_comments_per_week, activity_generic_post_interval_days, activity_company_post_per_week",
      )
      .eq("id", companyId)
      .maybeSingle(),
    getPostsPostedTrend(supabase, companyId),
    getCommentsTrend(supabase, companyId),
    getViewsTrend(supabase, companyId),
    getOverviewTotals(supabase, companyId),
    getPostsBySubreddit(supabase, companyId),
    getCommentsBySubreddit(supabase, companyId),
    getCollaboratorActivity(supabase, companyId),
  ]);

  if (!company) notFound();

  const hasProfile = Boolean(company.profile);

  // Reddit accounts are staff-only (no client RLS policy on reddit_accounts)
  // — skip these queries entirely for non-staff viewers rather than relying
  // on RLS to silently empty them out.
  let accountActivity: Awaited<ReturnType<typeof getActivityByRedditAccount>> = [];
  let collaboratorTasks: ReturnType<typeof groupTasksByCollaborator> = [];
  let hasActiveAccounts = false;
  let nameByOwner = new Map<string, string>();
  let taskCompletions = new Set<string>();
  let autoCompletedKeys = new Set<string>();
  let weeklyProgress: WeeklyGoalProgress = {
    genericComments: { done: 0, target: 0 },
    targetComments: { done: 0, target: 0 },
    genericPosts: { done: 0, target: 0 },
    companyMentionPosts: { done: 0, target: 0 },
  };

  // UTC calendar date, matching the rest of the app's UTC-only date handling
  // (see lib/analytics/bucket.ts) — a session left open past midnight UTC
  // will keep checking off "yesterday"'s tasks until the page reloads.
  const taskDate = new Date().toISOString().slice(0, 10);

  const goals = {
    genericCommentsPerWeek: company.activity_generic_comments_per_week,
    targetCommentsPerWeek: company.activity_target_comments_per_week,
    genericPostIntervalDays: company.activity_generic_post_interval_days,
    companyPostPerWeek: company.activity_company_post_per_week,
  };

  if (isStaff) {
    const [accounts, realActivity, manualActivity, todaysActivity, activityByAccount, { data: profiles }, completions] =
      await Promise.all([
        getActiveRedditAccounts(supabase, companyId),
        getWeekActivityForRotation(supabase, companyId),
        getManualCompletionActivity(supabase, companyId),
        getTodaysRealActivity(supabase, companyId, taskDate),
        getActivityByRedditAccount(supabase, companyId),
        supabase.from("profiles").select("id, display_name, email"),
        getTodaysTaskCompletions(supabase, companyId, taskDate),
      ]);

    accountActivity = activityByAccount;
    hasActiveAccounts = accounts.length > 0;
    nameByOwner = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));
    taskCompletions = completions;

    const activity = mergeActivity(realActivity, manualActivity);
    const companyMentionOwnerAccountId = pickCompanyMentionOwnerAccountId(accounts, activity, goals);
    const dailyTasks = computeAccountDailyTasks(accounts, goals, activity, companyMentionOwnerAccountId);
    collaboratorTasks = groupTasksByCollaborator(dailyTasks, accounts);
    weeklyProgress = computeWeeklyGoalProgress(accounts, goals, activity);
    autoCompletedKeys = computeAutoCompletedKeys(dailyTasks, todaysActivity);
  }

  const boundToggleTask = setDailyTaskCompletion.bind(null, companyId);

  return (
    <div className="space-y-6">
      <PageHeading title="Overview" description="Monitoring status and activity for this company." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <StatCard
          className="lg:col-span-4"
          icon={Send}
          label="Posts posted"
          value={<span className="text-2xl font-semibold text-foreground">{totals.postsPosted}</span>}
        />
        <StatCard
          className="lg:col-span-4"
          icon={MessagesSquare}
          label="Comments posted"
          value={<span className="text-2xl font-semibold text-foreground">{totals.commentsPosted}</span>}
        />
        <StatCard
          className="lg:col-span-4"
          icon={Eye}
          label="Reported views"
          value={<span className="text-2xl font-semibold text-foreground">{totals.reportedViews}</span>}
          hint={<p className="mt-2 text-xs text-muted-foreground">Manually entered</p>}
        />
      </div>

      {isStaff && (
        <TodaysTasksCard
          goals={goals}
          weeklyProgress={weeklyProgress}
          collaboratorTasks={collaboratorTasks}
          nameByOwner={nameByOwner}
          hasActiveAccounts={hasActiveAccounts}
          taskDate={taskDate}
          initialCompletions={taskCompletions}
          autoCompletedKeys={autoCompletedKeys}
          toggleTask={boundToggleTask}
        />
      )}

      {!hasProfile && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Add a company profile</p>
            <p className="text-sm text-muted-foreground">
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
            <TrendAreaChart data={postsTrend} color="var(--color-primary)" name="Posts posted" />
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
                  { label: "Generated", color: "var(--color-primary)" },
                  { label: "Posted", color: "var(--color-accent-2)" },
                ]}
              />
            }
          >
            <TrendDualAreaChart
              data={commentsTrend}
              series={[
                { key: "generated", name: "Generated", color: "var(--color-primary)" },
                { key: "posted", name: "Posted", color: "var(--color-accent-2)" },
              ]}
            />
          </ChartCard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <ChartCard
            title="Posts by subreddit"
            description="All-time, posted posts"
            isEmpty={postsBySubreddit.length === 0}
            emptyDescription="No posts marked as posted yet."
          >
            <CategoryBarChart
              data={postsBySubreddit.map((s) => ({ label: s.subreddit, count: s.count }))}
              series={[{ key: "count", name: "Posts posted", color: "var(--color-primary)" }]}
            />
          </ChartCard>
        </div>

        <div className="lg:col-span-6">
          <ChartCard
            title="Comments by subreddit"
            description="All-time, posted comments"
            isEmpty={commentsBySubreddit.length === 0}
            emptyDescription="No comments posted yet."
          >
            <CategoryBarChart
              data={commentsBySubreddit.map((s) => ({ label: s.subreddit, count: s.count }))}
              series={[{ key: "count", name: "Comments posted", color: "var(--color-accent-2)" }]}
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
              { label: "From posts", color: "var(--color-primary)" },
              { label: "From comments", color: "var(--color-accent-2)" },
            ]}
          />
        }
      >
        <TrendDualAreaChart
          data={viewsTrend}
          series={[
            { key: "postViews", name: "From posts", color: "var(--color-primary)" },
            { key: "commentViews", name: "From comments", color: "var(--color-accent-2)" },
          ]}
          stacked
        />
      </ChartCard>

      <ChartCard
        title="Activity by collaborator"
        description="All-time posts and comments posted, per staff member"
        isEmpty={collaboratorActivity.length === 0}
        emptyDescription="No posts or comments posted by staff yet."
        legend={
          <ChartLegend
            items={[
              { label: "Posts", color: "var(--color-primary)" },
              { label: "Comments", color: "var(--color-accent-2)" },
            ]}
          />
        }
      >
        <CategoryBarChart
          data={collaboratorActivity.map((c) => ({ label: c.name, posts: c.posts, comments: c.comments }))}
          series={[
            { key: "posts", name: "Posts", color: "var(--color-primary)" },
            { key: "comments", name: "Comments", color: "var(--color-accent-2)" },
          ]}
        />
      </ChartCard>

      {isStaff && (
        <ChartCard
          title="Activity by Reddit account"
          description="All-time posts and comments posted, per account"
          isEmpty={accountActivity.length === 0}
          emptyDescription="No posted activity tagged with a Reddit account yet."
          legend={
            <ChartLegend
              items={[
                { label: "Posts", color: "var(--color-primary)" },
                { label: "Comments", color: "var(--color-accent-2)" },
              ]}
            />
          }
        >
          <CategoryBarChart
            data={accountActivity.map((a) => ({ label: a.name, posts: a.posts, comments: a.comments }))}
            series={[
              { key: "posts", name: "Posts", color: "var(--color-primary)" },
              { key: "comments", name: "Comments", color: "var(--color-accent-2)" },
            ]}
          />
        </ChartCard>
      )}
    </div>
  );
}
