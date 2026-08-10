import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export class AuthError extends Error {}

/**
 * Server Component / Server Action guard: requires a signed-in user whose
 * profile is 'approved'. Redirects (not throws) when used at the top of a
 * page — call `requireApprovedUserOrThrow` instead inside Server Actions,
 * where a redirect would be the wrong failure mode.
 */
export async function requireApprovedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, status, display_name, email")
    .eq("id", user.id)
    .single();

  if (!profile || profile.status !== "approved") redirect("/pending-approval");

  return { user, profile };
}

/** Same check as requireApprovedUser, but throws instead of redirecting — for Server Actions. */
export async function requireApprovedUserOrThrow() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.status !== "approved") {
    throw new AuthError("Account not approved");
  }

  return { user, profile };
}

/**
 * Requires approved staff (admin or coworker). This is the explicit
 * application-level check to pair with RLS — never rely on RLS alone for
 * actions that also touch the admin/service-role client (e.g. marking a
 * comment as posted), since that client bypasses RLS entirely.
 */
export async function requireStaff() {
  const { user, profile } = await requireApprovedUserOrThrow();
  const supabase = await createClient();
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "coworker"]);

  if (!roles || roles.length === 0) {
    throw new AuthError("Staff role required");
  }

  return { user, profile };
}

export async function requireAdmin() {
  const { user, profile } = await requireApprovedUserOrThrow();
  const supabase = await createClient();
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin");

  if (!roles || roles.length === 0) {
    throw new AuthError("Admin role required");
  }

  return { user, profile };
}
