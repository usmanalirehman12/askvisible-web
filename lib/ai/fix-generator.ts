import type { AnalyzedAnswer } from "./types";

export type GeneratedFix = {
  category: string;
  title: string;
  rationale: string;
  generatedContent: string;
  impactLow: number;
  impactHigh: number;
};

// Sonnet, not the Haiku default used for the cross-engine check (ANTHROPIC_MODEL) — this is
// the "real writing quality" role from the architecture decision (fix copy a client actually
// reads), not the high-volume mention-classification role. Separate env var on purpose so
// the two roles can be tuned/priced independently.
const FIX_MODEL = process.env.ANTHROPIC_FIX_MODEL || "claude-sonnet-5";

async function postJson(url: string, init: RequestInit, attempts = 3): Promise<any> {
  let last: Error = new Error("Fix generation request failed");
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(90_000) });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const message = data?.error?.message || `Anthropic returned HTTP ${response.status}`;
      last = new Error(message);
      if (response.status !== 429 && response.status < 500) throw last;
    } catch (error) { last = error instanceof Error ? error : last; }
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250));
  }
  throw last;
}

export function fixGeneratorConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You are an AI-search-visibility consultant. Given a business and evidence of how AI engines (ChatGPT, Gemini, Perplexity, Claude) currently answer buyer questions about its category, propose up to 10 concrete, specific fixes that would make AI engines more likely to mention and recommend this business. Each fix must include ready-to-use content the business can actually publish (a schema markup snippet, a rewritten paragraph, a review-response template, or similar) — not just advice to "improve X". Respond with ONLY a JSON array, no prose before or after, matching exactly:
[{"category": "content|schema|authority|reviews|gbp", "title": "short action title", "rationale": "1-2 sentences on why this matters, citing the evidence", "generatedContent": "the actual fix content, ready to use", "impactLow": 4, "impactHigh": 12}]
impactLow/impactHigh are estimated percentage-point visibility-score lift, both integers, impactHigh > impactLow.`;

export async function generateFixes(brand: { name: string; domain: string }, answers: AnalyzedAnswer[]): Promise<GeneratedFix[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Claude fix generation is not configured. Add ANTHROPIC_API_KEY to .env.local.");

  const missed = answers.filter(a => !a.mentioned).slice(0, 5);
  const mentioned = answers.filter(a => a.mentioned).slice(0, 3);
  const evidence = [
    `Business: ${brand.name} (${brand.domain})`,
    missed.length ? `Prompts where ${brand.name} was NOT mentioned:\n${missed.map(a => `- "${a.prompt}" (${a.provider}): ${a.text.slice(0, 300)}`).join("\n")}` : "",
    mentioned.length ? `Prompts where ${brand.name} WAS mentioned:\n${mentioned.map(a => `- "${a.prompt}" (${a.provider}, position ${a.position ?? "unranked"}, sentiment ${a.sentiment}): ${a.text.slice(0, 200)}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n");

  const data = await postJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: FIX_MODEL, system: SYSTEM, max_tokens: 6000, messages: [{ role: "user", content: evidence }] })
  });

  const text: string = data.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") || "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Claude did not return parseable fix suggestions.");
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error("Claude's fix response was not a JSON array.");
  return parsed.map((f: any) => ({
    category: String(f.category || "content"),
    title: String(f.title || "Untitled fix"),
    rationale: String(f.rationale || ""),
    generatedContent: String(f.generatedContent || ""),
    impactLow: Number(f.impactLow) || 3,
    impactHigh: Math.max(Number(f.impactHigh) || 8, Number(f.impactLow) || 3)
  }));
}
