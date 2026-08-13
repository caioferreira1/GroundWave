import { Badge, Card, CardContent, CardHeader, CardTitle, CopyButton } from "@/components/ui";
import { PostedStatus } from "./posted-status";
import type { PostGenerationActions, PostGenerationRow } from "./types";

export function PostGenerationCard({
  post,
  actions,
}: {
  post: PostGenerationRow;
  actions?: PostGenerationActions;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral" className="font-mono">
            r/{post.subreddit}
          </Badge>
          <Badge variant="accent" className="capitalize">
            {post.theme}
          </Badge>
        </div>
        <CardTitle className="text-lg leading-snug">{post.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-auto rounded-md bg-secondary p-3">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{post.body}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={post.title} label="Copy Title" />
          <CopyButton value={post.body} label="Copy Body" />
        </div>
        {actions && <PostedStatus post={post} actions={actions} />}
      </CardContent>
    </Card>
  );
}
