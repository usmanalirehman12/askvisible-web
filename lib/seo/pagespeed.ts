import type { CheckResult } from "./checks";

// Google PageSpeed Insights (Lighthouse-as-a-service) — the only source of real
// Performance/Accessibility/Best-Practices data in this app; the regex checks in
// checks.ts can't measure any of that. Opt-in via PAGESPEED_API_KEY, same pattern as
// lib/ai/providers.ts's `if (process.env.X_API_KEY)` gating: unset key means this
// silently returns null rather than failing the audit that called it.
export type PageSpeedResult = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
};

function categoryScore(lighthouseResult: any, id: string): number | null {
  const score = lighthouseResult?.categories?.[id]?.score;
  return typeof score === "number" ? Math.round(score * 100) : null;
}

export async function runPageSpeedAudit(domain: string, strategy: "mobile" | "desktop" = "mobile"): Promise<PageSpeedResult | null> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) return null;

  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  const params = new URLSearchParams({ url, key: apiKey, strategy });
  for (const c of ["performance", "accessibility", "best-practices"]) params.append("category", c);

  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`, { signal: AbortSignal.timeout(18_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const lr = data?.lighthouseResult;
    const audits = lr?.audits || {};
    return {
      performance: categoryScore(lr, "performance"),
      accessibility: categoryScore(lr, "accessibility"),
      bestPractices: categoryScore(lr, "best-practices"),
      lcpMs: audits["largest-contentful-paint"]?.numericValue ?? null,
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      tbtMs: audits["total-blocking-time"]?.numericValue ?? null,
    };
  } catch {
    return null;
  }
}

function scoreStatus(score: number | null): CheckResult["status"] {
  if (score == null) return "warning";
  return score >= 90 ? "pass" : score >= 50 ? "warning" : "fail";
}

// Folds PageSpeed's result into the same CheckResult shape as the regex checks, so the
// Recommendations tab (sorted across every check by status) and the Overview counts
// don't need a special case for "checks that came from Google instead of a regex".
// There's no "Best Practices" tab in the requested layout, so that score rides along
// under "performance" as a secondary entry rather than being dropped.
export function pageSpeedToChecks(result: PageSpeedResult): CheckResult[] {
  const checks: CheckResult[] = [];
  if (result.performance != null) {
    checks.push({
      id: "pagespeed_performance", label: "Performance score", category: "performance",
      status: scoreStatus(result.performance), message: `${result.performance}/100 (Google PageSpeed, mobile)`,
      recommendation: result.performance < 90 ? "Reduce render-blocking resources, image sizes, and JavaScript execution time" : undefined,
    });
  }
  if (result.lcpMs != null) {
    const s = result.lcpMs < 2500 ? 90 : result.lcpMs < 4000 ? 70 : 30;
    checks.push({
      id: "pagespeed_lcp", label: "Largest Contentful Paint", category: "performance",
      status: scoreStatus(s), message: `${(result.lcpMs / 1000).toFixed(1)}s`,
      recommendation: s < 90 ? "Speed up the largest visible element — optimize images, preload key resources, reduce server response time" : undefined,
    });
  }
  if (result.cls != null) {
    const s = result.cls < 0.1 ? 90 : result.cls < 0.25 ? 70 : 30;
    checks.push({
      id: "pagespeed_cls", label: "Cumulative Layout Shift", category: "performance",
      status: scoreStatus(s), message: `${result.cls.toFixed(2)}`,
      recommendation: s < 90 ? "Reserve space for images/ads/embeds and avoid inserting content above existing content" : undefined,
    });
  }
  if (result.bestPractices != null) {
    checks.push({
      id: "pagespeed_best_practices", label: "Best practices score", category: "performance",
      status: scoreStatus(result.bestPractices), message: `${result.bestPractices}/100 (Google PageSpeed)`,
      recommendation: result.bestPractices < 90 ? "Check PageSpeed Insights directly for console errors, image aspect ratios, and browser API usage" : undefined,
    });
  }
  if (result.accessibility != null) {
    checks.push({
      id: "pagespeed_accessibility", label: "Accessibility score", category: "accessibility",
      status: scoreStatus(result.accessibility), message: `${result.accessibility}/100 (Google PageSpeed, mobile)`,
      recommendation: result.accessibility < 90 ? "Check PageSpeed Insights directly for contrast, ARIA, and labeling issues — this score is a summary, not a checklist" : undefined,
    });
  }
  return checks;
}
