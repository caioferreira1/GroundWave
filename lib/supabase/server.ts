import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Request-scoped Supabase client. Reads/writes go through RLS as the signed-in
 * user (or anon, if no session) — never use this for trusted server jobs like
 * ingestion or classification, use `lib/supabase/admin.ts` for those.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware refreshes the
            // session cookie on the next request, so this is safe to ignore.
          }
        },
      },
    },
  );
}
