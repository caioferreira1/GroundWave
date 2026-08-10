import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createCompany } from "./actions";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, website_url, posts_fetch_enabled")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Companies</h1>
        <p className="text-sm text-neutral-500">
          Each company gets its own Reddit monitoring, personas, and generated content.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(companies ?? []).map((c) => (
          <li key={c.id}>
            <Link
              href={`/companies/${c.id}`}
              className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
            >
              <p className="font-medium text-neutral-900">{c.name}</p>
              {c.website_url && <p className="text-sm text-neutral-500">{c.website_url}</p>}
              <p className="mt-2 text-xs text-neutral-400">
                Ingestion {c.posts_fetch_enabled ? "enabled" : "disabled"}
              </p>
            </Link>
          </li>
        ))}
        {(companies ?? []).length === 0 && (
          <li className="text-sm text-neutral-500">No companies yet — add the first one below.</li>
        )}
      </ul>

      <form
        action={createCompany}
        className="max-w-sm space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
      >
        <h2 className="text-sm font-medium text-neutral-900">Add a company</h2>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm text-neutral-700">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="website_url" className="mb-1 block text-sm text-neutral-700">
            Website (optional)
          </label>
          <input
            id="website_url"
            name="website_url"
            type="url"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
        >
          Create company
        </button>
      </form>
    </div>
  );
}
