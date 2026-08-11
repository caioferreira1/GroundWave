import Link from "next/link";
import {
  ArrowBigUp,
  Calendar,
  ExternalLink,
  Hash,
  MessagesSquare,
  ThumbsDown,
  ThumbsUp,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  CardContent,
  CardFooter,
  EmptyState,
  PageHeading,
  SegmentedControl,
  SegmentedControlLink,
  Select,
  Textarea,
  buttonClass,
} from "@/components/ui";
import {
  generateComment,
  markCommentPosted,
  saveGeneratedComment,
  setHumanVerdict,
  unmarkCommentPosted,
} from "./actions";

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processed", label: "Processed" },
  { value: "failed", label: "Failed" },
] as const;

const RELEVANT_FILTERS = [
  { value: undefined, label: "Any" },
  { value: "true", label: "Relevant" },
  { value: "false", label: "Not relevant" },
] as const;

function filterHref(companyId: string, params: { status?: string; relevant?: string }) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.relevant) qs.set("relevant", params.relevant);
  const query = qs.toString();
  return `/companies/${companyId}/posts${query ? `?${query}` : ""}`;
}

export default async function CompanyPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ status?: string; relevant?: string }>;
}) {
  const { companyId } = await params;
  const { status, relevant } = await searchParams;
  const hasFilters = Boolean(status || relevant);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roles } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id)
    : { data: [] };
  const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "coworker");

  let query = supabase
    .from("posts")
    .select(
      "id, author, url, content, subreddit, upvotes, posted_at, received_at, ai_status, is_relevant, relevance_score, ai_reasoning, ai_error, human_verdict, generated_comment, generated_comment_persona_id, generated_comment_persona_rationale, comment_posted_at, comment_posted_by",
    )
    .eq("company_id", companyId)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (status === "pending" || status === "processed" || status === "failed") {
    query = query.eq("ai_status", status);
  }
  if (relevant) query = query.eq("is_relevant", relevant === "true");

  const { data: posts } = await query;

  // All personas (not just active) so a draft's persona name still resolves
  // even after staff deactivates it later; the override <Select> below
  // filters to active ones itself.
  const { data: personas } = await supabase
    .from("personas")
    .select("id, display_name, is_active")
    .eq("company_id", companyId)
    .order("display_name", { ascending: true });
  const personaMap = new Map((personas ?? []).map((p) => [p.id, p.display_name]));
  const activePersonas = (personas ?? []).filter((p) => p.is_active);

  // Who's eligible to be credited as "posted this comment" — staff only,
  // since only staff post replies on Reddit. Kept for future per-poster
  // metrics (reply volume, engagement, etc.).
  const { data: profiles } = await supabase.from("profiles").select("id, display_name, email");
  const { data: staffRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "coworker"]);
  const staffIds = new Set((staffRoles ?? []).map((r) => r.user_id));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));
  const staffMembers = (profiles ?? []).filter((p) => staffIds.has(p.id));

  return (
    <div className="space-y-6">
      <PageHeading title="Posts" description="Reddit posts ingested for this company." />

      <div className="flex flex-wrap items-center gap-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Status</p>
          <SegmentedControl>
            {STATUS_FILTERS.map((f) => (
              <SegmentedControlLink
                key={f.label}
                href={filterHref(companyId, { status: f.value, relevant })}
                active={status === f.value}
              >
                {f.label}
              </SegmentedControlLink>
            ))}
          </SegmentedControl>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Relevance</p>
          <SegmentedControl>
            {RELEVANT_FILTERS.map((f) => (
              <SegmentedControlLink
                key={f.label}
                href={filterHref(companyId, { status, relevant: f.value })}
                active={relevant === f.value}
              >
                {f.label}
              </SegmentedControlLink>
            ))}
          </SegmentedControl>
        </div>
      </div>

      {(posts ?? []).length > 0 ? (
        <div className="space-y-3">
          {(posts ?? []).map((post) => (
            <Card key={post.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    <User className="h-3.5 w-3.5" /> u/{post.author}
                  </span>
                  {post.subreddit && (
                    <span className="inline-flex items-center gap-1">
                      <Hash className="h-3.5 w-3.5" /> r/{post.subreddit}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <ArrowBigUp className="h-3.5 w-3.5" /> {post.upvotes ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {post.posted_at ? new Date(post.posted_at).toLocaleString() : "unknown date"}
                  </span>
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View on Reddit
                  </a>
                </div>

                <p className="line-clamp-3 text-sm text-ink">{post.content}</p>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      post.ai_status === "processed"
                        ? "good"
                        : post.ai_status === "failed"
                          ? "critical"
                          : "neutral"
                    }
                  >
                    {post.ai_status}
                  </Badge>
                  {post.ai_status === "processed" && (
                    <Badge variant={post.is_relevant ? "good" : "neutral"}>
                      {post.is_relevant ? "Relevant" : "Not relevant"} ({post.relevance_score})
                    </Badge>
                  )}
                  {post.human_verdict && <Badge variant="accent">Human: {post.human_verdict}</Badge>}
                </div>

                {post.ai_reasoning && (
                  <p className="border-l-2 border-border pl-3 text-xs text-ink-muted italic">
                    {post.ai_reasoning}
                  </p>
                )}
                {post.ai_error && <p className="text-xs text-critical">{post.ai_error}</p>}

                {post.is_relevant && (
                  <div className="space-y-2 rounded-md border border-border bg-surface-muted p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                        Reply draft
                      </span>
                      {post.generated_comment_persona_id ? (
                        <Badge variant="accent">
                          {personaMap.get(post.generated_comment_persona_id) ?? "Unknown persona"}
                        </Badge>
                      ) : (
                        post.generated_comment && <Badge variant="neutral">No persona matched</Badge>
                      )}
                      {post.comment_posted_at && (
                        <Badge variant="good">
                          Posted{post.comment_posted_by && ` by ${profileMap.get(post.comment_posted_by) ?? "unknown"}`}
                        </Badge>
                      )}
                    </div>

                    {post.generated_comment_persona_rationale && (
                      <p className="text-xs text-ink-muted italic">
                        {post.generated_comment_persona_rationale}
                      </p>
                    )}

                    {post.generated_comment ? (
                      isStaff ? (
                        <form
                          action={saveGeneratedComment.bind(null, companyId, post.id)}
                          className="space-y-2"
                        >
                          <Textarea
                            name="generated_comment"
                            rows={3}
                            defaultValue={post.generated_comment}
                            className="text-sm"
                          />
                          <button type="submit" className={buttonClass("secondary", "sm")}>
                            Save edits
                          </button>
                        </form>
                      ) : (
                        <p className="text-sm text-ink">{post.generated_comment}</p>
                      )
                    ) : (
                      !isStaff && <p className="text-xs text-ink-muted">No reply drafted yet.</p>
                    )}

                    {isStaff && (
                      <div className="flex flex-wrap items-center gap-2">
                        <form
                          action={generateComment.bind(null, companyId, post.id)}
                          className="flex items-center gap-2"
                        >
                          <Select name="persona_id" defaultValue="" className="h-8 w-auto text-xs">
                            <option value="">Auto (AI picks persona)</option>
                            {activePersonas.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.display_name}
                              </option>
                            ))}
                          </Select>
                          <button type="submit" className={buttonClass("secondary", "sm")}>
                            {post.generated_comment ? "Regenerate" : "Generate reply"}
                          </button>
                        </form>

                        {post.generated_comment &&
                          (post.comment_posted_at ? (
                            <form action={unmarkCommentPosted.bind(null, companyId, post.id)}>
                              <button type="submit" className={buttonClass("ghost", "sm")}>
                                Unmark as posted
                              </button>
                            </form>
                          ) : (
                            <form
                              action={markCommentPosted.bind(null, companyId, post.id)}
                              className="flex items-center gap-2"
                            >
                              <Select
                                name="posted_by"
                                defaultValue={user?.id ?? ""}
                                required
                                className="h-8 w-auto text-xs"
                              >
                                <option value="" disabled>
                                  Who posted this?
                                </option>
                                {staffMembers.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.display_name ?? s.email}
                                  </option>
                                ))}
                              </Select>
                              <button type="submit" className={buttonClass("secondary", "sm")}>
                                Mark as posted
                              </button>
                            </form>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>

              {isStaff && (
                <CardFooter className="flex-wrap justify-end">
                  <form action={setHumanVerdict.bind(null, companyId, post.id, "relevant")}>
                    <button
                      type="submit"
                      className={buttonClass("secondary", "sm")}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> Mark relevant
                    </button>
                  </form>
                  <form action={setHumanVerdict.bind(null, companyId, post.id, "irrelevant")}>
                    <button
                      type="submit"
                      className={buttonClass("secondary", "sm")}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" /> Mark irrelevant
                    </button>
                  </form>
                </CardFooter>
              )}
            </Card>
          ))}
        </div>
      ) : hasFilters ? (
        <EmptyState
          icon={MessagesSquare}
          title="No posts match these filters"
          description="Try a different status or relevance filter."
          action={
            <Link href={`/companies/${companyId}/posts`} className={buttonClass("secondary", "sm")}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <EmptyState
          icon={MessagesSquare}
          title="No posts yet"
          description="Once ingestion runs (or the inbound webhook receives a post), they'll show up here."
          action={
            <Link
              href={`/companies/${companyId}/settings`}
              className={buttonClass("secondary", "sm")}
            >
              Check ingestion settings
            </Link>
          }
        />
      )}
    </div>
  );
}
