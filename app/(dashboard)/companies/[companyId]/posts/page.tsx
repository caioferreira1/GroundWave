import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card } from "@/components/ui";
import { setHumanVerdict } from "./actions";

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
      "id, author, url, content, subreddit, upvotes, received_at, ai_status, is_relevant, relevance_score, ai_reasoning, ai_error, human_verdict",
    )
    .eq("company_id", companyId)
    .order("received_at", { ascending: false })
    .limit(100);
  if (status === "pending" || status === "processed" || status === "failed") {
    query = query.eq("ai_status", status);
  }
  if (relevant) query = query.eq("is_relevant", relevant === "true");

  const { data: posts } = await query;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.label}
              href={filterHref(companyId, { status: f.value, relevant })}
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium " +
                (status === f.value
                  ? "bg-accent-soft text-accent-strong"
                  : "text-ink-muted hover:bg-surface-muted")
              }
            >
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1">
          {RELEVANT_FILTERS.map((f) => (
            <Link
              key={f.label}
              href={filterHref(companyId, { status, relevant: f.value })}
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium " +
                (relevant === f.value
                  ? "bg-accent-soft text-accent-strong"
                  : "text-ink-muted hover:bg-surface-muted")
              }
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {(posts ?? []).map((post) => (
          <Card key={post.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span className="font-medium text-ink">u/{post.author}</span>
              {post.subreddit && <span>r/{post.subreddit}</span>}
              <span>{post.upvotes ?? 0} upvotes</span>
              <span>{new Date(post.received_at).toLocaleString()}</span>
              <a href={post.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                View on Reddit
              </a>
            </div>

            <p className="line-clamp-3 text-sm text-ink">{post.content}</p>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  post.ai_status === "processed" ? "good" : post.ai_status === "failed" ? "critical" : "neutral"
                }
              >
                {post.ai_status}
              </Badge>
              {post.ai_status === "processed" && (
                <Badge variant={post.is_relevant ? "good" : "neutral"}>
                  {post.is_relevant ? "Relevant" : "Not relevant"} ({post.relevance_score})
                </Badge>
              )}
              {post.human_verdict && (
                <Badge variant="accent">Human: {post.human_verdict}</Badge>
              )}
            </div>

            {post.ai_reasoning && <p className="text-xs text-ink-muted">{post.ai_reasoning}</p>}
            {post.ai_error && <p className="text-xs text-critical">{post.ai_error}</p>}

            {isStaff && (
              <div className="flex gap-2 pt-1">
                <form action={setHumanVerdict.bind(null, companyId, post.id, "relevant")}>
                  <Button type="submit" variant="secondary" className="text-xs">
                    Mark relevant
                  </Button>
                </form>
                <form action={setHumanVerdict.bind(null, companyId, post.id, "irrelevant")}>
                  <Button type="submit" variant="secondary" className="text-xs">
                    Mark irrelevant
                  </Button>
                </form>
              </div>
            )}
          </Card>
        ))}

        {(posts ?? []).length === 0 && (
          <p className="text-sm text-ink-muted">No posts match these filters yet.</p>
        )}
      </div>
    </div>
  );
}
