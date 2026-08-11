"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generatePostGeneration } from "@/lib/ai/post-generator";

export async function generatePost(companyId: string) {
  const { user } = await requireStaff();

  await generatePostGeneration({ mode: "company", companyId, createdBy: user.id });

  revalidatePath(`/companies/${companyId}/post-generator`);
}

export async function deletePostGeneration(companyId: string, id: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from("post_generations")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/post-generator`);
}
