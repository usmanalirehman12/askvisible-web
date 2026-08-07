import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runNamedProvider } from "@/lib/ai/providers";
import { analyzeCompetitors, analyzeMention, extractUrls } from "@/lib/ai/analyze";
import type { CompetitorInput } from "@/lib/ai/analyze";
import type { ProviderName } from "@/lib/ai/types";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { scanRunId, provider, prompt, promptId, brandName, brandDomain, competitors } = body;
    if (!scanRunId || !provider || !prompt || !promptId) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    let answer;
    try {
      answer = await runNamedProvider(provider as ProviderName, prompt);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Provider failed or not configured.";
      console.error("[scan-prompt]", { provider, reason });
      return NextResponse.json({ skipped: true, provider, reason });
    }

    // The prompt is passed in so the analyzer can tell a real mention from the brand name
    // being echoed straight back out of the question — 1 in 5 generated prompts is literally
    // "alternatives to {brand}", so without this every scan booked phantom mentions.
    const analysis = analyzeMention(answer.text, brandName || "", brandDomain || "", [], prompt);
    const citations = extractUrls(answer.text);
    // Same answer text, same matcher — so "we were named, they weren't" is a real
    // comparison rather than two scans run against different questions.
    const competitorMentions = analyzeCompetitors(answer.text, Array.isArray(competitors) ? (competitors as CompetitorInput[]) : [], prompt);

    const { error: ansErr } = await supabase.from("answers").insert({
      run_id: scanRunId,
      prompt_id: promptId,
      engine: provider,
      raw_answer: answer.text,
      brand_mentioned: analysis.mentioned,
      position: analysis.position,
      sentiment: analysis.sentiment,
      cited_sources: citations,
      competitor_mentions: competitorMentions,
      tokens_in: answer.tokensIn,
      tokens_out: answer.tokensOut
    });
    if (ansErr) throw ansErr;

    return NextResponse.json({ mentioned: analysis.mentioned, position: analysis.position, provider });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Prompt failed.", skipped: true });
  }
}
