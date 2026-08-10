import Link from "next/link";
import { requireApprovedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/login/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireApprovedUser();

  const supabase = await createClient();
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/companies" className="font-semibold text-neutral-900">
            MAA Reddit Persona Engine
          </Link>
          <Link href="/companies" className="text-neutral-600 hover:text-neutral-900">
            Companies
          </Link>
          <Link href="/generic-post-generator" className="text-neutral-600 hover:text-neutral-900">
            Post generator
          </Link>
          {isAdmin && (
            <Link href="/admin/users" className="text-neutral-600 hover:text-neutral-900">
              Users
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>{profile.display_name ?? profile.email}</span>
          <form action={signOut}>
            <button type="submit" className="underline underline-offset-2">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
