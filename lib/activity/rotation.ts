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
 * self-reported source layered on top of the real one, so mergeActivity()
 * de-duplicates per calendar day (max of the two sources, not their sum) —
 * see its own doc comment for why.
 */

export type RedditAccountForRotation = {
  id: string;
  account_name: string;
  owner_user_id: string;
  karma: number;
};

export type ActivityGoals = {
  genericCommentsPerWeek: number;
  targetCommentsPerWeek: number;
  genericPostIntervalDays: number;
  companyPostPerWeek: number;
  /** Rotation gate: generic posts an account needs since its last company-mention post before it's eligible for the next one. 0 = no gate. */
  genericPostsBeforeTarget: number;
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
  /**
   * Generic posts made since this account's last company-mention post (or
   * all generic posts ever, if it's never made one) — keyed by
   * reddit_account_id, missing key = 0. Feeds the "N generic posts before 1
   * target post" rotation gate in computeCompanyMentionRotationStatus().
   */
  genericPostsSinceLastCompanyMention: Map<string, number>;
  /**
   * Same counts as commentsByAccount, but broken out per calendar day
   * (YYYY-MM-DD, UTC) within this ISO week — reddit_account_id -> day ->
   * counts. Lets mergeActivity() de-duplicate a day where both a real
   * tagged comment/post AND a manual checklist completion exist, instead of
   * summing them.
   */
  commentsByAccountByDay: Map<string, Map<string, { generic: number; target: number }>>;
  /** Same as commentsByAccountByDay, for postsByAccount. */
  postsByAccountByDay: Map<string, Map<string, { generic: number; company_mention: number }>>;
};

export type AccountDailyTask = {
  accountId: string;
  accountName: string;
  genericCommentsToday: number;
  targetCommentsToday: number;
  genericPostToday: boolean;
  companyMentionPostToday: boolean;
  /** True when this account was cadence-due for a generic post today AND also today's company-mention pick — the target post wins, so genericPostToday above is forced false. Surfaced as a dismissible disclaimer. */
  genericPostDelayedByTarget: boolean;
  /** True when today's company-mention post came from the 70% last-resort rotation tier, not the full genericPostsBeforeTarget threshold. Surfaced as a dismissible disclaimer. */
  companyMentionPostIsEarly: boolean;
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

/**
 * Merges per-day count maps by taking, for every (account, day) present in
 * either side, the MAX of the two sources rather than their sum — the two
 * sides describe the same real-world unit of work (e.g. "3 target comments
 * today") reported two different ways (checked off on the checklist vs.
 * tagged for real via "mark posted"/"log manual comment"), not two
 * additional units of work. Whichever source claims more for a given day
 * wins for that day; days are then summed to get the week total.
 */
function mergeCommentDayMaps(
  base: Map<string, Map<string, { generic: number; target: number }>>,
  extra: Map<string, Map<string, { generic: number; target: number }>>,
): Map<string, Map<string, { generic: number; target: number }>> {
  const result = new Map<string, Map<string, { generic: number; target: number }>>();
  for (const accountId of new Set([...base.keys(), ...extra.keys()])) {
    const baseDays = base.get(accountId);
    const extraDays = extra.get(accountId);
    const byDay = new Map<string, { generic: number; target: number }>();
    for (const day of new Set([...(baseDays?.keys() ?? []), ...(extraDays?.keys() ?? [])])) {
      const b = baseDays?.get(day) ?? { generic: 0, target: 0 };
      const e = extraDays?.get(day) ?? { generic: 0, target: 0 };
      byDay.set(day, { generic: Math.max(b.generic, e.generic), target: Math.max(b.target, e.target) });
    }
    result.set(accountId, byDay);
  }
  return result;
}

/** Same de-duplication as mergeCommentDayMaps, for the generic/company_mention post shape. */
function mergePostDayMaps(
  base: Map<string, Map<string, { generic: number; company_mention: number }>>,
  extra: Map<string, Map<string, { generic: number; company_mention: number }>>,
): Map<string, Map<string, { generic: number; company_mention: number }>> {
  const result = new Map<string, Map<string, { generic: number; company_mention: number }>>();
  for (const accountId of new Set([...base.keys(), ...extra.keys()])) {
    const baseDays = base.get(accountId);
    const extraDays = extra.get(accountId);
    const byDay = new Map<string, { generic: number; company_mention: number }>();
    for (const day of new Set([...(baseDays?.keys() ?? []), ...(extraDays?.keys() ?? [])])) {
      const b = baseDays?.get(day) ?? { generic: 0, company_mention: 0 };
      const e = extraDays?.get(day) ?? { generic: 0, company_mention: 0 };
      byDay.set(day, {
        generic: Math.max(b.generic, e.generic),
        company_mention: Math.max(b.company_mention, e.company_mention),
      });
    }
    result.set(accountId, byDay);
  }
  return result;
}

function sumCommentDays(byDay: Map<string, Map<string, { generic: number; target: number }>>): Map<string, { generic: number; target: number }> {
  const result = new Map<string, { generic: number; target: number }>();
  for (const [accountId, days] of byDay) {
    let generic = 0;
    let target = 0;
    for (const counts of days.values()) {
      generic += counts.generic;
      target += counts.target;
    }
    result.set(accountId, { generic, target });
  }
  return result;
}

function sumPostDays(byDay: Map<string, Map<string, { generic: number; company_mention: number }>>): Map<string, { generic: number; company_mention: number }> {
  const result = new Map<string, { generic: number; company_mention: number }>();
  for (const [accountId, days] of byDay) {
    let generic = 0;
    let company_mention = 0;
    for (const counts of days.values()) {
      generic += counts.generic;
      company_mention += counts.company_mention;
    }
    result.set(accountId, { generic, company_mention });
  }
  return result;
}

/**
 * Adds `extra` (e.g. manual daily_task_completions checkbox counts) on top
 * of `base` (real tagged activity) — same shape in, same shape out, so
 * every function below stays oblivious to where the numbers came from.
 *
 * Comment/post counts are de-duplicated per calendar day (see
 * mergeCommentDayMaps/mergePostDayMaps): if the same account+type has both a
 * real tagged entry AND a manual checklist completion on the same day, that
 * day only counts once (the larger of the two), rather than adding them
 * together. This is what makes checking a checklist box, marking a comment
 * posted on the post page, and adding one manually all count toward the
 * weekly goal exactly once each, no matter which combination of those was
 * used for a given day's task.
 */
export function mergeActivity(base: WeekActivity, extra: WeekActivity): WeekActivity {
  const commentsByAccountByDay = mergeCommentDayMaps(base.commentsByAccountByDay, extra.commentsByAccountByDay);
  const postsByAccountByDay = mergePostDayMaps(base.postsByAccountByDay, extra.postsByAccountByDay);
  const commentsByAccount = sumCommentDays(commentsByAccountByDay);
  const postsByAccount = sumPostDays(postsByAccountByDay);

  const lastGenericPostAt = new Map(base.lastGenericPostAt);
  for (const [accountId, extraIso] of extra.lastGenericPostAt) {
    lastGenericPostAt.set(accountId, laterOf(lastGenericPostAt.get(accountId), extraIso));
  }

  const lastCompanyMentionPostAt = new Map(base.lastCompanyMentionPostAt);
  for (const [accountId, extraIso] of extra.lastCompanyMentionPostAt) {
    lastCompanyMentionPostAt.set(accountId, laterOf(lastCompanyMentionPostAt.get(accountId), extraIso));
  }

  const genericPostsSinceLastCompanyMention = new Map(base.genericPostsSinceLastCompanyMention);
  for (const [accountId, extraCount] of extra.genericPostsSinceLastCompanyMention) {
    genericPostsSinceLastCompanyMention.set(
      accountId,
      (genericPostsSinceLastCompanyMention.get(accountId) ?? 0) + extraCount,
    );
  }

  return {
    commentsByAccount,
    postsByAccount,
    lastGenericPostAt,
    lastCompanyMentionPostAt,
    genericPostsSinceLastCompanyMention,
    commentsByAccountByDay,
    postsByAccountByDay,
  };
}

/**
 * Fraction of `genericPostsBeforeTarget` an account may fall back to when
 * NO account has reached the full amount — a last-resort exception so the
 * company isn't permanently stuck at 0 target posts if the ideal threshold
 * is never quite met, while still barring brand-new accounts (0 posts)
 * from being picked outright. Not configurable — a fixed policy, unlike
 * genericPostsBeforeTarget itself. `Math.ceil` (not floor) keeps this a true
 * "at least 70%" and means the relaxed bar coincides with the strict one for
 * small thresholds (N <= 3) — there's no meaningfully weaker tier to fall
 * back to at that scale, which is the conservative/expected outcome.
 */
const RELAXED_ELIGIBILITY_RATIO = 0.7;

function relaxedThreshold(genericPostsBeforeTarget: number): number {
  return Math.ceil(genericPostsBeforeTarget * RELAXED_ELIGIBILITY_RATIO);
}

/** Accounts that have accrued enough generic posts to be considered for the next company-mention post, split into the ideal (100%) and last-resort (>=70%) tiers — `relaxed` is a superset of `strict`. */
function partitionEligibility(
  accounts: RedditAccountForRotation[],
  activity: WeekActivity,
  goals: ActivityGoals,
): { strict: RedditAccountForRotation[]; relaxed: RedditAccountForRotation[] } {
  const strict: RedditAccountForRotation[] = [];
  const relaxed: RedditAccountForRotation[] = [];
  const relaxedNeeded = relaxedThreshold(goals.genericPostsBeforeTarget);

  for (const account of accounts) {
    const done = activity.genericPostsSinceLastCompanyMention.get(account.id) ?? 0;
    if (done >= goals.genericPostsBeforeTarget) strict.push(account);
    if (done >= relaxedNeeded) relaxed.push(account);
  }
  return { strict, relaxed };
}

function pickLongestOverdue(
  accounts: RedditAccountForRotation[],
  activity: WeekActivity,
  now: Date,
): RedditAccountForRotation {
  let picked = accounts[0];
  let pickedAge = -Infinity;
  for (const account of accounts) {
    const age = daysSince(activity.lastCompanyMentionPostAt.get(account.id), now);
    if (age > pickedAge) {
      pickedAge = age;
      picked = account;
    }
  }
  return picked;
}

export type CompanyMentionRotationStatus =
  | { state: "no_active_accounts" }
  | { state: "quota_met_this_week" }
  /** No account has accrued even the 70% last-resort minimum yet — expected in e.g. week 1, not a missed goal. */
  | { state: "no_eligible_accounts_yet" }
  /** `relaxed: true` means the pick only cleared the 70% last-resort bar, not the full genericPostsBeforeTarget — surfaced as a dismissible disclaimer in the UI. */
  | { state: "assigned"; accountId: string; relaxed: boolean };

/**
 * The company-wide "who owes this week's target/company-mention post, and
 * why not if nobody does". Prefers accounts that have fully cleared
 * `goals.genericPostsBeforeTarget` generic posts since their last one; only
 * falls back to the 70%-or-more tier when zero accounts have fully cleared
 * it (and the weekly quota still needs filling) — a last resort, never the
 * default path. pickCompanyMentionOwnerAccountId() below is a thin
 * string|null projection of this for callers that only need the id.
 */
export function computeCompanyMentionRotationStatus(
  accounts: RedditAccountForRotation[],
  activity: WeekActivity,
  goals: ActivityGoals,
  now: Date = new Date(),
): CompanyMentionRotationStatus {
  if (accounts.length === 0) return { state: "no_active_accounts" };

  const doneThisWeek = [...activity.postsByAccount.values()].reduce(
    (sum, v) => sum + v.company_mention,
    0,
  );
  if (doneThisWeek >= goals.companyPostPerWeek) return { state: "quota_met_this_week" };

  const { strict, relaxed } = partitionEligibility(accounts, activity, goals);
  if (strict.length > 0) {
    return { state: "assigned", accountId: pickLongestOverdue(strict, activity, now).id, relaxed: false };
  }
  if (relaxed.length > 0) {
    return { state: "assigned", accountId: pickLongestOverdue(relaxed, activity, now).id, relaxed: true };
  }
  return { state: "no_eligible_accounts_yet" };
}

/**
 * Which active account owes this week's company-mention post, as a plain
 * id — see computeCompanyMentionRotationStatus() for the full "why" (quota
 * met vs. nobody eligible vs. a relaxed/last-resort pick), which callers
 * that need to explain the decision (e.g. the dashboard) should use
 * directly instead of this projection.
 */
export function pickCompanyMentionOwnerAccountId(
  accounts: RedditAccountForRotation[],
  activity: WeekActivity,
  goals: ActivityGoals,
  now: Date = new Date(),
): string | null {
  const status = computeCompanyMentionRotationStatus(accounts, activity, goals, now);
  return status.state === "assigned" ? status.accountId : null;
}

/**
 * Splits a company-wide weekly total evenly across its active accounts —
 * `Math.floor(total / n)` each, with any remainder (when it doesn't divide
 * evenly) going one-by-one to the highest-karma accounts first, so the
 * accounts with more standing absorb the extra rather than it landing
 * arbitrarily.
 */
export function splitWeeklyTarget(
  total: number,
  accounts: { id: string; karma: number }[],
): Map<string, number> {
  const shares = new Map<string, number>();
  if (accounts.length === 0) return shares;

  const base = Math.floor(total / accounts.length);
  const remainder = total % accounts.length;
  for (const account of accounts) shares.set(account.id, base);

  const byKarmaDesc = [...accounts].sort((a, b) => b.karma - a.karma || a.id.localeCompare(b.id));
  for (let i = 0; i < remainder; i++) {
    const account = byKarmaDesc[i];
    shares.set(account.id, (shares.get(account.id) ?? base) + 1);
  }
  return shares;
}

/**
 * Per-account "today" amounts. The company's weekly comment totals
 * (goals.genericCommentsPerWeek/targetCommentsPerWeek) are first split
 * across active accounts via splitWeeklyTarget, then each account's
 * remaining share is spread evenly across the days left in the ISO week
 * (including today), so the ask stays small early in the week and catches
 * up automatically near the weekend instead of dumping the whole weekly
 * number on one day.
 */
export function computeAccountDailyTasks(
  accounts: RedditAccountForRotation[],
  goals: ActivityGoals,
  activity: WeekActivity,
  rotationStatus: CompanyMentionRotationStatus,
  now: Date = new Date(),
): AccountDailyTask[] {
  const daysLeftInWeek = Math.max(1, 8 - isoWeekday(now));
  const genericShares = splitWeeklyTarget(goals.genericCommentsPerWeek, accounts);
  const targetShares = splitWeeklyTarget(goals.targetCommentsPerWeek, accounts);
  const companyMentionOwnerAccountId = rotationStatus.state === "assigned" ? rotationStatus.accountId : null;

  return accounts.map((account) => {
    const done = activity.commentsByAccount.get(account.id) ?? { generic: 0, target: 0 };
    const genericRemaining = Math.max(0, (genericShares.get(account.id) ?? 0) - done.generic);
    const targetRemaining = Math.max(0, (targetShares.get(account.id) ?? 0) - done.target);

    const cadenceDueForGenericPost =
      daysSince(activity.lastGenericPostAt.get(account.id), now) >= goals.genericPostIntervalDays;
    const companyMentionPostToday = companyMentionOwnerAccountId === account.id;
    // Nenhuma conta posta duas vezes no mesmo dia: o post target vence quando os dois coincidem.
    const genericPostDelayedByTarget = cadenceDueForGenericPost && companyMentionPostToday;

    return {
      accountId: account.id,
      accountName: account.account_name,
      genericCommentsToday: Math.ceil(genericRemaining / daysLeftInWeek),
      targetCommentsToday: Math.ceil(targetRemaining / daysLeftInWeek),
      genericPostToday: cadenceDueForGenericPost && !companyMentionPostToday,
      companyMentionPostToday,
      genericPostDelayedByTarget,
      companyMentionPostIsEarly:
        companyMentionPostToday && rotationStatus.state === "assigned" && rotationStatus.relaxed,
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
 * answer "what does each account owe today"). Comment targets are the
 * configured number as-is — it's already a company-wide weekly total (see
 * splitWeeklyTarget), not a per-account number to multiply up. Company-
 * mention posts use the company-wide quota as-is too. Generic posts don't
 * have an explicit weekly count in the goals (just a posting cadence in
 * days), so the weekly target approximates each account's expected post
 * count at that cadence, summed across accounts.
 */
export function computeWeeklyGoalProgress(
  accounts: RedditAccountForRotation[],
  goals: ActivityGoals,
  activity: WeekActivity,
): WeeklyGoalProgress {
  const numAccounts = accounts.length;
  const sumComments = (key: "generic" | "target") =>
    accounts.reduce((sum, a) => sum + (activity.commentsByAccount.get(a.id)?.[key] ?? 0), 0);
  const sumPosts = (key: "generic" | "company_mention") =>
    accounts.reduce((sum, a) => sum + (activity.postsByAccount.get(a.id)?.[key] ?? 0), 0);

  const expectedPostsPerAccount = Math.max(1, Math.floor(7 / goals.genericPostIntervalDays));

  return {
    genericComments: { done: sumComments("generic"), target: goals.genericCommentsPerWeek },
    targetComments: { done: sumComments("target"), target: goals.targetCommentsPerWeek },
    genericPosts: { done: sumPosts("generic"), target: expectedPostsPerAccount * numAccounts },
    companyMentionPosts: { done: sumPosts("company_mention"), target: goals.companyPostPerWeek },
  };
}

export type AccountRotationCountdown =
  | { state: "posting_today"; early: boolean }
  | { state: "quota_met_this_week" }
  /** Cleared the full genericPostsBeforeTarget threshold — eligible, just waiting for the rotation to pick it. */
  | { state: "eligible_awaiting_turn" }
  /** Cleared the 70% last-resort bar but not the full threshold — could be picked early only if no fully-eligible account exists. */
  | { state: "eligible_early_if_needed"; genericPostsDone: number; genericPostsNeeded: number }
  | { state: "accruing"; genericPostsDone: number; genericPostsNeeded: number; estimatedDaysUntilEligible: number };

/**
 * One account's "when's my next target post" status for the dashboard
 * countdown, given the already-computed company-wide rotation status
 * (avoids recomputing the eligibility filter/quota check per account).
 * estimatedDaysUntilEligible always projects toward the full (100%)
 * threshold, not the 70% last-resort bar — that bar is an exception valve,
 * not the account's actual target. It's a rough projection assuming this
 * account keeps posting generic content exactly on its configured cadence —
 * not a guarantee, since actual posting is human-driven.
 */
export function computeAccountRotationCountdown(
  account: RedditAccountForRotation,
  goals: ActivityGoals,
  activity: WeekActivity,
  rotationStatus: CompanyMentionRotationStatus,
): AccountRotationCountdown {
  if (rotationStatus.state === "assigned" && rotationStatus.accountId === account.id) {
    return { state: "posting_today", early: rotationStatus.relaxed };
  }
  if (rotationStatus.state === "quota_met_this_week") {
    return { state: "quota_met_this_week" };
  }

  const done = activity.genericPostsSinceLastCompanyMention.get(account.id) ?? 0;
  const needed = goals.genericPostsBeforeTarget;
  if (done >= needed) {
    return { state: "eligible_awaiting_turn" };
  }
  if (done >= relaxedThreshold(needed)) {
    return { state: "eligible_early_if_needed", genericPostsDone: done, genericPostsNeeded: needed };
  }

  return {
    state: "accruing",
    genericPostsDone: done,
    genericPostsNeeded: needed,
    estimatedDaysUntilEligible: (needed - done) * goals.genericPostIntervalDays,
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
