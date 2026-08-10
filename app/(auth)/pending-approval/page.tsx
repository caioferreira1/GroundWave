import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";
import { signOut } from "../login/actions";

export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  if (profile?.status === "approved") redirect("/companies");

  const denied = profile?.status === "denied";

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size={26} />
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <div className="mb-3 flex justify-center">
            <Badge variant={denied ? "critical" : "warning"}>
              {denied ? "Access denied" : "Pending approval"}
            </Badge>
          </div>
          <h1 className="mb-2 text-lg font-semibold tracking-tight text-ink">
            {denied ? "This account was denied" : "Waiting on an admin"}
          </h1>
          <p className="mb-6 text-sm text-ink-muted text-balance">
            {denied
              ? "An admin has denied this account. Contact your team if this seems wrong."
              : "Your account was created but hasn't been approved yet. Check back soon."}
          </p>
          <form action={signOut}>
            <button type="submit" className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
