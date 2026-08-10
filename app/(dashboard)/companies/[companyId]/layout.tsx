import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const tabLinkClass =
  "rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink";

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
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-semibold text-accent-strong">
          {company.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{company.name}</h1>
          {company.website_url && <p className="text-sm text-ink-muted">{company.website_url}</p>}
        </div>
      </div>

      <nav className="flex gap-1 border-b border-border">
        <Link href={`/companies/${companyId}`} className={tabLinkClass}>
          Overview
        </Link>
        <Link href={`/companies/${companyId}/settings`} className={tabLinkClass}>
          Settings
        </Link>
        <Link href={`/companies/${companyId}/posts`} className={tabLinkClass}>
          Posts
        </Link>
      </nav>

      {children}
    </div>
  );
}
