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
- Default to lowercase, casual Reddit style (contractions, short choppy sentences) — that is the norm for this platform, even replying to posts that read a bit more put together.
- Only switch to a normal capital letter and a more formal register when the post is clearly technical, professional, or in a context where casual would read as tone deaf (e.g. a serious medical or legal question). When in doubt, stay casual.

TONE:
- Sound like a human redditor who actually has experience with whatever the post is about.
- Be genuinely useful. If you do not have anything useful to add, give a short honest take or a clarifying question, do not pad.`;

// Fraction of replies where the model is even allowed to know the company's
// name. LLMs are unreliable at self-sampling a rate like "1 in 5" from
// instructions alone — testing showed a model told to mention "sometimes"
// mentions it most of the time instead. Deciding it in code instead, and
// leaving the company name out of the prompt entirely the rest of the time,
// makes the cap a hard ceiling instead of a suggestion.
const MENTION_PROBABILITY = 0.2;

/**
 * Nudges the model to drop the brand (or a more specific identifier called
 * out in guardrails, e.g. a founder's distinctive name) into a reply
 * naturally, for the fraction of calls where generateReply() decided to
 * allow it (see MENTION_PROBABILITY) — never as a pitch.
 */
function buildMentionAllowedBlock(companyName: string): string {
  return `\n\nORGANIC MENTION (permission granted for this reply only):
You may, if it genuinely fits, mention "${companyName}" (or, if the guardrails above call out a more specific and unique identifier — like a founder's distinctive name — prefer that instead, since it reads as less promotional) casually in passing, the way a real redditor drops something they use or follow: "I used ${companyName} for this", "there's this thing called ${companyName} that helped me with that". Never a pitch, never a link. If it does not fit this specific reply naturally, skip it, do not force it in.`;
}

/**
 * For the majority of calls where a mention is NOT allowed. Brand guardrails
 * often describe how to cite the company/founder (naming conventions,
 * preferred form) without gating how often — read on their own, that reads
 * to the model as blanket permission, so testing showed the company/founder
 * name leaking into nearly every reply even with the name withheld from the
 * mention block above. This is an explicit override that beats that leak.
 */
function buildNoMentionBlock(companyName: string): string {
  return `\n\nNO MENTION THIS TIME:
Do not mention "${companyName}", its founder, or any brand identifier in this reply, even if the guardrails above describe how such mentions should be phrased — those rules apply only when a mention has been explicitly allowed, which is not the case here. Just give genuine, generic help with zero reference to the brand.`;
}

function buildSystemPrompt(params: {
  guardrailsMd: string | null;
  companyName: string | null;
  allowMention: boolean;
}): string {
  const { guardrailsMd, companyName, allowMention } = params;

  const guardrailsBlock = guardrailsMd
    ? `\n\nBRAND GUARDRAILS (mandatory — tone rules and any required disclaimers):\n${guardrailsMd}`
    : "";

  const mentionBlock = companyName
    ? allowMention
      ? buildMentionAllowedBlock(companyName)
      : buildNoMentionBlock(companyName)
    : "";

  return `${HARD_RULES}${guardrailsBlock}${mentionBlock}

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
  const allowMention = Math.random() < MENTION_PROBABILITY;
  const systemPrompt = buildSystemPrompt({
    guardrailsMd: company?.guardrails_md ?? null,
    companyName: company?.name ?? null,
    allowMention,
  });
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
