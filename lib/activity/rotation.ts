/**
 * Pure computation of "who owes what today" from a company's active Reddit
 * accounts, its weekly activity goals, and this week's already-tagged
 * activity. No persistence, no cron: logging real activity through the
 * existing "mark posted"/"log manual comment" flows (which tag
 * reddit_account_id + comment_type/post_type) is what reduces these numbers
 * — there's no separate task/assignment state to keep in sync, and the
 * company-mention rotation below self-corrects if an account is added later
 * or someone misses their turn, since it's picked by recency each time
 * rather than a stored pointer.
 *
 * The manual "check off" completions from daily_task_completions
 * (supabase/migrations/0018) are folded into the same WeekActivity shape via
 * mergeActivity() before any of this runs, so a checked-off task counts the
 * same as real tagged activity everywhere below — it reduces tomorrow's
 * remaining quota and moves the weekly progress meters. It's a
 * self-reported source layered on top of the real one though: if the same
 * work later also gets logged for real, it's counted twice.
 */

export type RedditAccountForRotation = {
  id: string;
  account_name: string;
  owner_user_id: string;
};

export type ActivityGoals = {
  genericCommentsMax: number;
  targetCommentsMax: number;
  genericPostIntervalDays: number;
  companyPostPerWeek: number;
};

/** Pre-aggregated by the caller from tagged `posts`/`post_generations` rows. */
export type WeekActivity = {
  /** This ISO week only, keyed by reddit_account_id. */
  commentsByAccount: Map<string, { generic: number; target: number }>;
  /** This ISO week only, keyed by reddit_account_id. */
  postsByAccount: Map<string, { generic: number; company_mention: number }>;
  /** Most recent ever (any week), keyed by reddit_account_id — null/missing = never posted. */
  lastGenericPostAt: Map<string, string | null>;
  /** Most recent ever (any week), keyed by reddit_account_id — null/missing = never posted. */
  lastCompanyMentionPostAt: Map<string, string | null>;
};

export type AccountDailyTask = {
  accountId: string;
  accountName: string;
  genericCommentsToday: number;
  targetCommentsToday: number;
  genericPostToday: boolean;
  companyMentionPostToday: boolean;
};

/** One collaborator's tasks, broken out per account they own — never summed across accounts, so it's clear which account needs what. */
export type CollaboratorTasks = {
  ownerUserId: string;
  accounts: AccountDailyTask[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO weekday, Monday = 1 .. Sunday = 7 (matches lib/analytics/bucket.ts's Monday-start convention). */
function isoWeekday(now: Date): number {
  return now.getUTCDay() || 7;
}

function daysSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return Infinity;
  return (now.getTime() - new Date(iso).getTime()) / DAY_MS;
}

function laterOf(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/** Adds `extra` (e.g. manual completions) on top of `base` (real tagged activity) — same shape in, same shape out, so every function below stays oblivious to where the numbers came from. */
export function mergeActivity(base: WeekActivity, extra: WeekActivity): WeekActivity {
  const commentsByAccount = new Map(base.commentsByAccount);
  for (const [accountId, extraCounts] of extra.commentsByAccount) {
    const current = commentsByAccount.get(accountId) ?? { generic: 0, target: 0 };
    commentsByAccount.set(accountId, {
      generic: current.generic + extraCounts.generic,
      target: current.target + extraCounts.target,
    });
  }

  const postsByAccount = new Map(base.postsByAccount);
  for (const [accountId, extraCounts] of extra.postsByAccount) {
    const current = postsByAccount.get(accountId) ?? { generic: 0, company_mention: 0 };
    postsByAccount.set(accountId, {
      generic: current.generic + extraCounts.generic,
      company_mention: current.company_mention + extraCounts.company_mention,
    });
  }

  const lastGenericPostAt = new Map(base.lastGenericPostAt);
  for (const [accountId, extraIso] of extra.lastGenericPostAt) {
    lastGenericPostAt.set(accountId, laterOf(lastGenericPostAt.get(accountId), extraIso));
  }

  const lastCompanyMentionPostAt = new Map(base.lastCompanyMentionPostAt);
  for (const [accountId, extraIso] of extra.lastCompanyMentionPostAt) {
    lastCompanyMentionPostAt.set(accountId, laterOf(lastCompanyMentionPostAt.get(accountId), extraIso));
  }

  return { commentsByAccount, postsByAccount, lastGenericPostAt, lastCompanyMentionPostAt };
}

/**
 * Which active account owes this week's company-mention post: the one that
 * has gone longest without posting one (never-posted counts as most
 * overdue). Returns null once this week's quota is already met by someone,
 * or if there are no active accounts.
 */
export function pickCompanyMentionOwnerAccountId(
  accounts: RedditAccountForRotation[],
  activity: WeekActivity,
  goals: ActivityGoals,
  now: Date = new Date(),
): string | null {
  if (accounts.length === 0) return null;

  const doneThisWeek = [...activity.postsByAccount.values()].reduce(
    (sum, v) => sum + v.company_mention,
    0,
  );
  if (doneThisWeek >= goals.companyPostPerWeek) return null;

  let picked = accounts[0];
  let pickedAge = -Infinity;
  for (const account of accounts) {
    const age = daysSince(activity.lastCompanyMentionPostAt.get(account.id), now);
    if (age > pickedAge) {
      pickedAge = age;
      picked = account;
    }
  }
  return picked.id;
}

/**
 * Per-account "today" amounts: remaining weekly comment quota spread evenly
 * across the days left in the ISO week (including today), so the ask stays
 * small early in the week and catches up automatically near the weekend
 * instead of dumping the whole weekly number on one day.
 */
export function computeAccountDailyTasks(
  accounts: RedditAccountForRotation[],
  goals: ActivityGoals,
  activity: WeekActivity,
  companyMentionOwnerAccountId: string | null,
  now: Date = new Date(),
): AccountDailyTask[] {
  const daysLeftInWeek = Math.max(1, 8 - isoWeekday(now));

  return accounts.map((account) => {
    const done = activity.commentsByAccount.get(account.id) ?? { generic: 0, target: 0 };
    const genericRemaining = Math.max(0, goals.genericCommentsMax - done.generic);
    const targetRemaining = Math.max(0, goals.targetCommentsMax - done.target);

    return {
      accountId: account.id,
      accountName: account.account_name,
      genericCommentsToday: Math.ceil(genericRemaining / daysLeftInWeek),
      targetCommentsToday: Math.ceil(targetRemaining / daysLeftInWeek),
      genericPostToday: daysSince(activity.lastGenericPostAt.get(account.id), now) >= goals.genericPostIntervalDays,
      companyMentionPostToday: companyMentionOwnerAccountId === account.id,
    };
  });
}

export type WeeklyGoalProgress = {
  genericComments: { done: number; target: number };
  targetComments: { done: number; target: number };
  genericPosts: { done: number; target: number };
  companyMentionPosts: { done: number; target: number };
};

/**
 * Aggregate this-week progress across all active accounts, vs. the
 * company's weekly goals — the "how's the week going" view, distinct from
 * computeAccountDailyTasks's day-sliced per-account numbers above (which
 * answer "what does each account owe today"). Comment targets use the
 * configured minimum (the actual floor to hit) summed across accounts;
 * company-mention posts use the company-wide quota as-is. Generic posts
 * don't have an explicit weekly count in the goals (just a posting cadence
 * in days), so the weekly target approximates each account's expected post
 * count at that cadence.
 */
export function computeWeeklyGoalProgress(
  accounts: RedditAccountForRotation[],
  goals: {
    genericCommentsMin: number;
    targetCommentsMin: number;
    genericPostIntervalDays: number;
    companyPostPerWeek: number;
  },
  activity: WeekActivity,
): WeeklyGoalProgress {
  const numAccounts = accounts.length;
  const sumComments = (key: "generic" | "target") =>
    accounts.reduce((sum, a) => sum + (activity.commentsByAccount.get(a.id)?.[key] ?? 0), 0);
  const sumPosts = (key: "generic" | "company_mention") =>
    accounts.reduce((sum, a) => sum + (activity.postsByAccount.get(a.id)?.[key] ?? 0), 0);

  const expectedPostsPerAccount = Math.max(1, Math.floor(7 / goals.genericPostIntervalDays));

  return {
    genericComments: { done: sumComments("generic"), target: goals.genericCommentsMin * numAccounts },
    targetComments: { done: sumComments("target"), target: goals.targetCommentsMin * numAccounts },
    genericPosts: { done: sumPosts("generic"), target: expectedPostsPerAccount * numAccounts },
    companyMentionPosts: { done: sumPosts("company_mention"), target: goals.companyPostPerWeek },
  };
}

export type DailyTaskKey = "generic_post" | "company_mention_post" | "generic_comments" | "target_comments";

/**
 * One checkbox-able item derived from an account's daily task — `key` is
 * stable across days (for checkbox persistence), `label` carries the day's
 * actual count, and `count` is what gets recorded on daily_task_completions
 * when checked (1 for the boolean post tasks, the shown quantity for the
 * comment tasks) so mergeActivity() can fold it back in correctly.
 */
export function taskItems(account: AccountDailyTask): { key: DailyTaskKey; label: string; count: number }[] {
  const items: { key: DailyTaskKey; label: string; count: number }[] = [];
  if (account.companyMentionPostToday) {
    items.push({ key: "company_mention_post", label: "Company-mention post", count: 1 });
  }
  if (account.genericPostToday) {
    items.push({ key: "generic_post", label: "Generic post", count: 1 });
  }
  if (account.genericCommentsToday > 0) {
    items.push({
      key: "generic_comments",
      label: `${account.genericCommentsToday} generic comment${account.genericCommentsToday === 1 ? "" : "s"}`,
      count: account.genericCommentsToday,
    });
  }
  if (account.targetCommentsToday > 0) {
    items.push({
      key: "target_comments",
      label: `${account.targetCommentsToday} target comment${account.targetCommentsToday === 1 ? "" : "s"}`,
      count: account.targetCommentsToday,
    });
  }
  return items;
}

/** Real tagged activity (reddit_account_id + comment_type/post_type) posted on one specific day — see lib/activity/queries.ts::getTodaysRealActivity(). */
export type DailyActivity = {
  comments: Map<string, { generic: number; target: number }>;
  posts: Map<string, { generic: number; company_mention: number }>;
};

function realCountForTask(accountId: string, key: DailyTaskKey, activity: DailyActivity): number {
  switch (key) {
    case "generic_post":
      return activity.posts.get(accountId)?.generic ?? 0;
    case "company_mention_post":
      return activity.posts.get(accountId)?.company_mention ?? 0;
    case "generic_comments":
      return activity.comments.get(accountId)?.generic ?? 0;
    case "target_comments":
      return activity.comments.get(accountId)?.target ?? 0;
  }
}

/**
 * Which Today's tasks chips are already satisfied by real tagged activity
 * logged today — e.g. a target comment marked posted with the right account
 * today auto-satisfies that day's "target comments" chip without anyone
 * touching the checkbox. Compares each chip's already-computed `count`
 * (which is the remaining ask for today, itself already net of this week's
 * real activity via mergeActivity() upstream) against how much of that
 * specific type was logged for real *today* — once today's real count
 * catches up to what's still being asked, the chip is done.
 *
 * Deliberately never written back to daily_task_completions: doing so would
 * double-count in mergeActivity() (see that function's caller in page.tsx).
 * This is a read-only, render-time overlay on top of computeAccountDailyTasks's
 * output.
 */
export function computeAutoCompletedKeys(dailyTasks: AccountDailyTask[], todaysActivity: DailyActivity): Set<string> {
  const result = new Set<string>();
  for (const task of dailyTasks) {
    for (const item of taskItems(task)) {
      if (realCountForTask(task.accountId, item.key, todaysActivity) >= item.count) {
        result.add(`${task.accountId}:${item.key}`);
      }
    }
  }
  return result;
}

/** Groups each account's daily task into its owning collaborator's list — no summing, so "which account needs what" stays visible. */
export function groupTasksByCollaborator(
  tasks: AccountDailyTask[],
  accounts: RedditAccountForRotation[],
): CollaboratorTasks[] {
  const ownerByAccount = new Map(accounts.map((a) => [a.id, a.owner_user_id]));
  const byOwner = new Map<string, AccountDailyTask[]>();

  for (const task of tasks) {
    const ownerUserId = ownerByAccount.get(task.accountId);
    if (!ownerUserId) continue;

    const list = byOwner.get(ownerUserId) ?? [];
    list.push(task);
    byOwner.set(ownerUserId, list);
  }

  return [...byOwner.entries()].map(([ownerUserId, accountTasks]) => ({ ownerUserId, accounts: accountTasks }));
}
