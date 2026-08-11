"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedUserOrThrow } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateOwnProfile(formData: FormData) {
  const { user } = await requireApprovedUserOrThrow();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim() || null;
  if (!displayName) throw new Error("Name is required");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, job_title: jobTitle })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/account");
  revalidatePath("/", "layout");
}
