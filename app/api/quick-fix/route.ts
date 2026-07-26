import { NextResponse } from "next/server";
import { generateFixes } from "@/lib/ai/fix-generator";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { brand, domain, answers } = body;
    if (!brand || !domain) return NextResponse.json({ error: "brand and domain required." }, { status: 400 });

    const mapped = (answers || []).map((a: any) => ({
      provider: a.provider || "openai",
      model: "",
      prompt: a.prompt || "",
      text: a.text || "",
      citations: [],
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      mentioned: Boolean(a.mentioned),
      position: a.position ?? null,
      sentiment: a.sentiment || "not-mentioned"
    }));

    const fixes = await generateFixes({ name: brand, domain }, mapped as any);
    return NextResponse.json({ fixes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fix generation failed.", fixes: [] }, { status: 500 });
  }
}
