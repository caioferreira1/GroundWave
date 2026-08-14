"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, Badge, Card, Checkbox, ProgressBar } from "@/components/ui";
import { taskItems, type CollaboratorTasks, type DailyTaskKey } from "@/lib/activity/rotation";
import { DismissibleNotice } from "./dismissible-notice";

function completionKey(accountId: string, taskKey: DailyTaskKey): string {
  return `${accountId}:${taskKey}`;
}

export function TodaysTaskList({
  collaboratorTasks,
  nameByOwner,
  taskDate,
  initialCompletions,
  autoCompletedKeys,
  toggleTask,
}: {
  collaboratorTasks: CollaboratorTasks[];
  nameByOwner: Map<string, string>;
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
  const [completed, setCompleted] = useState(initialCompletions);
  const [, startTransition] = useTransition();

  function isDone(accountId: string, taskKey: DailyTaskKey): boolean {
    const key = completionKey(accountId, taskKey);
    return completed.has(key) || autoCompletedKeys.has(key);
  }

  function handleToggle(accountId: string, taskKey: DailyTaskKey, count: number, next: boolean) {
    const key = completionKey(accountId, taskKey);
    setCompleted((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });

    startTransition(async () => {
      try {
        await toggleTask(accountId, taskKey, taskDate, next, count);
      } catch (err) {
        setCompleted((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(key);
          else copy.add(key);
          return copy;
        });
        toast.error(err instanceof Error ? err.message : "Failed to update task.");
      }
    });
  }

  return (
    <ul className="space-y-4">
      {collaboratorTasks.map((collaborator) => {
        const name = nameByOwner.get(collaborator.ownerUserId) ?? "Unknown";
        const accountsWithTasks = collaborator.accounts
          .map((account) => ({ account, items: taskItems(account) }))
          .filter(({ items }) => items.length > 0);

        const totalTasks = accountsWithTasks.reduce((sum, { items }) => sum + items.length, 0);
        const doneTasks = accountsWithTasks.reduce(
          (sum, { account, items }) => sum + items.filter((item) => isDone(account.accountId, item.key)).length,
          0,
        );

        return (
          <li key={collaborator.ownerUserId} className="space-y-2">
            <div className="flex items-center gap-2">
              <Avatar name={name} size="sm" />
              <span className="text-sm font-medium text-foreground">{name}</span>
              {totalTasks === 0 ? (
                <Badge variant="good">All caught up today</Badge>
              ) : (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ProgressBar value={doneTasks} max={totalTasks} />
                  {doneTasks}/{totalTasks} done today
                </span>
              )}
            </div>

            {accountsWithTasks.length > 0 && (
              <div className="ml-9 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {accountsWithTasks.map(({ account, items }) => (
                  <Card key={account.accountId} className="space-y-1.5 p-3">
                    <p className="font-mono text-xs text-muted-foreground">
                      {/* account_name is stored as typed, sometimes already including a "u/" prefix — don't double it. */}
                      u/{account.accountName.replace(/^u\//i, "")}
                    </p>
                    {account.genericPostDelayedByTarget && (
                      <DismissibleNotice>Generic post delayed — target post took priority today</DismissibleNotice>
                    )}
                    {account.companyMentionPostIsEarly && (
                      <DismissibleNotice>
                        Target post is an early pick — 100% of generic posts not reached yet
                      </DismissibleNotice>
                    )}
                    <ul className="space-y-1">
                      {items.map((item) => {
                        const key = completionKey(account.accountId, item.key);
                        const isAuto = autoCompletedKeys.has(key);
                        const done = isAuto || completed.has(key);
                        return (
                          <li key={item.key}>
                            <Checkbox
                              id={`task-${key}`}
                              checked={done}
                              disabled={isAuto}
                              onChange={(e) => handleToggle(account.accountId, item.key, item.count, e.target.checked)}
                              label={
                                <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>
                                  {item.label}
                                  {isAuto && (
                                    <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-primary no-underline">
                                      logged
                                    </span>
                                  )}
                                </span>
                              }
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
