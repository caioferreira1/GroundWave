import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-neutral-900">
          {profile?.status === "denied" ? "Access denied" : "Waiting for approval"}
        </h1>
        <p className="mb-6 text-sm text-neutral-500">
          {profile?.status === "denied"
            ? "An admin has denied this account. Contact your team if this seems wrong."
            : "Your account was created but hasn't been approved by an admin yet. Check back soon."}
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm text-neutral-500 underline underline-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
