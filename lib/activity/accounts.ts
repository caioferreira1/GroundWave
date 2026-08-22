import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RedditAccountOption = { id: string; account_name: string; owner_user_id: string; karma: number };
export type RedditAccountWithStatus = RedditAccountOption & { is_active: boolean };
export type CompanyRef = { id: string; name: string };

/**
 * Account ids linked to a company via reddit_account_companies — the
 * many-to-many join table (supabase/migrations/0022_reddit_account_companies.sql)
 * that replaced reddit_accounts.company_id once an account could belong to
 * more than one company. Used to attribute generic-mode post_generations
 * (posted via one of this company's accounts, see lib/activity/queries.ts and
 * lib/analytics/queries.ts) back to the company.
 */
export async function getCompanyRedditAccountIds(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<string[]> {
  const { data } = await supabase.from("reddit_account_companies").select("reddit_account_id").eq("company_id", companyId);

  return (data ?? []).map((row) => row.reddit_account_id);
}

/**
 * This company's Reddit accounts, active or not — the full set linked to it
 * via reddit_account_companies. Includes inactive accounts so historical
 * activity from a since-deactivated account can still be named/counted.
 */
export async function getAllRedditAccountsForCompany(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<RedditAccountWithStatus[]> {
  const ids = await getCompanyRedditAccountIds(supabase, companyId);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("reddit_accounts")
    .select("id, account_name, owner_user_id, karma, is_active")
    .in("id", ids)
    .order("account_name", { ascending: true });

  return data ?? [];
}

/** This company's active Reddit accounts — the set staff pick from when tagging a posted comment/post. */
export async function getActiveRedditAccounts(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<RedditAccountOption[]> {
  const accounts = await getAllRedditAccountsForCompany(supabase, companyId);
  return accounts.filter((a) => a.is_active);
}

/**
 * Every company each of `accountIds` is linked to — for UI that spans
 * companies: the generic post-generator's account picker (an account can now
 * appear under more than one company) and the global Accounts page.
 */
export async function getCompaniesForAccounts(
  supabase: SupabaseServerClient,
  accountIds: string[],
): Promise<Map<string, CompanyRef[]>> {
  const result = new Map<string, CompanyRef[]>();
  if (accountIds.length === 0) return result;

  const [{ data: links }, { data: companies }] = await Promise.all([
    supabase.from("reddit_account_companies").select("reddit_account_id, company_id").in("reddit_account_id", accountIds),
    supabase.from("companies").select("id, name"),
  ]);

  const companyById = new Map((companies ?? []).map((c) => [c.id, c]));
  for (const link of links ?? []) {
    const company = companyById.get(link.company_id);
    if (!company) continue;
    const list = result.get(link.reddit_account_id) ?? [];
    list.push(company);
    result.set(link.reddit_account_id, list);
  }

  return result;
}
