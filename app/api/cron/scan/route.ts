import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAndSaveScan } from "@/lib/data/scans";
import { generateFixes, fixGeneratorConfigured } from "@/lib/ai/fix-generator";
import { saveFixes } from "@/lib/data/fixes";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && token === secret);
}

type ScanOutcome = { brandId: string; brandName: string; status: "scanned" | "skipped" | "error"; error?: string };

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Admin client failed." }, { status: 503 });
  }

  const { data: brands, error: brandsErr } = await supabase
    .from("brands")
    .select("id, workspace_id, name, domain");

  if (brandsErr) return NextResponse.json({ error: brandsErr.message }, { status: 500 });
  if (!brands?.length) return NextResponse.json({ ran: 0, skipped: 0, errors: 0, results: [] });

  const now = Date.now();
  const outcomes: ScanOutcome[] = [];

  for (const brand of brands) {
    try {
      const { data: prompts } = await supabase
        .from("prompts")
        .select("id, frequency")
        .eq("brand_id", brand.id)
        .eq("active", true);

      if (!prompts?.length) {
        outcomes.push({ brandId: brand.id, brandName: brand.name, status: "skipped" });
        continue;
      }

      const hasDaily = prompts.some(p => p.frequency === "daily");
      const hasWeekly = prompts.some(p => p.frequency === "weekly");
      const thresholdHours = hasDaily ? 23 : hasWeekly ? 167 : null;

      if (thresholdHours === null) {
        // All prompts are manual — never auto-scan
        outcomes.push({ brandId: brand.id, brandName: brand.name, status: "skipped" });
        continue;
      }

      const promptIds = prompts.map(p => p.id as string);
      const { data: lastAnswer } = await supabase
        .from("answers")
        .select("created_at")
        .in("prompt_id", promptIds)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastScannedMs = lastAnswer?.created_at ? new Date(lastAnswer.created_at).getTime() : 0;
      const hoursSinceScan = (now - lastScannedMs) / (1000 * 60 * 60);

      if (hoursSinceScan < thresholdHours) {
        outcomes.push({ brandId: brand.id, brandName: brand.name, status: "skipped" });
        continue;
      }

      const scan = await runAndSaveScan(supabase, brand.workspace_id, brand);

      if (fixGeneratorConfigured()) {
        try {
          const generated = await generateFixes(scan.brand, scan.answers);
          await saveFixes(supabase, brand.id, generated);
        } catch (fixErr) {
          console.error("[cron-scan] fix generation failed", { brandId: brand.id, error: fixErr instanceof Error ? fixErr.message : fixErr });
        }
      }

      outcomes.push({ brandId: brand.id, brandName: brand.name, status: "scanned" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[cron-scan]", { brandId: brand.id, error: message });
      outcomes.push({ brandId: brand.id, brandName: brand.name, status: "error", error: message });
    }
  }

  return NextResponse.json({
    ran: outcomes.filter(o => o.status === "scanned").length,
    skipped: outcomes.filter(o => o.status === "skipped").length,
    errors: outcomes.filter(o => o.status === "error").length,
    results: outcomes
  });
}
