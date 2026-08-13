import { CheckCircle2, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  PageHeading,
  SegmentedControl,
  SegmentedControlButton,
  SubmitButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
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
      <Table>
        <TableHeader>
          <TableRow className="border-t-0">
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(profiles ?? []).map((p) => {
            const role = roleByUser.get(p.id);
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="text-foreground">{p.display_name ?? p.email}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[p.status]}>{p.status}</Badge>
                </TableCell>
                <TableCell>
                  {role ? <Badge variant="accent">{role}</Badge> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.status !== "approved" && (
                      <form action={setUserStatus.bind(null, p.id, "approved")}>
                        <SubmitButton variant="secondary" size="sm" pendingText="Approving…">
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Approve
                        </SubmitButton>
                      </form>
                    )}
                    {p.status !== "denied" && (
                      <form action={setUserStatus.bind(null, p.id, "denied")}>
                        <SubmitButton variant="secondary" size="sm" pendingText="Denying…">
                          <XCircle className="h-3.5 w-3.5 text-destructive" /> Deny
                        </SubmitButton>
                      </form>
                    )}
                    <SegmentedControl>
                      {(["admin", "coworker", "client"] as const).map((r) => (
                        <form key={r} action={setUserRole.bind(null, p.id, r)}>
                          <SegmentedControlButton active={role === r}>{r}</SegmentedControlButton>
                        </form>
                      ))}
                    </SegmentedControl>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
