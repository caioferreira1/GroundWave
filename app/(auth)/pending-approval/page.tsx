import { Clock, XCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
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
  const Icon = denied ? XCircle : Clock;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4">
      <div
        className="animate-drift pointer-events-none absolute inset-x-0 top-0 h-[36rem] opacity-90"
        style={{
          background:
            "radial-gradient(ellipse at top, color-mix(in srgb, var(--color-primary) 22%, transparent), transparent 60%), radial-gradient(ellipse 40rem 24rem at 80% -10%, color-mix(in srgb, var(--accent-2) 18%, transparent), transparent 65%)",
        }}
        aria-hidden="true"
      />

      <div className="animate-fade-in-up relative w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size={26} />
        </div>

        <Card className="rounded-xl p-6 text-center shadow-md">
          <div
            className={
              "mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full " +
              (denied ? "bg-destructive/10" : "bg-warning/10")
            }
          >
            <Icon className={"h-5 w-5 " + (denied ? "text-destructive" : "text-warning")} strokeWidth={1.75} />
          </div>
          <h1 className="mb-2 text-lg font-semibold tracking-tight text-foreground">
            {denied ? "This account was denied" : "Waiting on an admin"}
          </h1>
          <p className="mb-6 text-sm text-muted-foreground text-balance">
            {denied
              ? "An admin has denied this account. Contact your team if this seems wrong."
              : "Your account was created but hasn't been approved yet. Check back soon."}
          </p>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Sign out
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
