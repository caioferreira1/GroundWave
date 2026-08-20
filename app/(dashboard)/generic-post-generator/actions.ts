"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generatePostGeneration } from "@/lib/ai/post-generator";

export async function generatePost() {
  const { user } = await requireStaff();

  await generatePostGeneration({ mode: "generic", createdBy: user.id });

  revalidatePath("/generic-post-generator");
}

export async function deletePostGeneration(id: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.from("post_generations").delete().eq("id", id).eq("mode", "generic");
  if (error) throw new Error(error.message);

  revalidatePath("/generic-post-generator");
}

export async function addGenericSubreddit(subreddit: string) {
  await requireStaff();

  const clean = subreddit.trim().replace(/^r\//i, "");
  if (!clean) throw new Error("Enter a subreddit name");

  const supabase = await createClient();
  const { data: settings, error: fetchError } = await supabase
    .from("generic_post_generator_settings")
    .select("subreddits")
    .eq("id", 1)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const current = settings?.subreddits ?? [];
  if (current.some((s) => s.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`r/${clean} is already in the list`);
  }

  const { error } = await supabase
    .from("generic_post_generator_settings")
    .update({ subreddits: [...current, clean] })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  revalidatePath("/generic-post-generator");
}

export async function removeGenericSubreddit(subreddit: string) {
  await requireStaff();

  const supabase = await createClient();
  const { data: settings, error: fetchError } = await supabase
    .from("generic_post_generator_settings")
    .select("subreddits")
    .eq("id", 1)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const current = settings?.subreddits ?? [];
  const { error } = await supabase
    .from("generic_post_generator_settings")
    .update({ subreddits: current.filter((s) => s !== subreddit) })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  revalidatePath("/generic-post-generator");
}
