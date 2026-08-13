import { CheckCircle2 } from "lucide-react";
import { Avatar, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import type { CollaboratorTasks } from "@/lib/activity/rotation";

export type WeeklyGoalSummary = {
  genericCommentsMin: number;
  genericCommentsMax: number;
  targetCommentsMin: number;
  targetCommentsMax: number;
  genericPostIntervalDays: number;
  companyPostPerWeek: number;
};

function taskChips(account: CollaboratorTasks["accounts"][number]): string[] {
  const chips: string[] = [];
  if (account.companyMentionPostToday) chips.push("Company-mention post");
  if (account.genericPostToday) chips.push("Generic post");
  if (account.genericCommentsToday > 0) {
    chips.push(`${account.genericCommentsToday} generic comment${account.genericCommentsToday === 1 ? "" : "s"}`);
  }
  if (account.targetCommentsToday > 0) {
    chips.push(`${account.targetCommentsToday} target comment${account.targetCommentsToday === 1 ? "" : "s"}`);
  }
  return chips;
}

/**
 * "Done" here is never a stored flag — it's whatever's left after
 * subtracting real tagged activity (reddit_account_id + comment_type/
 * post_type) from this week's goals. Logging a comment/post through the
 * existing mark-posted flows is what makes a chip disappear; there's no
 * separate task-completion state anywhere. Tasks are shown per account
 * (not summed per person) so it's clear which account needs what.
 */
export function TodaysTasksCard({
  goals,
  collaboratorTasks,
  nameByOwner,
  hasActiveAccounts,
}: {
  goals: WeeklyGoalSummary;
  collaboratorTasks: CollaboratorTasks[];
  nameByOwner: Map<string, string>;
  hasActiveAccounts: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s tasks</CardTitle>
        <CardDescription>Weekly goal per account, and who still owes what today.</CardDescription>
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
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-4">
              <Badge variant="neutral">
                {goals.genericCommentsMin}–{goals.genericCommentsMax} generic comments/wk
              </Badge>
              <Badge variant="neutral">
                {goals.targetCommentsMin}–{goals.targetCommentsMax} target comments/wk
              </Badge>
              <Badge variant="neutral">Generic post every {goals.genericPostIntervalDays}d</Badge>
              <Badge variant="neutral">
                {goals.companyPostPerWeek} company-mention post{goals.companyPostPerWeek === 1 ? "" : "s"}/wk (rotates)
              </Badge>
            </div>

            <ul className="space-y-3 pt-1">
              {collaboratorTasks.map((collaborator) => {
                const name = nameByOwner.get(collaborator.ownerUserId) ?? "Unknown";
                const accountsWithTasks = collaborator.accounts.filter((a) => taskChips(a).length > 0);

                return (
                  <li key={collaborator.ownerUserId} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={name} size="sm" />
                      <span className="text-sm font-medium text-foreground">{name}</span>
                      {accountsWithTasks.length === 0 && <Badge variant="good">All caught up today</Badge>}
                    </div>
                    {accountsWithTasks.map((account) => (
                      <div key={account.accountId} className="ml-9 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground">u/{account.accountName}</span>
                        {taskChips(account).map((chip) => (
                          <Badge key={chip} variant="accent">
                            {chip}
                          </Badge>
                        ))}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
