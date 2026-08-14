import { Repeat } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import type { AccountRotationCountdown, CompanyMentionRotationStatus } from "@/lib/activity/rotation";
import { DismissibleNotice } from "./dismissible-notice";

export type RotationRow = {
  accountId: string;
  accountName: string;
  ownerName: string;
  genericPostsDone: number;
  countdown: AccountRotationCountdown;
};

function StatusBadge({ countdown }: { countdown: AccountRotationCountdown }) {
  switch (countdown.state) {
    case "posting_today":
      return countdown.early ? (
        <Badge variant="warning" dot pulse>
          Target post today — early pick
        </Badge>
      ) : (
        <Badge variant="accent" dot pulse>
          Target post today
        </Badge>
      );
    case "eligible_awaiting_turn":
      return <Badge variant="good">Eligible — awaiting turn</Badge>;
    case "eligible_early_if_needed":
      return <Badge variant="neutral">70%+ — only if needed</Badge>;
    case "quota_met_this_week":
      return <Badge variant="warning">Quota met this week</Badge>;
    case "accruing": {
      const days = countdown.estimatedDaysUntilEligible;
      return (
        <Badge variant="neutral">
          Target post in ~{days} day{days === 1 ? "" : "s"}
        </Badge>
      );
    }
  }
}

/**
 * Per-account view of the "N generic posts before 1 target post" rotation
 * gate — complements TodaysTasksCard's aggregate weekly meters with the
 * "who's eligible, and when will the rest be" detail, including the
 * countdown the user asked for. Deliberately a separate card rather than
 * folded into TodaysTasksCard: that card answers "how's the week going",
 * this one answers "who's next and why".
 */
export function RotationStatusCard({
  goals,
  rotationStatus,
  rows,
  hasActiveAccounts,
}: {
  goals: { genericPostsBeforeTarget: number };
  rotationStatus: CompanyMentionRotationStatus;
  rows: RotationRow[];
  hasActiveAccounts: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Target post rotation</CardTitle>
        <CardDescription>
          Each account needs {goals.genericPostsBeforeTarget} generic post
          {goals.genericPostsBeforeTarget === 1 ? "" : "s"} since its last target post before it&apos;s eligible for
          the next one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasActiveAccounts ? (
          <EmptyState
            icon={Repeat}
            title="No active accounts yet"
            description="Add this company's Reddit accounts in the Accounts tab to start tracking the rotation."
          />
        ) : (
          <>
            {rotationStatus.state === "no_eligible_accounts_yet" && (
              <p className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                No account has reached even 70% of {goals.genericPostsBeforeTarget} generic posts yet, so no target
                post is expected this period — this is expected, not a missed goal.
              </p>
            )}
            {rotationStatus.state === "quota_met_this_week" && (
              <p className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                This week&apos;s target-post quota is already met — rotation resumes next week.
              </p>
            )}
            {rotationStatus.state === "assigned" && rotationStatus.relaxed && (
              <DismissibleNotice className="text-xs">
                Today&apos;s target post is an early pick — the chosen account hasn&apos;t reached the full{" "}
                {goals.genericPostsBeforeTarget} generic posts, only the 70% last-resort minimum, and was picked
                because no other account was ready.
              </DismissibleNotice>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Generic posts</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell className="font-mono text-xs text-foreground">
                      u/{row.accountName.replace(/^u\//i, "")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.ownerName}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ProgressBar value={row.genericPostsDone} max={goals.genericPostsBeforeTarget} />
                        {row.genericPostsDone}/{goals.genericPostsBeforeTarget}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge countdown={row.countdown} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
