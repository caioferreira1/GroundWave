import { requireApprovedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { abbreviateName } from "@/lib/format-name";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeading,
} from "@/components/ui";
import { updateOwnProfile } from "./actions";

export default async function AccountPage() {
  const { user } = await requireApprovedUser();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, job_title, email")
    .eq("id", user.id)
    .single();

  const previewName = abbreviateName(profile?.display_name, profile?.email ?? "");

  return (
    <div className="max-w-md space-y-6">
      <PageHeading
        title="Account"
        description={`Your name is shown around the app abbreviated, e.g. "${previewName}".`}
      />

      <Card>
        <form action={updateOwnProfile}>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Email" htmlFor="email">
              <Input id="email" value={profile?.email ?? ""} disabled />
            </Field>
            <Field label="Full name" htmlFor="display_name" hint="Shown abbreviated as first name + last initial.">
              <Input
                id="display_name"
                name="display_name"
                required
                defaultValue={profile?.display_name ?? ""}
              />
            </Field>
            <Field label="Job title (optional)" htmlFor="job_title">
              <Input id="job_title" name="job_title" defaultValue={profile?.job_title ?? ""} />
            </Field>
            <Button type="submit">Save changes</Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
