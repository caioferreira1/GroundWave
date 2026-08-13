import { CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Meter } from "@/components/ui";
import type { CollaboratorTasks, DailyTaskKey, WeeklyGoalProgress } from "@/lib/activity/rotation";
import { TodaysTaskList } from "./todays-task-list";

export type WeeklyGoalSummary = {
  genericCommentsMin: number;
  genericCommentsMax: number;
  targetCommentsMin: number;
  targetCommentsMax: number;
  genericPostIntervalDays: number;
  companyPostPerWeek: number;
};

/**
 * "Done" here is whatever's left after subtracting activity from this
 * week's goals — but "activity" now blends two sources: real tagged
 * activity (reddit_account_id + comment_type/post_type, from the mark-
 * posted flows) and manual checkbox completions (see
 * supabase/migrations/0018_daily_task_completions.sql), merged together in
 * lib/activity/rotation.ts's mergeActivity(). Checking a task off here
 * therefore both reduces what's asked for tomorrow and moves the weekly
 * meters up top — it's a self-reported stand-in for real activity, not a
 * separate completion flag. Tasks are shown per account (not summed per
 * person) so it's clear which account needs what.
 *
 * A third source, `autoCompletedKeys` (lib/activity/rotation.ts's
 * computeAutoCompletedKeys()), auto-checks a chip when today's real tagged
 * activity alone already covers it — e.g. mark a comment posted with the
 * right account + "target" type, and that account's "target comments" chip
 * checks itself off. Read-only: it's never written to
 * daily_task_completions, since the underlying activity is already counted
 * once via mergeActivity(). See TodaysTaskList for how it renders (checked
 * and locked, not togglable).
 *
 * The meters up top and the checklist below still answer two different
 * questions at two different grains — "how's the week going" (aggregate)
 * vs "what does each account owe today" (per-account) — so they stay
 * visually and structurally separate even though they now share the same
 * underlying numbers.
 */
export function TodaysTasksCard({
  goals,
  weeklyProgress,
  collaboratorTasks,
  nameByOwner,
  hasActiveAccounts,
  taskDate,
  initialCompletions,
  autoCompletedKeys,
  toggleTask,
}: {
  goals: WeeklyGoalSummary;
  weeklyProgress: WeeklyGoalProgress;
  collaboratorTasks: CollaboratorTasks[];
  nameByOwner: Map<string, string>;
  hasActiveAccounts: boolean;
  taskDate: string;
  initialCompletions: Set<string>;
  autoCompletedKeys: Set<string>;
  toggleTask: (
    redditAccountId: string,
    taskKey: DailyTaskKey,
    taskDate: string,
    completed: boolean,
    count: number,
  ) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Today&apos;s tasks</CardTitle>
            <CardDescription>Weekly goal per account, and who still owes what today.</CardDescription>
          </div>
          <div className="group relative shrink-0">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Weekly goal configuration"
            >
              <Info className="h-4 w-4" />
            </button>
            <div className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-64 space-y-1.5 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
              <p>Per-account weekly config:</p>
              <p>
                {goals.genericCommentsMin}–{goals.genericCommentsMax} generic comments/wk
              </p>
              <p>
                {goals.targetCommentsMin}–{goals.targetCommentsMax} target comments/wk
              </p>
              <p>Generic post every {goals.genericPostIntervalDays}d</p>
              <p>
                {goals.companyPostPerWeek} company-mention post{goals.companyPostPerWeek === 1 ? "" : "s"}/wk (rotates)
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasActiveAccounts ? (
          <EmptyState
            icon={CheckCircle2}
            title="No active accounts yet"
            description="Add this company's Reddit accounts in the Accounts tab to start tracking daily tasks."
          />
        ) : (
          <>
            <div className="space-y-2 border-b border-border pb-4">
              <p className="text-xs font-medium text-muted-foreground">This week, across all active accounts</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Meter
                  label="Generic comments"
                  done={weeklyProgress.genericComments.done}
                  target={weeklyProgress.genericComments.target}
                />
                <Meter
                  label="Target comments"
                  done={weeklyProgress.targetComments.done}
                  target={weeklyProgress.targetComments.target}
                />
                <Meter label="Generic posts" done={weeklyProgress.genericPosts.done} target={weeklyProgress.genericPosts.target} />
                <Meter
                  label="Company-mention posts"
                  done={weeklyProgress.companyMentionPosts.done}
                  target={weeklyProgress.companyMentionPosts.target}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Today, by collaborator and account</p>
              <TodaysTaskList
                collaboratorTasks={collaboratorTasks}
                nameByOwner={nameByOwner}
                taskDate={taskDate}
                initialCompletions={initialCompletions}
                autoCompletedKeys={autoCompletedKeys}
                toggleTask={toggleTask}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
