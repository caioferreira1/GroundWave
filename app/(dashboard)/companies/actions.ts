"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createCompany(formData: FormData) {
  await requireStaff();

  const name = String(formData.get("name") ?? "").trim();
  const websiteUrl = String(formData.get("website_url") ?? "").trim() || null;
  if (!name) throw new Error("Company name is required");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({ name, website_url: websiteUrl })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/companies");
  redirect(`/companies/${data.id}/settings`);
}
