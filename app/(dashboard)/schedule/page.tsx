import { CalendarClock, CheckCircle2, Clock3, ListChecks, Target } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeading, SegmentedControl, SegmentedControlLink, StatCard } from "@/components/ui";
import { NewScheduledPostDialog } from "@/components/schedule/new-scheduled-post-dialog";
import { ScheduleView } from "@/components/schedule/schedule-view";
import {
  createFormatTag,
  createScheduledPost,
  markScheduledPostPosted,
  unmarkScheduledPostPosted,
  updateScheduledPost,
} from "./actions";

function companyFilterHref(companyId?: string) {
  return companyId ? `/schedule?company=${companyId}` : "/schedule";
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  await requireStaff();
  const { company: companyFilter } = await searchParams;
  const supabase = await createClient();

  const [{ data: companies }, { data: accounts }, { data: formatTags }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name", { ascending: true }),
    supabase.from("reddit_accounts").select("id, account_name").order("account_name", { ascending: true }),
    supabase.from("schedule_format_tags").select("id, label").order("label", { ascending: true }),
  ]);

  let postsQuery = supabase
    .from("scheduled_posts")
    .select(
      "id, company_id, reddit_account_id, collaborator, post_kind, iso_year, iso_week, planned_date, title, body_copy, format_tag_id, objective_note, post_url, is_posted, posted_at",
    )
    .order("iso_year", { ascending: true })
    .order("iso_week", { ascending: true })
    .order("planned_date", { ascending: true, nullsFirst: false });
  if (companyFilter) postsQuery = postsQuery.eq("company_id", companyFilter);
  const { data: posts } = await postsQuery;

  const companyNameById = Object.fromEntries((companies ?? []).map((c) => [c.id, c.name]));
  const accountNameById = Object.fromEntries((accounts ?? []).map((a) => [a.id, a.account_name]));
  const formatTagLabelById = Object.fromEntries((formatTags ?? []).map((t) => [t.id, t.label]));

  const totalPosts = posts?.length ?? 0;
  const targetPosts = (posts ?? []).filter((p) => p.post_kind === "target").length;
  const postedCount = (posts ?? []).filter((p) => p.is_posted).length;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeading
        title="Schedule"
        description="Editorial calendar of every planned Reddit post, across every company, by real calendar week."
        action={
          <NewScheduledPostDialog
            action={createScheduledPost}
            companies={companies ?? []}
            accounts={accounts ?? []}
            formatTags={formatTags ?? []}
            createFormatTagAction={createFormatTag}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={ListChecks} label="Total posts" value={<span className="text-2xl font-semibold text-foreground">{totalPosts}</span>} />
        <StatCard
          icon={Target}
          label="Target posts"
          value={<span className="text-2xl font-semibold text-warning">{targetPosts}</span>}
        />
        <StatCard
          icon={CheckCircle2}
          label="Posted"
          value={<span className="text-2xl font-semibold text-success">{postedCount}</span>}
        />
        <StatCard
          icon={Clock3}
          label="Not posted yet"
          value={<span className="text-2xl font-semibold text-foreground">{totalPosts - postedCount}</span>}
        />
      </div>

      {companies && companies.length > 0 && (
        <SegmentedControl>
          <SegmentedControlLink href={companyFilterHref()} active={!companyFilter}>
            All companies
          </SegmentedControlLink>
          {companies.map((c) => (
            <SegmentedControlLink key={c.id} href={companyFilterHref(c.id)} active={companyFilter === c.id}>
              {c.name}
            </SegmentedControlLink>
          ))}
        </SegmentedControl>
      )}

      {totalPosts === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled yet"
          description="Add a post above to start the calendar."
        />
      ) : (
        <ScheduleView
          posts={posts ?? []}
          companyNameById={companyNameById}
          accountNameById={accountNameById}
          formatTagLabelById={formatTagLabelById}
          companies={companies ?? []}
          accounts={accounts ?? []}
          formatTags={formatTags ?? []}
          showCompany={!companyFilter}
          updateAction={updateScheduledPost}
          markPostedAction={markScheduledPostPosted}
          unmarkPostedAction={unmarkScheduledPostPosted}
          createFormatTagAction={createFormatTag}
        />
      )}
    </div>
  );
}
