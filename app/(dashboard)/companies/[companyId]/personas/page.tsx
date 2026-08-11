import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeading,
  Switch,
  Textarea,
} from "@/components/ui";
import { Drama } from "lucide-react";
import { updatePersona } from "./actions";

export default async function CompanyPersonasPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roles } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id)
    : { data: [] };
  const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "coworker");

  const { data: personas } = await supabase
    .from("personas")
    .select("id, slug, display_name, content_md, based_on_fichas, is_active")
    .eq("company_id", companyId)
    .order("display_name", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeading
        title="Personas"
        description="Audience personas used to calibrate reply tone and vocabulary. Only active personas are offered when generating a reply — imported via scripts/import-personas.ts, editable here afterwards."
      />

      {(personas ?? []).length > 0 ? (
        <div className="space-y-4">
          {(personas ?? []).map((persona) => {
            const updateAction = updatePersona.bind(null, companyId, persona.id);
            return (
              <Card key={persona.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="min-w-0 truncate font-mono text-xs text-ink-muted">{persona.slug}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={persona.is_active ? "good" : "neutral"}>
                        {persona.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {persona.based_on_fichas.length > 0 && (
                        <Badge variant="neutral">{persona.based_on_fichas.length} source fichas</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {isStaff ? (
                  <form action={updateAction}>
                    <CardContent>
                      <Field label="Display name" htmlFor={`display_name-${persona.id}`}>
                        <Input
                          id={`display_name-${persona.id}`}
                          name="display_name"
                          defaultValue={persona.display_name}
                        />
                      </Field>
                      <Field label="Content (Markdown)" htmlFor={`content_md-${persona.id}`}>
                        <Textarea
                          id={`content_md-${persona.id}`}
                          name="content_md"
                          rows={12}
                          className="font-mono text-xs"
                          defaultValue={persona.content_md}
                        />
                      </Field>
                      <Switch
                        id={`is_active-${persona.id}`}
                        name="is_active"
                        defaultChecked={persona.is_active}
                        label="Active (eligible for reply generation)"
                      />
                    </CardContent>
                    <CardFooter>
                      <Button type="submit" variant="secondary" size="sm">
                        Save changes
                      </Button>
                    </CardFooter>
                  </form>
                ) : (
                  <CardContent>
                    <p className="text-sm font-medium text-ink">{persona.display_name}</p>
                    <pre className="max-h-64 overflow-y-auto rounded-md bg-surface-muted p-3 text-xs whitespace-pre-wrap text-ink-muted">
                      {persona.content_md}
                    </pre>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Drama}
          title="No personas yet"
          description="Run scripts/import-personas.ts to import audience personas from markdown files for this company."
        />
      )}
    </div>
  );
}
