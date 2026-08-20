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

const RELEVANCE_THRESHOLD = 50;

const SYSTEM_PROMPT_TEMPLATE = (profile: string) => `You are a relevance filter. You decide whether a social media post is worth the company's time to engage with.

Use ONLY the Company Profile below as ground truth. Do not invent exclusions that are not written in it — if the profile does not explicitly rule out a topic or audience, do not rule it out yourself just because it seems less valuable to you.

=== COMPANY PROFILE ===
${profile || "(No company profile configured yet — mark everything as not relevant.)"}
=== END COMPANY PROFILE ===

Give the post a single relevance_score from 0 to 100 for how worth engaging with it is, weighing three things together (none of them is a pass/fail switch on its own — weak or unclear signals should pull the score down a bit, not zero it out):

- TOPIC: is the post about a core topic the company addresses (per "Core Topics" in the profile)? This matters most. Only score low here if the post matches a "What to Ignore" example or is really about something else entirely — adjacent topics that plausibly overlap still count.
- AUDIENCE: does the author plausibly match the "Ideal Customer Profile" in the profile? Give the benefit of the doubt — only lower the score if the author is clearly and explicitly outside the ICP, or the profile explicitly excludes this kind of audience. No signal about the author is not a reason to lower it.
- INTENT: is the author asking a question, describing a pain point, requesting a recommendation, comparing options, venting a frustration, or otherwise engaging in discussion that maps to what the company solves? Explicit asks are not required. Only lower the score for pure self-promotion, job ads, or content with no discussion angle at all (e.g. a plain news link with no commentary).

When in doubt, score it higher rather than lower — the cost of missing a genuinely relevant post is worse than the cost of surfacing a borderline one for a human to skip.

SCORING GUIDE:
- 0-30: off-topic, or matches a "What to Ignore" example.
- 30-50: on-topic but the audience or intent signal is weak or off.
- 50-70: on-topic, plausible audience, some discussion angle, but signals are ambiguous.
- 70-90: clearly on-topic with a real pain point, question, or comparison, and a plausible audience.
- 90-100: all three line up strongly, ideally with an explicit ask for a tool/service/solution the company provides.

is_relevant = true when relevance_score >= ${RELEVANCE_THRESHOLD}, false otherwise.

REASONING: one short English sentence covering topic/audience/intent in brief. If the score is low, say what pulled it down.

Reply ONLY with valid JSON, no extra text:
{"post_topic":"...","is_relevant":true|false,"relevance_score":0-100,"reasoning":"..."}`;

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

    const parsed = parseJsonResponse<ClassificationResult>(content);

    // Enforce the threshold server-side too (defense against the model
    // returning is_relevant=true with a score below the cutoff, or vice versa).
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.relevance_score) || 0)));
    const isRelevant = score >= RELEVANCE_THRESHOLD;

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
