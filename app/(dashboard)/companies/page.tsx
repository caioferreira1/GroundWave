import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AddCompanyMenu, CompanyCard, EmptyState, PageHeading } from "@/components/ui";
import { createCompany } from "./actions";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, website_url, posts_fetch_enabled")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-10">
      <PageHeading
        title="Companies"
        description="Each company gets its own Reddit monitoring, personas, and generated content."
        action={<AddCompanyMenu action={createCompany} />}
      />

      {(companies ?? []).length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(companies ?? []).map((c) => (
            <li key={c.id}>
              <CompanyCard
                id={c.id}
                name={c.name}
                websiteUrl={c.website_url}
                ingestionEnabled={c.posts_fetch_enabled}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Add your first company above to start monitoring Reddit for relevant conversations."
        />
      )}
    </div>
  );
}
