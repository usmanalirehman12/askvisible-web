import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runAndSaveScan } from "@/lib/data/scans";
import { generateFixes, fixGeneratorConfigured } from "@/lib/ai/fix-generator";
import { saveFixes } from "@/lib/data/fixes";

// Node.js runtime — cron jobs need more than the 30s Edge cap.
// maxDuration requires Vercel Pro (300s). On Hobby it defaults to 10s,
// which only fits ~1 brand. Upgrade to Pro for multi-brand weekly scans.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  // Vercel sends Authorization: Bearer <CRON_SECRET> on scheduled invocations.
  // Manual test calls must include the same header.
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: brands, error: brandsErr } = await supabase
    .from("brands")
    .select("id, name, domain, workspace_id");

  if (brandsErr) return NextResponse.json({ error: brandsErr.message }, { status: 500 });
  if (!brands?.length) return NextResponse.json({ ran: 0, results: [] });

  const results: { brand: string; score?: number; mentions?: number; fixes?: number; skipped?: string; error?: string }[] = [];

  for (const brand of brands) {
    try {
      const scan = await runAndSaveScan(supabase, brand.workspace_id, brand);

      let fixesGenerated = 0;
      if (fixGeneratorConfigured()) {
        try {
          const fixes = await generateFixes(
            { name: brand.name, domain: brand.domain },
            scan.answers as any
          );
          const saved = await saveFixes(supabase, brand.id, fixes);
          fixesGenerated = saved.length;
        } catch (fixErr) {
          console.error(`[cron] fix generation failed for ${brand.name}:`, fixErr instanceof Error ? fixErr.message : fixErr);
        }
      }

      results.push({ brand: brand.name, score: scan.score, mentions: scan.mentions, fixes: fixesGenerated });
      console.log(`[cron] ${brand.name}: score=${scan.score} mentions=${scan.mentions}/${scan.total} fixes=${fixesGenerated}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      results.push({ brand: brand.name, error: msg });
      console.error(`[cron] ${brand.name} failed:`, msg);
    }
  }

  return NextResponse.json({
    ran: results.length,
    ok: results.filter(r => !r.error && !r.skipped).length,
    failed: results.filter(r => r.error).length,
    results,
  });
}
