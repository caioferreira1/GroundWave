"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setUserStatus(userId: string, status: "approved" | "denied") {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function setUserDisplayName(userId: string, formData: FormData) {
  await requireAdmin();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function setUserNotifyRelevantPosts(userId: string, formData: FormData) {
  await requireAdmin();
  const enabled = formData.get("enabled") === "on";
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ notify_relevant_posts: enabled }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function setUserRole(userId: string, role: "admin" | "coworker" | "client") {
  await requireAdmin();
  const supabase = await createClient();

  // One role at a time for simplicity in this first version — replace rather than add.
  const { error: deleteError } = await supabase.from("user_roles").delete().eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await supabase.from("user_roles").insert({ user_id: userId, role });
  if (insertError) throw new Error(insertError.message);

  revalidatePath("/admin/users");
}
