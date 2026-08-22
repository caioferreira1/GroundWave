"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function revalidateAccountAndCompanies(supabase: Awaited<ReturnType<typeof createClient>>, accountId: string) {
  revalidatePath("/accounts");

  const { data: links } = await supabase
    .from("reddit_account_companies")
    .select("company_id")
    .eq("reddit_account_id", accountId);
  for (const link of links ?? []) {
    revalidatePath(`/companies/${link.company_id}`);
  }
}

/** Accounts no longer belong to a single company (supabase/migrations/0022_reddit_account_companies.sql) — created here, then linked to zero or more companies via the checkboxes on this page. */
export async function createRedditAccount(formData: FormData) {
  await requireStaff();

  const accountName = String(formData.get("account_name") ?? "").trim();
  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();
  const karmaRaw = String(formData.get("karma") ?? "").trim();
  const karma = karmaRaw === "" ? 0 : Number(karmaRaw);
  const companyIds = formData.getAll("company_ids").map(String).filter(Boolean);
  if (!accountName) throw new Error("Account name is required");
  if (!ownerUserId) throw new Error("Owner is required");
  if (!Number.isInteger(karma) || karma < 0) throw new Error("Karma must be a non-negative whole number");

  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from("reddit_accounts")
    .insert({ account_name: accountName, owner_user_id: ownerUserId, karma })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (companyIds.length > 0) {
    const { error: linkError } = await supabase
      .from("reddit_account_companies")
      .insert(companyIds.map((companyId) => ({ reddit_account_id: account.id, company_id: companyId })));
    if (linkError) throw new Error(linkError.message);
  }

  await revalidateAccountAndCompanies(supabase, account.id);
}

export async function updateRedditAccount(accountId: string, formData: FormData) {
  await requireStaff();

  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();
  const karmaRaw = String(formData.get("karma") ?? "").trim();
  const karma = karmaRaw === "" ? 0 : Number(karmaRaw);
  const isActive = formData.get("is_active") === "on";
  if (!ownerUserId) throw new Error("Owner is required");
  if (!Number.isInteger(karma) || karma < 0) throw new Error("Karma must be a non-negative whole number");

  const supabase = await createClient();
  const { error } = await supabase
    .from("reddit_accounts")
    .update({ owner_user_id: ownerUserId, karma, is_active: isActive })
    .eq("id", accountId);
  if (error) throw new Error(error.message);

  await revalidateAccountAndCompanies(supabase, accountId);
}

export async function linkAccountToCompany(accountId: string, formData: FormData) {
  await requireStaff();

  const companyId = String(formData.get("company_id") ?? "").trim();
  if (!companyId) throw new Error("Choose a company to link");

  const supabase = await createClient();
  const { error } = await supabase
    .from("reddit_account_companies")
    .insert({ reddit_account_id: accountId, company_id: companyId });
  if (error) throw new Error(error.message);

  await revalidateAccountAndCompanies(supabase, accountId);
}

export async function unlinkAccountFromCompany(accountId: string, companyId: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase
    .from("reddit_account_companies")
    .delete()
    .eq("reddit_account_id", accountId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  await revalidateAccountAndCompanies(supabase, accountId);
}
