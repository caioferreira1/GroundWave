"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DailyTaskKey } from "@/lib/activity/rotation";

/**
 * Manual "check off" for a Today's tasks chip. `count` is how much of that
 * day's chip this represents (1 for the boolean post tasks, the shown
 * quantity for the comment tasks) — lib/activity/rotation.ts's
 * mergeActivity() folds it back on top of real tagged activity, so this
 * reduces tomorrow's remaining quota and moves the weekly progress meters.
 * Unchecking deletes the row rather than storing completed = false.
 */
export async function setDailyTaskCompletion(
  companyId: string,
  redditAccountId: string,
  taskKey: DailyTaskKey,
  taskDate: string,
  completed: boolean,
  count: number,
) {
  const { user } = await requireStaff();
  const supabase = await createClient();

  if (completed) {
    const { error } = await supabase.from("daily_task_completions").upsert(
      {
        company_id: companyId,
        reddit_account_id: redditAccountId,
        task_key: taskKey,
        task_date: taskDate,
        count,
        completed_by: user.id,
      },
      { onConflict: "reddit_account_id,task_key,task_date" },
    );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("daily_task_completions")
      .delete()
      .eq("reddit_account_id", redditAccountId)
      .eq("task_key", taskKey)
      .eq("task_date", taskDate);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/companies/${companyId}`);
}
