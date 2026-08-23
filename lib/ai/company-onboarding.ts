import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAiGateway, parseJsonResponse } from "@/lib/ai/gateway";

const MAX_PROFILE_SOURCE_CHARS = 15000;
const MAX_SUGGESTED_SUBREDDITS = 10;
const MAX_SUGGESTED_KEYWORDS = 15;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function faviconFromUrl(websiteUrl: string): string | null {
  try {
    const host = new URL(websiteUrl).host;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  } catch {
    return null;
  }
}

const PROFILE_SYSTEM_PROMPT = `You are helping set up a company profile that will be used as ground truth by an AI relevance classifier deciding whether Reddit posts are worth a company engaging with. Read the raw web page content the user gives you and produce a structured profile in Markdown with EXACTLY these sections, in this order:

## Company
One or two sentences: what the company is and does.

## Products
The key products or services offered.

## Value proposition
The core problem solved and why it matters.

## Ideal Customer Profile
Who the company should engage with on Reddit — be specific about role, context, or situation, not generic demographics.

## Core Topics
Topics a Reddit post should be about to be worth engaging with. This is the primary signal the classifier weighs, so be specific and concrete.

## Adjacent Topics
Topics that plausibly overlap and should still count as relevant even if not a perfect match.

## What to Ignore
Concrete examples of topics, audiences, or post types that look superficially related but should NOT be treated as relevant. The classifier only excludes what is explicitly listed here, so be specific.

Write in English. Be concrete and specific, not generic marketing language — this profile is read by an AI, not a human, so prioritize precision over persuasion. Base everything on the page content given; do not invent product details that aren't supported by it.

Reply with the Markdown profile only. No preamble, no code fences.`;

const SUBREDDITS_SYSTEM_PROMPT = `Given a company profile, suggest subreddits where the company's ideal customers are likely to post about the "Core Topics" and problems described in the profile. Favor active, on-topic communities over huge generic ones. Do not include the "r/" prefix.

Reply ONLY with valid JSON, no extra text, no markdown fences: {"subreddits": ["subredditname", ...]}, at most ${MAX_SUGGESTED_SUBREDDITS} entries, ordered by relevance.`;

const KEYWORDS_SYSTEM_PROMPT = `Given a company profile, suggest Reddit search keywords or short phrases that would surface posts from people describing the problems or intent in the "Core Topics" and "Ideal Customer Profile" sections. Avoid single common words that would return mostly noise; prefer specific phrases someone would actually type.

Reply ONLY with valid JSON, no extra text, no markdown fences: {"keywords": ["...", ...]}, at most ${MAX_SUGGESTED_KEYWORDS} entries, ordered by how likely they are to find genuinely relevant discussions.`;

/**
 * Fetches the given website, asks the AI to summarize it into the structured
 * profile format `lib/ai/classifier.ts` expects, and writes the result (plus
 * a derived favicon) straight to `companies`. Takes `websiteUrl` as an
 * explicit argument (rather than reading the saved column) so it also picks
 * up a URL the user just typed but hasn't saved yet.
 */
export async function generateCompanyProfile(companyId: string, websiteUrl: string): Promise<string> {
  if (!websiteUrl) throw new Error("Set a website URL before generating a profile");

  const res = await fetch(websiteUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GroundWaveBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Could not fetch website (${res.status})`);
  const html = await res.text();
  const pageText = stripHtml(html).slice(0, MAX_PROFILE_SOURCE_CHARS);
  if (!pageText) throw new Error("Website returned no readable content");

  const raw = await callAiGateway({
    messages: [
      { role: "system", content: PROFILE_SYSTEM_PROMPT },
      { role: "user", content: `Website: ${websiteUrl}\n\nPage content:\n"""\n${pageText}\n"""` },
    ],
  });

  const profile = raw.trim();
  if (!profile) throw new Error("AI returned an empty profile");

  const admin = createAdminClient();
  const { error } = await admin
    .from("companies")
    .update({ profile, website_url: websiteUrl, favicon_url: faviconFromUrl(websiteUrl) })
    .eq("id", companyId);
  if (error) throw new Error(error.message);

  return profile;
}

export async function generateCompanySuggestedSubreddits(companyId: string, profile: string): Promise<string[]> {
  if (!profile) throw new Error("Generate a company profile first");

  const raw = await callAiGateway({
    messages: [
      { role: "system", content: SUBREDDITS_SYSTEM_PROMPT },
      { role: "user", content: `Company profile:\n"""\n${profile}\n"""` },
    ],
    responseFormat: "json_object",
  });

  const parsed = parseJsonResponse<{ subreddits?: unknown }>(raw);
  const subreddits = Array.isArray(parsed.subreddits)
    ? parsed.subreddits
        .map((s) => String(s).trim().replace(/^r\//i, ""))
        .filter(Boolean)
        .slice(0, MAX_SUGGESTED_SUBREDDITS)
    : [];
  if (subreddits.length === 0) throw new Error("AI returned no subreddits");

  const admin = createAdminClient();
  const { error } = await admin.from("companies").update({ suggested_subreddits: subreddits }).eq("id", companyId);
  if (error) throw new Error(error.message);

  return subreddits;
}

export async function generateCompanySuggestedKeywords(companyId: string, profile: string): Promise<string[]> {
  if (!profile) throw new Error("Generate a company profile first");

  const raw = await callAiGateway({
    messages: [
      { role: "system", content: KEYWORDS_SYSTEM_PROMPT },
      { role: "user", content: `Company profile:\n"""\n${profile}\n"""` },
    ],
    responseFormat: "json_object",
  });

  const parsed = parseJsonResponse<{ keywords?: unknown }>(raw);
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords
        .map((k) => String(k).trim())
        .filter(Boolean)
        .slice(0, MAX_SUGGESTED_KEYWORDS)
    : [];
  if (keywords.length === 0) throw new Error("AI returned no keywords");

  const admin = createAdminClient();
  const { error } = await admin.from("companies").update({ search_keywords: keywords }).eq("id", companyId);
  if (error) throw new Error(error.message);

  return keywords;
}
