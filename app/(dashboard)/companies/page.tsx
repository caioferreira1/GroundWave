import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, Input, Label, PageHeading } from "@/components/ui";
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
      />

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(companies ?? []).map((c) => (
          <li key={c.id}>
            <Link href={`/companies/${c.id}`}>
              <Card className="flex items-start gap-3 p-4 transition-colors hover:border-accent">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{c.name}</p>
                  {c.website_url && (
                    <p className="truncate text-sm text-ink-muted">{c.website_url}</p>
                  )}
                  <div className="mt-2">
                    <Badge variant={c.posts_fetch_enabled ? "good" : "neutral"}>
                      {c.posts_fetch_enabled ? "Ingestion on" : "Ingestion off"}
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
        {(companies ?? []).length === 0 && (
          <li className="text-sm text-ink-muted">No companies yet — add the first one below.</li>
        )}
      </ul>

      <Card className="max-w-sm p-5">
        <form action={createCompany} className="space-y-4">
          <h2 className="text-sm font-semibold text-ink">Add a company</h2>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="website_url">Website (optional)</Label>
            <Input id="website_url" name="website_url" type="url" placeholder="https://" />
          </div>
          <Button type="submit">Create company</Button>
        </form>
      </Card>
    </div>
  );
}
