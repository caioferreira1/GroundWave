import "server-only";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type GatewayRequest = {
  model?: string;
  messages: ChatMessage[];
  responseFormat?: "json_object";
  temperature?: number;
};

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

/**
 * Single choke point for every AI call in the app. Whether that call goes
 * straight to the Lovable AI Gateway or through a thin proxy Edge Function
 * (see plan, "Passo 0") is controlled entirely by AI_GATEWAY_MODE — nothing
 * outside this file should know or care which one is in effect.
 */
export async function callAiGateway(req: GatewayRequest): Promise<string> {
  const mode = process.env.AI_GATEWAY_MODE ?? "direct";

  const body = JSON.stringify({
    model: req.model ?? DEFAULT_MODEL,
    messages: req.messages,
    ...(req.responseFormat ? { response_format: { type: req.responseFormat } } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
  });

  const res =
    mode === "proxy" ? await callViaProxy(body) : await callDirect(body);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI gateway returned an empty response");
  return content;
}

async function callDirect(body: string): Promise<Response> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body,
  });
}

// Fallback path if Passo 0's direct-call test fails: a thin Edge Function
// living in a dedicated, minimal Lovable Cloud project (kept alive only to
// hold a working LOVABLE_API_KEY and make the actual gateway call from
// inside Lovable's own runtime, which is the officially supported path).
async function callViaProxy(body: string): Promise<Response> {
  const proxyUrl = process.env.AI_PROXY_URL;
  const proxySecret = process.env.AI_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) {
    throw new Error("AI_PROXY_URL / AI_PROXY_SECRET not configured (AI_GATEWAY_MODE=proxy)");
  }

  return fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
    body,
  });
}

/** Strips markdown code fences a model sometimes wraps JSON output in. */
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(cleaned) as T;
}
