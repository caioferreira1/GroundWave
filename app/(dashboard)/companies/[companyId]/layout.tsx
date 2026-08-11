import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { CompanyTabs } from "@/components/ui/company-tabs";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, website_url")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <Avatar name={company.name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{company.name}</p>
          {company.website_url && (
            <Link
              href={company.website_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-ink-muted hover:text-accent hover:underline"
            >
              Link
            </Link>
          )}
        </div>
      </div>

      <CompanyTabs companyId={companyId} />

      {children}
    </div>
  );
}
