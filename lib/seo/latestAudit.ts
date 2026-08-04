import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckResult } from "./checks";

type IssueTrend = "fixed" | "broken" | "unchanged" | null;
type CheckWithTrend = CheckResult & { trend: IssueTrend };

// Auto-derived, no manual "mark resolved" workflow: comparing this check's status by id
// against the previous audit's is the entire status model. A check id that didn't exist
// in the previous audit (new PageSpeed data, or the check set changed) has no trend.
function trendFor(current: CheckResult, previous: CheckResult[] | null): IssueTrend {
  if (!previous) return null;
  const prev = previous.find(c => c.id === current.id);
  if (!prev) return null;
  if (prev.status === current.status) return "unchanged";
  return current.status === "pass" ? "fixed" : prev.status === "pass" ? "broken" : "unchanged";
}

export type LatestAudit = {
  audit: { id: string; domain: string; overallScore: number; createdAt: string; checks: CheckWithTrend[] } | null;
  previousAudit: { id: string; overallScore: number; createdAt: string } | null;
};

// Shared by /api/seo-audit/latest (the audit tab's Overview) and /api/reports/[runId]
// (the report's embedded audit section) so both compute the same fixed/broken/unchanged
// trend the same way.
export async function getLatestAuditWithTrend(supabase: SupabaseClient, brandId: string): Promise<LatestAudit> {
  const { data: audits } = await supabase
    .from("seo_audits")
    .select("id, domain, checks, overall_score, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(2);

  if (!audits?.length) return { audit: null, previousAudit: null };

  const [latest, previous] = audits;
  const previousChecks = (previous?.checks as CheckResult[] | undefined) ?? null;
  const checks = (latest.checks as CheckResult[]).map(c => ({ ...c, trend: trendFor(c, previousChecks) }));

  return {
    audit: { id: latest.id, domain: latest.domain, overallScore: latest.overall_score, createdAt: latest.created_at, checks },
    previousAudit: previous ? { id: previous.id, overallScore: previous.overall_score, createdAt: previous.created_at } : null,
  };
}
