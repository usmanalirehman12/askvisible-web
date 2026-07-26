import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { score } from "@/lib/ai/scoring";

export const runtime = "nodejs";
export const maxDuration = 10;

function confidence(answers: { brand_mentioned: boolean; prompt_id: string }[], totalExpected: number) {
  if (!answers.length) return 0;
  const completeness = Math.min(1, answers.length / Math.max(1, totalExpected));
  const byPrompt = new Map<string, { brand_mentioned: boolean }[]>();
  for (const a of answers) {
    const list = byPrompt.get(a.prompt_id) ?? [];
    list.push(a);
    byPrompt.set(a.prompt_id, list);
  }
  let agreementSum = 0;
  for (const list of byPrompt.values()) {
    const m = list.filter(a => a.brand_mentioned).length;
    agreementSum += Math.max(m, list.length - m) / list.length;
  }
  const agreement = byPrompt.size ? agreementSum / byPrompt.size : 0;
  return Math.round((completeness * 0.5 + agreement * 0.5) * 100);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { scanRunId, totalExpected } = body;
    if (!scanRunId) return NextResponse.json({ error: "scanRunId required." }, { status: 400 });

    const { data: answers } = await supabase
      .from("answers")
      .select("brand_mentioned,position,sentiment,prompt_id")
      .eq("run_id", scanRunId);

    const rows = (answers || []) as { brand_mentioned: boolean; position: number | null; sentiment: string; prompt_id: string }[];
    const visibilityScore = score(rows.map(a => ({ mentioned: a.brand_mentioned, position: a.position, sentiment: a.sentiment })) as any);
    const conf = confidence(rows, totalExpected || rows.length);
    const mentions = rows.filter(a => a.brand_mentioned).length;

    await supabase.from("scan_runs").update({
      status: "complete",
      completed_at: new Date().toISOString(),
      confidence: conf
    }).eq("id", scanRunId);

    return NextResponse.json({ score: visibilityScore, confidence: conf, mentions, total: rows.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Finish failed." }, { status: 500 });
  }
}
