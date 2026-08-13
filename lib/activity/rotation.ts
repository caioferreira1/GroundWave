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
