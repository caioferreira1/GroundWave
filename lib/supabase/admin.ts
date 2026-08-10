import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role Supabase client — bypasses RLS entirely. Only for trusted
 * server-side entry points (cron ingestion route, external webhook route,
 * and library code called exclusively from those two places). Never call
 * this from a Server Action triggered directly by user input without an
 * explicit `requireStaff`/`requireCompanyAccess` check first — the
 * `server-only` import above makes it a build error to pull this into any
 * client bundle, but it does NOT protect against misuse from trusted server
 * code, that's on the caller.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
