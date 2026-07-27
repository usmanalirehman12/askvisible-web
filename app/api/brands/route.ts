import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateBuyerPrompts } from "@/lib/ai/buyer-prompts";

export const runtime = "edge";

const PROMPT_MODEL = process.env.ANTHROPIC_FIX_MODEL || "claude-haiku-4-5-20251001";

async function generatePromptsWithClaude(name: string, domain: string): Promise<string[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no key");

  const instruction = `Business name: ${name}\nWebsite: ${domain}\n\nGenerate 5 search queries a real buyer would type into ChatGPT, Perplexity, or Google when researching a product or service like this one. Rules:\n- Phrase them as natural buyer searches, not marketing copy\n- Cover different intents: discovery (best X for Y), comparison (X vs Y alternatives), and use-case (what should I use for Z)\n- For 4 of the 5, do NOT mention "${name}" by name — test whether the category surfaces it organically\n- 1 of the 5 should be "alternatives to ${name}" or "competitors to ${name}" to test direct brand consideration\n- Return ONLY a JSON array of 5 strings, no prose, no markdown\n\nExample format: ["query one","query two","query three","query four","query five"]`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: PROMPT_MODEL, max_tokens: 400, messages: [{ role: "user", content: instruction }] }),
    signal: AbortSignal.timeout(15_000)
  });

  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const d = await r.json();
  const text: string = d.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("") || "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("no JSON array in response");
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || parsed.length < 3) throw new Error("invalid array");
  return parsed.slice(0, 5).map((q: any) => String(q).trim()).filter(Boolean);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const { workspaceId, name, domain } = await request.json().catch(() => ({}));
    if (!workspaceId || !name || !domain) return NextResponse.json({ error: "workspaceId, name, and domain required." }, { status: 400 });

    // Insert brand
    const { data: brandData, error: brandErr } = await supabase
      .from("brands").insert({ workspace_id: workspaceId, name, domain }).select().single();
    if (brandErr) return NextResponse.json({ error: brandErr.message || "Database error inserting brand." }, { status: 500 });

    const brand = brandData as { id: string; workspace_id: string; name: string; domain: string; description: string | null; created_at: string };

    // Generate prompts — Claude preferred, template fallback
    let queries: string[];
    let promptSource: "claude" | "template" = "claude";
    try {
      queries = await generatePromptsWithClaude(name, domain);
    } catch {
      queries = generateBuyerPrompts({ name, title: "", description: "" });
      promptSource = "template";
    }

    // Save prompts
    const { error: promptErr } = await supabase
      .from("prompts").insert(queries.map(query => ({ brand_id: brand.id, query })));
    if (promptErr) console.error("[brands] prompt insert failed:", promptErr.message);

    return NextResponse.json({ brand, promptCount: queries.length, promptSource });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Brand creation failed." }, { status: 500 });
  }
}
