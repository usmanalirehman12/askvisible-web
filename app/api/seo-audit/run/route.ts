import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSeoChecks } from "@/lib/seo/checks";
import { runPageSpeedAudit, pageSpeedToChecks } from "@/lib/seo/pagespeed";

export const runtime = "edge";

// Same in-memory rate-limit pattern as /api/scan/route.ts, six-hour window instead of
// five minutes — PageSpeed Insights runs a full Lighthouse pass per call, expensive
// enough that re-running it on every tab click would be wasteful even for one user.
const globalState = globalThis as typeof globalThis & { askvisibleAuditRate?: Map<string, number> };
const rate: Map<string, number> = (globalState.askvisibleAuditRate ||= new Map<string, number>());
function allowed(key: string) {
  const last = rate.get(key);
  if (last && Date.now() - last < 6 * 60 * 60_000) return false;
  rate.set(key, Date.now());
  return true;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.brandId !== "string" || !body.brandId) return NextResponse.json({ error: "brandId is required." }, { status: 400 });

  // RLS does the real authorization: if this brand isn't in a workspace the user
  // belongs to, the select returns no row regardless of what brandId was requested.
  const { data: brand } = await supabase.from("brands").select("id, domain").eq("id", body.brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  if (!allowed(`${user.id}:${brand.id}`)) {
    return NextResponse.json({ error: "This site was audited recently. Try again in a few hours." }, { status: 429 });
  }

  const [{ checks: regexChecks, fetchError }, pageSpeed] = await Promise.all([
    runSeoChecks(brand.domain),
    runPageSpeedAudit(brand.domain),
  ]);

  const psChecks = pageSpeed ? pageSpeedToChecks(pageSpeed) : [];
  const checks = [...regexChecks, ...psChecks];
  const passed = checks.filter(c => c.status === "pass").length;
  const overallScore = Math.round((passed / Math.max(checks.length, 1)) * 100);

  const { data: inserted, error } = await supabase
    .from("seo_audits")
    .insert({ brand_id: brand.id, domain: brand.domain, checks, overall_score: overallScore })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: inserted.id,
    createdAt: inserted.created_at,
    domain: brand.domain,
    checks,
    overallScore,
    fetchError,
    pageSpeedAvailable: pageSpeed != null,
  });
}
