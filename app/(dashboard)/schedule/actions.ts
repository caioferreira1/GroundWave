"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseWeekInputValue } from "@/lib/schedule/iso-week";

function optionalText(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v === "" ? null : v;
}

export async function createScheduledPost(formData: FormData) {
  const { user } = await requireStaff();

  const companyId = String(formData.get("company_id") ?? "").trim();
  const postKind = String(formData.get("post_kind") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const bodyCopy = String(formData.get("body_copy") ?? "").trim();
  const weekRaw = String(formData.get("week") ?? "").trim();

  if (!companyId) throw new Error("Company is required");
  if (postKind !== "target" && postKind !== "generic") throw new Error("Post kind must be target or generic");
  if (!title) throw new Error("Title is required");
  if (!bodyCopy) throw new Error("Body copy is required");
  const week = parseWeekInputValue(weekRaw);
  if (!week) throw new Error("Choose a valid week");

  const supabase = await createClient();
  const { error } = await supabase.from("scheduled_posts").insert({
    company_id: companyId,
    reddit_account_id: optionalText(formData, "reddit_account_id"),
    collaborator: optionalText(formData, "collaborator"),
    post_kind: postKind,
    iso_year: week.isoYear,
    iso_week: week.isoWeek,
    planned_date: optionalText(formData, "planned_date"),
    title,
    body_copy: bodyCopy,
    format_tag_id: optionalText(formData, "format_tag_id"),
    objective_note: optionalText(formData, "objective_note"),
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/schedule");
}

export async function updateScheduledPost(postId: string, formData: FormData) {
  await requireStaff();

  const companyId = String(formData.get("company_id") ?? "").trim();
  const postKind = String(formData.get("post_kind") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const bodyCopy = String(formData.get("body_copy") ?? "").trim();
  const weekRaw = String(formData.get("week") ?? "").trim();

  if (!companyId) throw new Error("Company is required");
  if (postKind !== "target" && postKind !== "generic") throw new Error("Post kind must be target or generic");
  if (!title) throw new Error("Title is required");
  if (!bodyCopy) throw new Error("Body copy is required");
  const week = parseWeekInputValue(weekRaw);
  if (!week) throw new Error("Choose a valid week");

  const supabase = await createClient();
  const { error } = await supabase
    .from("scheduled_posts")
    .update({
      company_id: companyId,
      reddit_account_id: optionalText(formData, "reddit_account_id"),
      collaborator: optionalText(formData, "collaborator"),
      post_kind: postKind,
      iso_year: week.isoYear,
      iso_week: week.isoWeek,
      planned_date: optionalText(formData, "planned_date"),
      title,
      body_copy: bodyCopy,
      format_tag_id: optionalText(formData, "format_tag_id"),
      objective_note: optionalText(formData, "objective_note"),
    })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  revalidatePath("/schedule");
}

/** Dedicated quick action: paste the live URL, done. Never touched by updateScheduledPost, so editing content later can't accidentally clobber posted_at. */
export async function markScheduledPostPosted(postId: string, formData: FormData) {
  await requireStaff();

  const postUrl = String(formData.get("post_url") ?? "").trim();
  if (!postUrl) throw new Error("Post URL is required");

  const supabase = await createClient();
  const { error } = await supabase
    .from("scheduled_posts")
    .update({ is_posted: true, posted_at: new Date().toISOString(), post_url: postUrl })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  revalidatePath("/schedule");
}

/** Undo, for the "marked it by mistake" case. */
export async function unmarkScheduledPostPosted(postId: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from("scheduled_posts")
    .update({ is_posted: false, posted_at: null, post_url: null })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  revalidatePath("/schedule");
}

/** Grows the format tag vocabulary from the UI — no migration needed to add one, unlike the hardcoded COLLABORATORS array. */
export async function createFormatTag(formData: FormData): Promise<{ id: string; label: string }> {
  await requireStaff();

  const label = String(formData.get("label") ?? "").trim();
  if (!label) throw new Error("Tag name is required");

  const supabase = await createClient();
  const { data, error } = await supabase.from("schedule_format_tags").insert({ label }).select("id, label").single();
  if (error) {
    if (error.code === "23505") throw new Error("That tag already exists");
    throw new Error(error.message);
  }

  revalidatePath("/schedule");
  return data;
}

export async function deleteScheduledPost(postId: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.from("scheduled_posts").delete().eq("id", postId);
  if (error) throw new Error(error.message);

  revalidatePath("/schedule");
}
