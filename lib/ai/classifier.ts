import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAiGateway, parseJsonResponse } from "@/lib/ai/gateway";

export interface ClassificationResult {
  is_relevant: boolean;
  relevance_score: number;
  reasoning: string;
}

async function loadCompanyProfile(companyId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("companies")
    .select("profile")
    .eq("id", companyId)
    .maybeSingle();
  return data?.profile ?? "";
}

async function loadCorrectionExamples(companyId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("classifier_examples")
    .select("content, correct_is_relevant")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (!data || data.length === 0) return "";
  const lines = data.map(
    (e) =>
      `- [${e.correct_is_relevant ? "RELEVANT" : "IGNORE"}] "${(e.content ?? "").slice(0, 240)}"`,
  );
  return `\n\nCORRECTED EXAMPLES (team feedback — treat these as ground truth for this company):\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT_TEMPLATE = (profile: string) => `You are a strict relevance filter. You decide whether a social media post is worth the company's time to engage with. Your bias is toward REJECTION — false negatives are fine, false positives waste the company's time.

Use ONLY the Company Profile below as ground truth. Do not use outside knowledge to justify why a post "might" be relevant.

=== COMPANY PROFILE ===
${profile || "(No company profile configured yet — mark everything as not relevant.)"}
=== END COMPANY PROFILE ===

You MUST evaluate the post through THREE SEQUENTIAL GATES. If any gate fails, the post is NOT relevant. Do not try to be generous.

GATE 1 — TOPIC (on_topic):
Is the post about a CORE TOPIC the company directly addresses (per "Core Topics" in the profile)?
- FAIL if the post is about an "Adjacent Topic" or matches any "What to Ignore" example, even if it uses keywords from the company's space.
- FAIL if the topic is only tangentially mentioned or the post is really about something else.

GATE 2 — AUDIENCE (author_matches_audience):
Does the author plausibly match the "Ideal Customer Profile" in the company profile (role, career stage, situation)?
- FAIL if the author is clearly outside the ICP.
- If the post gives no signal about the author, default to PASS only when the content itself is a strong core-topic buyer signal; otherwise FAIL.

GATE 3 — INTENT (has_active_intent):
Is the author ACTIVELY doing one of: asking a question, describing a pain point, requesting a recommendation, comparing options, or venting a frustration that maps to what the company solves?
- FAIL if the post is a news share, opinion piece, self-promotion, job ad, resource dump, motivational content, or passive discussion with no ask.

SCORING (relevance_score 0-100):
- 0-30:  Fails Gate 1 (off-topic / adjacent / ignored category).
- 30-50: Passes Gate 1 but fails Gate 2 OR Gate 3.
- 50-70: Passes all 3 gates but signals are weak or ambiguous.
- 70-90: Passes all 3 gates with a clear pain point, question, or comparison directly about the company's core topic.
- 90-100: Passes all 3 gates AND the author explicitly asks for a tool/service/solution the company provides.

FINAL DECISION:
- is_relevant = true ONLY when on_topic=true AND author_matches_audience=true AND has_active_intent=true AND relevance_score >= 70.
- Otherwise is_relevant = false.
- When in doubt, mark false.

REASONING: one short English sentence. If is_relevant=false, cite which gate failed and why.

Reply ONLY with valid JSON, no extra text:
{"post_topic":"...","on_topic":true|false,"author_matches_audience":true|false,"has_active_intent":true|false,"is_relevant":true|false,"relevance_score":0-100,"reasoning":"..."}`;

/**
 * Classifies one post's relevance for its company and writes the result
 * straight to `posts`. Never throws — failures land in ai_status='failed'
 * so the ingestion loop that calls this for many posts at once can't be
 * taken down by one bad response.
 */
export async function classifyPost(post: {
  id: string;
  author: string;
  content: string;
  url: string;
  company_id: string;
  subreddit?: string | null;
}): Promise<void> {
  const admin = createAdminClient();

  try {
    const profile = await loadCompanyProfile(post.company_id);
    const corrections = await loadCorrectionExamples(post.company_id);
    const userPrompt = `Author: ${post.author}\nURL: ${post.url}\n\nContent:\n${post.content}${corrections}`;

    const content = await callAiGateway({
      messages: [
        { role: "system", content: SYSTEM_PROMPT_TEMPLATE(profile) },
        { role: "user", content: userPrompt },
      ],
      responseFormat: "json_object",
    });

    const parsed = parseJsonResponse<
      ClassificationResult & {
        on_topic?: boolean;
        author_matches_audience?: boolean;
        has_active_intent?: boolean;
      }
    >(content);

    // Enforce the 3-gate + threshold rule server-side too (defense against
    // the model returning is_relevant=true while a gate flag is false).
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.relevance_score) || 0)));
    const gatesPassed =
      parsed.on_topic !== false &&
      parsed.author_matches_audience !== false &&
      parsed.has_active_intent !== false;
    const isRelevant = Boolean(parsed.is_relevant) && gatesPassed && score >= 70;

    await admin
      .from("posts")
      .update({
        ai_status: "processed",
        is_relevant: isRelevant,
        relevance_score: score,
        ai_reasoning: String(parsed.reasoning ?? "").slice(0, 500),
        ai_error: null,
      })
      .eq("id", post.id);
  } catch (err) {
    console.error("[classifyPost] failed", err);
    await admin
      .from("posts")
      .update({
        ai_status: "failed",
        ai_error: err instanceof Error ? err.message : String(err),
      })
      .eq("id", post.id);
  }
}
