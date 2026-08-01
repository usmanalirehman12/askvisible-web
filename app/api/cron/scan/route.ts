import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runAndSaveScan } from "@/lib/data/scans";
import { generateFixes, fixGeneratorConfigured } from "@/lib/ai/fix-generator";
import { saveFixes } from "@/lib/data/fixes";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { getPreviousScore, scoreDropEmail, shouldAlertOnDrop } from "@/lib/email/alerts";

// Node.js runtime — cron jobs need more than the 30s Edge cap.
// maxDuration requires Vercel Pro (300s). On Hobby it defaults to 10s,
// which only fits ~1 brand. Upgrade to Pro for multi-brand weekly scans.
export const runtime = "nodejs";
export const maxDuration = 300;

function shouldScanToday(brand: { scan_frequency?: string; scan_day?: number }): boolean {
  const freq = brand.scan_frequency ?? "weekly";
  if (freq === "off") return false;
  const now = new Date();
  if (freq === "monthly") return now.getUTCDate() === (brand.scan_day ?? 1);
  // weekly (default): scan_day 0=Sun … 6=Sat, default Monday=1
  return now.getUTCDay() === (brand.scan_day ?? 1);
}

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
    .select("id, name, domain, workspace_id, scan_frequency, scan_day");

  if (brandsErr) return NextResponse.json({ error: brandsErr.message }, { status: 500 });
  if (!brands?.length) return NextResponse.json({ ran: 0, results: [] });

  const results: { brand: string; score?: number; mentions?: number; fixes?: number; alerted?: boolean; skipped?: string; error?: string }[] = [];

  // Resolved once per run rather than per brand — most workspaces own several brands and
  // the owner lookup is the same every time.
  const ownerEmail = new Map<string, string | null>();
  async function emailForWorkspace(workspaceId: string): Promise<string | null> {
    if (ownerEmail.has(workspaceId)) return ownerEmail.get(workspaceId) ?? null;
    let email: string | null = null;
    try {
      const { data: workspace } = await supabase.from("workspaces").select("owner_id").eq("id", workspaceId).maybeSingle();
      // profiles has no email column, so the address lives in auth.users and needs the
      // admin API — which is why this route uses the service client.
      if (workspace?.owner_id) {
        const { data: owner } = await supabase.auth.admin.getUserById(workspace.owner_id);
        email = owner?.user?.email ?? null;
      }
    } catch (err) {
      console.error("[cron] owner lookup failed:", err instanceof Error ? err.message : err);
    }
    ownerEmail.set(workspaceId, email);
    return email;
  }

  for (const brand of brands) {
    if (!shouldScanToday(brand)) {
      results.push({ brand: brand.name, skipped: `not due (${brand.scan_frequency ?? "weekly"})` });
      continue;
    }
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

      // Alerting is best-effort and deliberately last: the scan and its fixes are already
      // saved by this point, so nothing here can cost us a completed scan.
      let alerted = false;
      if (emailConfigured()) {
        try {
          const previous = await getPreviousScore(supabase, brand.id, scan.scanRunId);
          if (shouldAlertOnDrop(previous, scan.score)) {
            const to = await emailForWorkspace(brand.workspace_id);
            if (to) {
              const result = await sendEmail(scoreDropEmail({
                to,
                brandName: brand.name,
                previous: previous as number,
                current: scan.score,
                mentions: scan.mentions,
                total: scan.total,
                appUrl: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/app` : undefined
              }));
              alerted = result.sent;
              if (result.error) console.error(`[cron] alert failed for ${brand.name}:`, result.error);
            }
          }
        } catch (alertErr) {
          console.error(`[cron] alerting failed for ${brand.name}:`, alertErr instanceof Error ? alertErr.message : alertErr);
        }
      }

      results.push({ brand: brand.name, score: scan.score, mentions: scan.mentions, fixes: fixesGenerated, alerted });
      console.log(`[cron] ${brand.name}: score=${scan.score} mentions=${scan.mentions}/${scan.total} fixes=${fixesGenerated} alerted=${alerted}`);
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
