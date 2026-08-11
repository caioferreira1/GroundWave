import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAiGateway, parseJsonResponse } from "@/lib/ai/gateway";
import { POST_GENERATOR_SUBREDDITS } from "@/lib/reddit/subreddits";
import {
  ANTI_IMPERSONATION_NOTE,
  cleanComment,
  personaBriefing,
  type PersonaRow,
} from "@/lib/ai/reply-generator";

export interface GeneratedPostGeneration {
  id: string;
  companyId: string | null;
  mode: "generic" | "company";
  personaId: string | null;
  personaRationale: string | null;
  subreddit: string;
  theme: string;
  title: string;
  body: string;
}

const POST_HARD_RULES = `Você é um usuário real do Reddit criando um post orgânico e autêntico para a comunidade.

Com base no subreddit fornecido, escolha um tema ALEATÓRIO, específico e genuinamente relevante para aquela comunidade.

VARIE o formato do post a cada vez. Escolha aleatoriamente entre estilos diferentes, como por exemplo:
- Relatar uma experiência pessoal ou história
- Fazer uma pergunta genérica e aberta para a comunidade
- Fazer uma pergunta bem específica buscando ajuda ou opinião
- Compartilhar uma reflexão, dúvida, desabafo ou descoberta
- Pedir recomendações ou comparar opções

Nunca repita sempre o mesmo padrão. Cada post deve soar diferente do anterior.

REGRAS para parecer 100% humano (nunca pode parecer escrito por IA):
- Não use travessões nem hífens para separar frases ou ideias. Escreva frases naturais com vírgulas e pontos.
- Evite frases típicas de IA, linguagem corporativa, estrutura perfeita demais ou listas formais.
- Escreva de forma casual, espontânea e imperfeita, como uma pessoa real escreveria de improviso.
- Sem tom promocional, de propaganda ou de marketing.
- Pode usar gírias, abreviações e um tom informal quando fizer sentido para a comunidade.

Escreva no idioma predominante do subreddit (geralmente inglês). O título deve ser natural e chamativo, e o corpo envolvente, respeitando o estilo típico daquela comunidade.`;

/**
 * Company mode only: nudges the model to drop the brand (or a more specific
 * identifier called out in guardrails, e.g. a founder's distinctive name)
 * into the post naturally sometimes — never as an ad, never every time.
 * Without this the model has no idea the company exists (name isn't in the
 * prompt at all otherwise) and the "no promotional tone" hard rule pushes it
 * to never mention the brand at all.
 */
function buildMentionBlock(companyName: string): string {
  return `\n\nORGANIC MENTION (company mode only):
This post is for "${companyName}". Roughly one in three to four posts, mention it (or, if the guardrails above call out a more specific and unique identifier — like a founder's distinctive name — prefer that instead, since it reads as less promotional) casually in passing, the way a real redditor drops a name they follow or use: "I picked this up from ${companyName}", "there's this guy from ${companyName} who...", never as a pitch or a link. The rest of the time, don't mention it at all. Never force it, never repeat the same phrasing twice in a row.`;
}

/**
 * Shared between both modes: with no guardrails/personas it's exactly the
 * generic-mode prompt; with them, it layers brand guardrails and an optional
 * persona catalog on top — same shape as reply-generator's buildSystemPrompt,
 * except there's no manual persona override here (nothing to override yet,
 * this is the first draft of the post, not a reply to review).
 */
function buildSystemPrompt(params: {
  guardrailsMd: string | null;
  personas: PersonaRow[];
  companyName: string | null;
}): string {
  const { guardrailsMd, personas, companyName } = params;

  const guardrailsBlock = guardrailsMd
    ? `\n\nBRAND GUARDRAILS (mandatory — tone rules and any required disclaimers):\n${guardrailsMd}`
    : "";

  const mentionBlock = companyName ? buildMentionBlock(companyName) : "";

  let personaBlock = "";
  if (personas.length > 0) {
    const catalog = personas
      .map((p) => `- [${p.id}] ${p.display_name}\n${personaBriefing(p)}`)
      .join("\n\n");
    personaBlock = `\n\nTARGET READER PROFILES (choose the ONE whose voice/vocabulary best fits this post, then write in that voice; pick null if none fit):\n${catalog}\n\n${ANTI_IMPERSONATION_NOTE}`;
  }

  const outputSchema =
    personas.length > 0
      ? `{"personaId":"<one of the ids above, or null if none fit>","rationale":"one short sentence on why this reader profile fits","theme":"...","title":"...","body":"..."}`
      : `{"theme":"...","title":"...","body":"..."}`;

  return `${POST_HARD_RULES}${guardrailsBlock}${mentionBlock}${personaBlock}

OUTPUT:
Reply ONLY with valid JSON, no extra text, no markdown fences: ${outputSchema}`;
}

/**
 * Generates one original Reddit post and writes it straight to
 * `post_generations` (mirrors generateReply's pattern of owning both the AI
 * call and the write). Generic mode picks from a fixed subreddit list and
 * skips persona/guardrails entirely; company mode picks from the company's
 * suggested subreddits and layers in guardrails + best-fit active persona,
 * same as the reply generator.
 */
export async function generatePostGeneration(
  opts: { mode: "generic"; createdBy: string } | { mode: "company"; companyId: string; createdBy: string },
): Promise<GeneratedPostGeneration> {
  const admin = createAdminClient();

  let companyId: string | null = null;
  let subreddit: string;
  let guardrailsMd: string | null = null;
  let companyName: string | null = null;
  let personas: PersonaRow[] = [];

  if (opts.mode === "company") {
    companyId = opts.companyId;

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("name, suggested_subreddits, guardrails_md")
      .eq("id", opts.companyId)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!company) throw new Error("Company not found");
    if (!company.suggested_subreddits || company.suggested_subreddits.length === 0) {
      throw new Error("This company has no suggested subreddits configured yet");
    }

    guardrailsMd = company.guardrails_md;
    companyName = company.name;
    subreddit =
      company.suggested_subreddits[Math.floor(Math.random() * company.suggested_subreddits.length)];

    const { data: personaRows, error: personaError } = await admin
      .from("personas")
      .select("id, display_name, content_md")
      .eq("company_id", opts.companyId)
      .eq("is_active", true)
      .order("display_name", { ascending: true });
    if (personaError) throw new Error(personaError.message);
    personas = personaRows ?? [];
  } else {
    subreddit = POST_GENERATOR_SUBREDDITS[Math.floor(Math.random() * POST_GENERATOR_SUBREDDITS.length)];
  }

  const nonce = Math.random().toString(36).slice(2, 10);
  const systemPrompt = buildSystemPrompt({ guardrailsMd, personas, companyName });
  const userPrompt = `Subreddit: r/${subreddit}\nVariation nonce: ${nonce}`;

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
    theme?: string;
    title?: string;
    body?: string;
  }>(raw);

  const theme = String(parsed.theme ?? "").trim();
  const title = cleanComment(String(parsed.title ?? ""));
  const body = cleanComment(String(parsed.body ?? ""));
  if (!theme || !title || !body) throw new Error("AI response missing theme, title or body");

  const personaId = personas.find((p) => p.id === parsed.personaId)?.id ?? null;
  const personaRationale = personaId ? String(parsed.rationale ?? "").slice(0, 500) || null : null;

  const { data: row, error: insertError } = await admin
    .from("post_generations")
    .insert({
      company_id: companyId,
      mode: opts.mode,
      persona_id: personaId,
      persona_rationale: personaRationale,
      subreddit,
      theme,
      title,
      body,
      created_by: opts.createdBy,
    })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);

  return {
    id: row.id,
    companyId: row.company_id,
    mode: row.mode,
    personaId: row.persona_id,
    personaRationale: row.persona_rationale,
    subreddit: row.subreddit,
    theme: row.theme,
    title: row.title,
    body: row.body,
  };
}
