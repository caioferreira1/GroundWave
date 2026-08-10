import Link from "next/link";
import { requireApprovedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";
import { signOut } from "../(auth)/login/actions";

const navLinkClass =
  "rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink";

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
  const isStaff = isAdmin || (roles ?? []).some((r) => r.role === "coworker");

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between gap-6 border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-5">
          <Link href="/companies">
            <Logo size={20} />
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/companies" className={navLinkClass}>
              Companies
            </Link>
            <Link href="/generic-post-generator" className={navLinkClass}>
              Post generator
            </Link>
            {isAdmin && (
              <Link href="/admin/users" className={navLinkClass}>
                Users
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isAdmin ? "accent" : isStaff ? "neutral" : "warning"}>
            {isAdmin ? "Admin" : isStaff ? "Staff" : "Client"}
          </Badge>
          <span className="text-sm text-ink-muted">{profile.display_name ?? profile.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
