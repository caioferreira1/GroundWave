import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAiGateway, parseJsonResponse } from "@/lib/ai/gateway";

export interface GeneratedReply {
  comment: string;
}

const HARD_RULES = `You write Reddit comments that sound like a real person, not an AI. Your goal is to GENUINELY help the original poster.

HARD RULES (these are non-negotiable):
- Always reply in English, even though some reference material below may be in Portuguese — that material is internal notes on the reader, not the output language.
- Keep it short: 1 to 3 sentences, max 4. No walls of text.
- ABSOLUTELY NO hyphens or dashes of any kind. Never use "-", "–", or "—". Rewrite phrases to avoid them entirely. No compound words with hyphens. No em dashes for emphasis or asides. Use commas, periods, or two sentences instead.
- No markdown, no bullet lists, no headings, no bold, no links.
- No emojis unless it would feel weirdly cold not to have one, and at most one.
- Never sound like an AI. Banned openings and phrases: "I'd be happy to", "great question", "as an AI", "happy to help", "absolutely", "certainly", "I hope this helps", "feel free to", "let me know if".
- Vary the format every time. Do not always start the same way. Rotate between: a direct answer, a quick personal experience, a clarifying question back, a single concrete tip, a short opinion. Look at the NONCE below to pick a different angle than you would by default.

CAPITALIZATION:
- If the post sounds informal, casual, or like quick chat (lowercase usage, slang, short choppy sentences), start your reply with a lowercase letter and keep that casual register.
- If the post sounds more formal, technical, professional, or well written, start with a normal capital letter and match that register.
- Match the user's energy, do not force casualness on a formal post or formality on a casual one.

TONE:
- Sound like a human redditor who actually has experience with whatever the post is about.
- Be genuinely useful. If you do not have anything useful to add, give a short honest take or a clarifying question, do not pad.`;

function buildSystemPrompt(params: { guardrailsMd: string | null }): string {
  const guardrailsBlock = params.guardrailsMd
    ? `\n\nBRAND GUARDRAILS (mandatory — tone rules and any required disclaimers):\n${params.guardrailsMd}`
    : "";

  return `${HARD_RULES}${guardrailsBlock}

OUTPUT:
Reply ONLY with valid JSON, no extra text, no markdown fences: {"comment":"..."}`;
}

/** Strips stray hyphens/dashes the model sometimes sneaks in despite the hard rule. */
export function cleanComment(raw: string): string {
  return raw
    .replace(/[‐-―]/g, " ")
    .replace(/-/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

/**
 * Generates a Reddit reply for a post and writes it straight to `posts`
 * (mirrors classifyPost's pattern of owning both the AI call and the write).
 */
export async function generateReply(postId: string): Promise<GeneratedReply> {
  const admin = createAdminClient();

  const { data: post, error: postError } = await admin
    .from("posts")
    .select("id, author, content, subreddit, url, company_id")
    .eq("id", postId)
    .maybeSingle();
  if (postError) throw new Error(postError.message);
  if (!post) throw new Error("Post not found");
  if (!post.company_id) throw new Error("Post has no company");

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("name, guardrails_md")
    .eq("id", post.company_id)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);

  const nonce = Math.random().toString(36).slice(2, 10);
  const systemPrompt = buildSystemPrompt({ guardrailsMd: company?.guardrails_md ?? null });
  const userPrompt = `Subreddit: r/${post.subreddit ?? "unknown"}\nPost author: ${post.author}\nPost content:\n"""\n${post.content}\n"""\n\nWrite one Reddit comment following all the rules. Variation nonce: ${nonce}`;

  const raw = await callAiGateway({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    responseFormat: "json_object",
    temperature: 0.95,
  });

  const parsed = parseJsonResponse<{ comment: string }>(raw);

  const comment = cleanComment(String(parsed.comment ?? ""));
  if (!comment) throw new Error("AI returned an empty comment");

  const { error: updateError } = await admin
    .from("posts")
    .update({
      generated_comment: comment,
      comment_generated_at: new Date().toISOString(),
    })
    .eq("id", postId);
  if (updateError) throw new Error(updateError.message);

  return { comment };
}
