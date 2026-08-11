"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updatePersona(companyId: string, personaId: string, formData: FormData) {
  await requireStaff();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const contentMd = String(formData.get("content_md") ?? "").trim();
  const isActive = formData.get("is_active") === "on";
  if (!displayName || !contentMd) throw new Error("Name and content are required");

  const supabase = await createClient();
  const { error } = await supabase
    .from("personas")
    .update({ display_name: displayName, content_md: contentMd, is_active: isActive })
    .eq("id", personaId);
  if (error) throw new Error(error.message);

  revalidatePath(`/companies/${companyId}/personas`);
}
