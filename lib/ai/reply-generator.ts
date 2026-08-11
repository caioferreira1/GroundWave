import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAiGateway, parseJsonResponse } from "@/lib/ai/gateway";

export interface GeneratedReply {
  comment: string;
  personaId: string | null;
  personaRationale: string | null;
}

export type PersonaRow = {
  id: string;
  display_name: string;
  content_md: string;
};

/** Pulls a named "## Heading" section out of a persona's content_md, or null if absent. */
export function extractMarkdownSection(md: string, heading: string): string | null {
  const re = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const match = md.match(re);
  return match ? match[1].trim() : null;
}

/**
 * Condenses a persona to the parts that actually change how a reply reads
 * (summary + voice/vocabulary + language examples) — Dores/Objeções/Gatilhos
 * are marketing-psychology sections that don't change word choice, so they're
 * left out to keep the prompt from ballooning. Falls back to the full body
 * if a persona wasn't authored with these headings (e.g. created by hand in
 * the UI instead of imported from a `.md` file).
 */
export function personaBriefing(persona: PersonaRow): string {
  const resumo = extractMarkdownSection(persona.content_md, "Resumo");
  const voz = extractMarkdownSection(persona.content_md, "Voz e vocabulário");
  const exemplos = extractMarkdownSection(persona.content_md, "Exemplos de linguagem");
  const parts = [
    resumo && `Summary: ${resumo}`,
    voz && `Voice/vocabulary notes: ${voz}`,
    exemplos && `Language examples: ${exemplos}`,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join("\n") : persona.content_md;
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

export const ANTI_IMPERSONATION_NOTE =
  "IMPORTANT: the reader profile(s) below describe how to write FOR that type of reader — their pain points, vocabulary, and mindset — so you can calibrate tone and word choice. They are NOT an identity for you to claim. Never say or imply you belong to that audience segment yourself (e.g. never claim to be a student, resident, or researcher in that exact situation).";

function buildSystemPrompt(params: {
  guardrailsMd: string | null;
  personas: PersonaRow[];
  overridePersona: PersonaRow | null;
}): string {
  const { guardrailsMd, personas, overridePersona } = params;

  const guardrailsBlock = guardrailsMd
    ? `\n\nBRAND GUARDRAILS (mandatory — tone rules and any required disclaimers):\n${guardrailsMd}`
    : "";

  let personaBlock = "";
  if (overridePersona) {
    personaBlock = `\n\nTARGET READER PROFILE (already selected by staff — write for this reader):\n${overridePersona.display_name}\n${personaBriefing(overridePersona)}\n\n${ANTI_IMPERSONATION_NOTE}`;
  } else if (personas.length > 0) {
    const catalog = personas
      .map((p) => `- [${p.id}] ${p.display_name}\n${personaBriefing(p)}`)
      .join("\n\n");
    personaBlock = `\n\nTARGET READER PROFILES (choose the ONE that best fits this specific post's author and content, then calibrate voice to them):\n${catalog}\n\n${ANTI_IMPERSONATION_NOTE}`;
  }

  const outputSchema = overridePersona
    ? `{"comment":"..."}`
    : personas.length > 0
      ? `{"personaId":"<one of the ids above, or null if none fit>","rationale":"one short sentence on why this reader profile fits","comment":"..."}`
      : `{"comment":"..."}`;

  return `${HARD_RULES}${guardrailsBlock}${personaBlock}

OUTPUT:
Reply ONLY with valid JSON, no extra text, no markdown fences: ${outputSchema}`;
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
 * Generates a persona-aware Reddit reply for a post and writes it straight
 * to `posts` (mirrors classifyPost's pattern of owning both the AI call and
 * the write). If `opts.personaId` is given, that persona is used as-is and
 * the model skips the "which persona" choice; otherwise the model picks the
 * best-fitting active persona from the company's catalog. Companies with no
 * active personas yet still get a reply, just without persona calibration.
 */
export async function generateReply(
  postId: string,
  opts?: { personaId?: string },
): Promise<GeneratedReply> {
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

  let overridePersona: PersonaRow | null = null;
  let personas: PersonaRow[] = [];

  if (opts?.personaId) {
    const { data, error } = await admin
      .from("personas")
      .select("id, display_name, content_md")
      .eq("id", opts.personaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Selected persona not found");
    overridePersona = data;
  } else {
    const { data, error } = await admin
      .from("personas")
      .select("id, display_name, content_md")
      .eq("company_id", post.company_id)
      .eq("is_active", true)
      .order("display_name", { ascending: true });
    if (error) throw new Error(error.message);
    personas = data ?? [];
  }

  const nonce = Math.random().toString(36).slice(2, 10);
  const systemPrompt = buildSystemPrompt({
    guardrailsMd: company?.guardrails_md ?? null,
    personas,
    overridePersona,
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

  const parsed = parseJsonResponse<{
    personaId?: string | null;
    rationale?: string;
    comment: string;
  }>(raw);

  const comment = cleanComment(String(parsed.comment ?? ""));
  if (!comment) throw new Error("AI returned an empty comment");

  const resolvedPersonaId = overridePersona
    ? overridePersona.id
    : (personas.find((p) => p.id === parsed.personaId)?.id ?? null);
  const resolvedRationale = overridePersona
    ? null
    : resolvedPersonaId
      ? String(parsed.rationale ?? "").slice(0, 500) || null
      : null;

  const { error: updateError } = await admin
    .from("posts")
    .update({
      generated_comment: comment,
      generated_comment_persona_id: resolvedPersonaId,
      generated_comment_persona_rationale: resolvedRationale,
      comment_generated_at: new Date().toISOString(),
    })
    .eq("id", postId);
  if (updateError) throw new Error(updateError.message);

  return { comment, personaId: resolvedPersonaId, personaRationale: resolvedRationale };
}
