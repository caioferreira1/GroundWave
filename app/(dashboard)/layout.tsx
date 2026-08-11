import { requireApprovedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { abbreviateName } from "@/lib/format-name";
import { GradientBackdrop } from "@/components/ui/gradient-backdrop";
import { Sidebar } from "@/components/ui/sidebar";
import { signOut } from "../(auth)/login/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireApprovedUser();

  const supabase = await createClient();
  const [{ data: roles }, { data: companies }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("companies").select("id, name").order("name", { ascending: true }),
  ]);

  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  const isStaff = isAdmin || (roles ?? []).some((r) => r.role === "coworker");
  const roleLabel = isAdmin ? "Admin" : isStaff ? "Staff" : "Client";
  const roleVariant = isAdmin ? "accent" : isStaff ? "neutral" : "warning";

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <GradientBackdrop />
      <Sidebar
        companies={companies ?? []}
        isAdmin={isAdmin}
        roleLabel={roleLabel}
        roleVariant={roleVariant}
        userLabel={abbreviateName(profile.display_name, profile.email)}
        signOutAction={signOut}
      />
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-10">
        <div className="animate-fade-in-up max-w-6xl min-w-0">{children}</div>
      </main>
    </div>
  );
}
