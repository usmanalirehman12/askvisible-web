import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAndSaveScan } from "@/lib/data/scans";
import { saveFixes } from "@/lib/data/fixes";
import { generateFixes, fixGeneratorConfigured } from "@/lib/ai/fix-generator";

export const runtime = "nodejs";
export const maxDuration = 60;

// Authenticated, not public — but still rate-limited per (user, brand), not just per IP,
// since a logged-in user re-clicking "Run scan" in a loop would otherwise burn real AI
// provider spend with no cost control. Same in-memory-Map pattern as the public checker;
// same caveat applies (doesn't survive multi-instance deploys — fine at this traffic level,
// revisit alongside the public checker's rate limiter if that ever gets rebuilt on Redis).
const globalState = globalThis as typeof globalThis & { askvisibleScanRate?: Map<string, number> };
const rate: Map<string, number> = (globalState.askvisibleScanRate ||= new Map<string, number>());
function allowed(key: string) {
  const last = rate.get(key);
  if (last && Date.now() - last < 5 * 60_000) return false;
  rate.set(key, Date.now());
  return true;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.brandId !== "string" || !body.brandId) return NextResponse.json({ error: "brandId is required." }, { status: 400 });

  if (!allowed(`${user.id}:${body.brandId}`)) {
    return NextResponse.json({ error: "This client was scanned recently. Try again in a few minutes." }, { status: 429 });
  }

  // RLS does the real authorization here: if this brand isn't in a workspace the user
  // belongs to, the select returns no row regardless of what brandId was requested.
  const { data: brand } = await supabase.from("brands").select("id,workspace_id,name,domain").eq("id", body.brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  try {
    const scan = await runAndSaveScan(supabase, brand.workspace_id, brand);
    console.log("[scan-providers]", { providers: [...new Set(scan.answers.map((a: any) => a.provider))], total: scan.answers.length });
    if (scan.failures?.length) console.warn("[scan-failures]", scan.failures);

    let fixesGenerated = 0;
    let fixesError: string | null = null;
    if (fixGeneratorConfigured()) {
      try {
        const generated = await generateFixes(scan.brand, scan.answers);
        const saved = await saveFixes(supabase, brand.id, generated);
        fixesGenerated = saved.length;
      } catch (error) {
        // Fix generation failing shouldn't hide a successful scan — report it, don't throw.
        fixesError = error instanceof Error ? error.message : (error as any)?.message || "Fix generation failed.";
        console.error("[fix-generation]", { fixesError, userId: user.id, brandId: body.brandId });
      }
    }

    return NextResponse.json({
      score: scan.score,
      confidence: scan.confidence,
      mentions: scan.mentions,
      total: scan.total,
      opportunities: scan.opportunities,
      fixesGenerated,
      fixesError,
      fixesConfigured: fixGeneratorConfigured()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    console.error("[dashboard-scan]", { message, userId: user.id, brandId: body.brandId });
    const status = /No AI providers/.test(message) ? 503 : /no tracked prompts/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
