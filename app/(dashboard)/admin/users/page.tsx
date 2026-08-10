import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, PageHeading } from "@/components/ui";
import { setUserRole, setUserStatus } from "./actions";

const statusVariant = {
  approved: "good",
  pending: "warning",
  denied: "critical",
} as const;

export default async function AdminUsersPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, display_name, status")
    .order("created_at", { ascending: true });
  const { data: roles } = await supabase.from("user_roles").select("user_id, role");

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));

  return (
    <div className="space-y-4">
      <PageHeading title="Users" description="Approve accounts and assign roles." />
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => {
              const role = roleByUser.get(p.id);
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2.5">
                    <div className="text-ink">{p.display_name ?? p.email}</div>
                    <div className="font-mono text-xs text-ink-muted">{p.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusVariant[p.status]}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {role ? <Badge variant="accent">{role}</Badge> : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {p.status !== "approved" && (
                        <form action={setUserStatus.bind(null, p.id, "approved")}>
                          <button type="submit" className="font-medium text-good underline underline-offset-2">
                            Approve
                          </button>
                        </form>
                      )}
                      {p.status !== "denied" && (
                        <form action={setUserStatus.bind(null, p.id, "denied")}>
                          <button type="submit" className="font-medium text-critical underline underline-offset-2">
                            Deny
                          </button>
                        </form>
                      )}
                      <span className="text-border">|</span>
                      {(["admin", "coworker", "client"] as const).map((r) => (
                        <form key={r} action={setUserRole.bind(null, p.id, r)}>
                          <button
                            type="submit"
                            disabled={role === r}
                            className="text-ink-muted underline underline-offset-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                          >
                            {r}
                          </button>
                        </form>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
