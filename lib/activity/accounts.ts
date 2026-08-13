import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RedditAccountOption = { id: string; account_name: string; owner_user_id: string; karma: number };

/** This company's active Reddit accounts — the set staff pick from when tagging a posted comment/post. */
export async function getActiveRedditAccounts(
  supabase: SupabaseServerClient,
  companyId: string,
): Promise<RedditAccountOption[]> {
  const { data } = await supabase
    .from("reddit_accounts")
    .select("id, account_name, owner_user_id, karma")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("account_name", { ascending: true });

  return data ?? [];
}
