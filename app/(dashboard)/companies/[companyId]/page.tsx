import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CompanyOverviewPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, website_url, profile, guardrails_md, inbound_webhook_token, posts_fetch_enabled",
    )
    .eq("id", companyId)
    .maybeSingle();

  if (!company) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">{company.name}</h1>
        {company.website_url && <p className="text-sm text-neutral-500">{company.website_url}</p>}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        <p className="mb-2 font-medium text-neutral-900">Status</p>
        <p>Ingestion: {company.posts_fetch_enabled ? "enabled" : "disabled"}</p>
        <p>Profile: {company.profile ? "generated" : "not generated yet"}</p>
        <p>Guardrails: {company.guardrails_md ? "set" : "not set"}</p>
      </div>

      <p className="text-sm text-neutral-400">
        Settings, personas, posts, and post-generator tabs are built out in later phases
        (see the plan) — this overview is the Phase 1 placeholder.
      </p>
    </div>
  );
}
