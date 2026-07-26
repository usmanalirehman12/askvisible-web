import { NextResponse } from "next/server";
import { runNamedProvider } from "@/lib/ai/providers";
import { analyzeMention } from "@/lib/ai/analyze";
import type { ProviderName } from "@/lib/ai/types";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { provider, prompt, brandName, brandDomain } = body;
    if (!provider || !prompt) return NextResponse.json({ error: "provider and prompt required." }, { status: 400 });

    let text = "";
    try {
      const answer = await runNamedProvider(provider as ProviderName, prompt);
      text = answer.text;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Provider failed.";
      console.error("[public-scan-prompt]", { provider, reason });
      return NextResponse.json({ skipped: true, provider, reason });
    }

    const analysis = analyzeMention(text, brandName || "", brandDomain || "");
    return NextResponse.json({
      provider,
      prompt,
      mentioned: analysis.mentioned,
      position: analysis.position,
      sentiment: analysis.sentiment,
      text: text.slice(0, 600)
    });
  } catch (err) {
    return NextResponse.json({ skipped: true, error: err instanceof Error ? err.message : "Failed." });
  }
}
