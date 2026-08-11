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
