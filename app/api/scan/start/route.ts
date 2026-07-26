import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { configuredProviders } from "@/lib/ai/providers";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 10;

const globalState = globalThis as typeof globalThis & { askvisibleScanRateV2?: Map<string, number> };
const rate: Map<string, number> = (globalState.askvisibleScanRateV2 ||= new Map());
function allowed(key: string) {
  const last = rate.get(key);
  if (last && Date.now() - last < 5 * 60_000) return false;
  rate.set(key, Date.now());
  return true;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (!body.brandId) return NextResponse.json({ error: "brandId required." }, { status: 400 });

    if (!allowed(`${user.id}:${body.brandId}`)) {
      return NextResponse.json({ error: "Scanned recently. Try again in a few minutes." }, { status: 429 });
    }

    const { data: brand } = await supabase.from("brands").select("id,workspace_id,name,domain").eq("id", body.brandId).maybeSingle();
    if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });

    const { data: promptRows } = await supabase.from("prompts").select("id,query").eq("brand_id", body.brandId).eq("active", true);
    if (!promptRows?.length) return NextResponse.json({ error: "No prompts configured for this brand." }, { status: 400 });

    const providers = configuredProviders();
    if (!providers.length) return NextResponse.json({ error: "No AI providers configured." }, { status: 503 });

    const { data: run, error: runErr } = await supabase.from("scan_runs").insert({
      workspace_id: brand.workspace_id,
      status: "running",
      started_at: new Date().toISOString(),
      idempotency_key: randomUUID(),
      confidence: 0
    }).select("id").single();
    if (runErr) throw runErr;

    const tasks = providers.flatMap(p => promptRows.map(pr => ({
      provider: p.name,
      prompt: pr.query as string,
      promptId: pr.id as string
    })));

    return NextResponse.json({
      scanRunId: run.id,
      brand: { name: brand.name, domain: brand.domain },
      tasks
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to start scan." }, { status: 500 });
  }
}
