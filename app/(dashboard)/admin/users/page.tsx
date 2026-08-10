import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setUserRole, setUserStatus } from "./actions";

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
      <h1 className="text-xl font-semibold text-neutral-900">Users</h1>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{p.display_name ?? p.email}</td>
                <td className="px-4 py-2">{p.status}</td>
                <td className="px-4 py-2">{roleByUser.get(p.id) ?? "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    {p.status !== "approved" && (
                      <form action={setUserStatus.bind(null, p.id, "approved")}>
                        <button type="submit" className="text-green-700 underline">
                          Approve
                        </button>
                      </form>
                    )}
                    {p.status !== "denied" && (
                      <form action={setUserStatus.bind(null, p.id, "denied")}>
                        <button type="submit" className="text-red-700 underline">
                          Deny
                        </button>
                      </form>
                    )}
                    {(["admin", "coworker", "client"] as const).map((role) => (
                      <form key={role} action={setUserRole.bind(null, p.id, role)}>
                        <button type="submit" className="text-neutral-600 underline">
                          Set {role}
                        </button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
