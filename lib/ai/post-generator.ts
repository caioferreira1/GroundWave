import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAiGateway, parseJsonResponse } from "@/lib/ai/gateway";
import { POST_GENERATOR_SUBREDDITS } from "@/lib/reddit/subreddits";
import { cleanComment } from "@/lib/ai/reply-generator";

export interface GeneratedPostGeneration {
  id: string;
  companyId: string | null;
  mode: "generic" | "company";
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
 * Shared between both modes: with no guardrails it's exactly the
 * generic-mode prompt; with them, it layers brand guardrails on top.
 */
function buildSystemPrompt(params: { guardrailsMd: string | null; companyName: string | null }): string {
  const { guardrailsMd, companyName } = params;

  const guardrailsBlock = guardrailsMd
    ? `\n\nBRAND GUARDRAILS (mandatory — tone rules and any required disclaimers):\n${guardrailsMd}`
    : "";

  const mentionBlock = companyName ? buildMentionBlock(companyName) : "";

  return `${POST_HARD_RULES}${guardrailsBlock}${mentionBlock}

OUTPUT:
Reply ONLY with valid JSON, no extra text, no markdown fences: {"theme":"...","title":"...","body":"..."}`;
}

/**
 * Generates one original Reddit post and writes it straight to
 * `post_generations` (mirrors generateReply's pattern of owning both the AI
 * call and the write). Generic mode picks from a fixed subreddit list and
 * skips guardrails entirely; company mode picks from the company's suggested
 * subreddits and layers in guardrails.
 */
export async function generatePostGeneration(
  opts: { mode: "generic"; createdBy: string } | { mode: "company"; companyId: string; createdBy: string },
): Promise<GeneratedPostGeneration> {
  const admin = createAdminClient();

  let companyId: string | null = null;
  let subreddit: string;
  let guardrailsMd: string | null = null;
  let companyName: string | null = null;

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
  } else {
    subreddit = POST_GENERATOR_SUBREDDITS[Math.floor(Math.random() * POST_GENERATOR_SUBREDDITS.length)];
  }

  const nonce = Math.random().toString(36).slice(2, 10);
  const systemPrompt = buildSystemPrompt({ guardrailsMd, companyName });
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
    theme?: string;
    title?: string;
    body?: string;
  }>(raw);

  const theme = String(parsed.theme ?? "").trim();
  const title = cleanComment(String(parsed.title ?? ""));
  const body = cleanComment(String(parsed.body ?? ""));
  if (!theme || !title || !body) throw new Error("AI response missing theme, title or body");

  const { data: row, error: insertError } = await admin
    .from("post_generations")
    .insert({
      company_id: companyId,
      mode: opts.mode,
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
    subreddit: row.subreddit,
    theme: row.theme,
    title: row.title,
    body: row.body,
  };
}
