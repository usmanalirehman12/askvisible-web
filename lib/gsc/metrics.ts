import type { SupabaseClient } from "@supabase/supabase-js";

type TokenRow = { access_token: string; refresh_token: string | null; expires_at: string | null; property_url: string | null };

async function getAccessToken(token: TokenRow): Promise<{ accessToken: string; refreshError: string | null }> {
  if (token.expires_at && new Date(token.expires_at) > new Date(Date.now() + 60_000)) return { accessToken: token.access_token, refreshError: null };
  if (!token.refresh_token) return { accessToken: token.access_token, refreshError: null };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: token.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return { accessToken: token.access_token, refreshError: `Token refresh failed (${res.status}): ${await res.text()}` };
  const { access_token } = await res.json();
  if (!access_token) return { accessToken: token.access_token, refreshError: "Token refresh returned no access_token" };
  return { accessToken: access_token, refreshError: null };
}

async function gscQuery(siteUrl: string, accessToken: string, body: object): Promise<{ data: any; error: null } | { data: null; error: string }> {
  const encoded = encodeURIComponent(siteUrl);
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return { data: null, error: `Search Console API error (${res.status}): ${await res.text()}` };
  return { data: await res.json(), error: null };
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// "7d"/"30d"/"90d" are relative to today; "custom" trusts the caller's start/end
// (validated by the caller) and sizes the trend row limit to the actual span instead of
// a hardcoded window, capped so a multi-year custom range can't ask Search Console for
// an unbounded number of rows.
function resolveGscRange(range: string, start: string | null, end: string | null) {
  const endDate = range === "custom" && end ? end : new Date().toISOString().split("T")[0];
  if (range === "custom" && start) {
    const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(start).getTime()) / 86_400_000) + 1);
    return { startDate: start, endDate, rowLimit: Math.min(days, 460) };
  }
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];
  return { startDate, endDate, rowLimit: days };
}

export type GscTraffic =
  | { connected: false }
  | { connected: true; propertyUrl: string; error: string }
  | {
      connected: true;
      propertyUrl: string;
      error?: undefined;
      overview: { impressions: number; clicks: number; ctr: number; position: number };
      queries: { query: string; impressions: number; clicks: number; ctr: number; position: number }[];
      trend: { date: string; impressions: number; clicks: number }[];
      range: { start: string; end: string };
      fetchedAt: string;
    };

// Shared by /api/gsc/metrics (the dashboard traffic tab) and /api/reports/[runId] (the
// embedded traffic section) so both hit Search Console the same way instead of the
// report route reimplementing the OAuth refresh + query logic a second time.
export async function fetchGscTraffic(supabase: SupabaseClient, workspaceId: string, domain: string, range: string, start: string | null, end: string | null): Promise<GscTraffic> {
  const { data: tokenRow } = await supabase
    .from("gsc_tokens")
    .select("access_token, refresh_token, expires_at, property_url")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!tokenRow) return { connected: false };

  const propertyUrl = tokenRow.property_url || `https://${domain}/`;
  const { accessToken, refreshError } = await getAccessToken(tokenRow as TokenRow);
  if (refreshError) return { connected: true, propertyUrl, error: refreshError };

  const { startDate, endDate, rowLimit } = resolveGscRange(range, start, end);
  const base = { startDate, endDate };

  const [overviewRes, queriesRes, trendRes] = await Promise.all([
    gscQuery(propertyUrl, accessToken, { ...base, dimensions: [], rowLimit: 1 }),
    gscQuery(propertyUrl, accessToken, { ...base, dimensions: ["query"], rowLimit: 25, orderBy: [{ fieldName: "impressions", sortOrder: "DESCENDING" }] }),
    gscQuery(propertyUrl, accessToken, { ...base, dimensions: ["date"], rowLimit }),
  ]);

  const firstError = overviewRes.error || queriesRes.error || trendRes.error;
  if (firstError) return { connected: true, propertyUrl, error: firstError };

  const row0 = overviewRes.data?.rows?.[0];
  return {
    connected: true,
    propertyUrl,
    overview: {
      impressions: Math.round(row0?.impressions ?? 0),
      clicks: Math.round(row0?.clicks ?? 0),
      ctr: Math.round((row0?.ctr ?? 0) * 1000) / 10,
      position: Math.round((row0?.position ?? 0) * 10) / 10,
    },
    queries: (queriesRes.data?.rows ?? []).map((r: any) => ({
      query: r.keys[0] as string, impressions: Math.round(r.impressions), clicks: Math.round(r.clicks),
      ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10,
    })),
    trend: (trendRes.data?.rows ?? []).map((r: any) => ({ date: r.keys[0] as string, impressions: Math.round(r.impressions), clicks: Math.round(r.clicks) })),
    range: { start: startDate, end: endDate },
    fetchedAt: new Date().toISOString(),
  };
}
