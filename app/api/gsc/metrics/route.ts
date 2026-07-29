import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

type TokenRow = { access_token: string; refresh_token: string | null; expires_at: string | null; property_url: string | null };

async function getAccessToken(token: TokenRow): Promise<string> {
  if (token.expires_at && new Date(token.expires_at) > new Date(Date.now() + 60_000)) {
    return token.access_token;
  }
  if (!token.refresh_token) return token.access_token;
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
  if (!res.ok) return token.access_token;
  const { access_token } = await res.json();
  return access_token || token.access_token;
}

async function gscQuery(siteUrl: string, accessToken: string, body: object) {
  const encoded = encodeURIComponent(siteUrl);
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: brand } = await supabase.from("brands").select("workspace_id, domain").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: tokenRow } = await supabase
    .from("gsc_tokens")
    .select("access_token, refresh_token, expires_at, property_url")
    .eq("workspace_id", brand.workspace_id)
    .maybeSingle();

  if (!tokenRow) return NextResponse.json({ connected: false });

  const accessToken = await getAccessToken(tokenRow as TokenRow);
  const propertyUrl = tokenRow.property_url || `https://${brand.domain}/`;

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 28 * 86_400_000).toISOString().split("T")[0];
  const base = { startDate, endDate };

  const [overviewData, queriesData, trendData] = await Promise.all([
    gscQuery(propertyUrl, accessToken, { ...base, dimensions: [], rowLimit: 1 }),
    gscQuery(propertyUrl, accessToken, { ...base, dimensions: ["query"], rowLimit: 25, orderBy: [{ fieldName: "impressions", sortOrder: "DESCENDING" }] }),
    gscQuery(propertyUrl, accessToken, { ...base, dimensions: ["date"], rowLimit: 28 }),
  ]);

  const row0 = overviewData?.rows?.[0];
  const overview = {
    impressions: Math.round(row0?.impressions ?? 0),
    clicks: Math.round(row0?.clicks ?? 0),
    ctr: Math.round((row0?.ctr ?? 0) * 1000) / 10,
    position: Math.round((row0?.position ?? 0) * 10) / 10,
  };

  const queries = (queriesData?.rows ?? []).map((r: any) => ({
    query: r.keys[0] as string,
    impressions: Math.round(r.impressions),
    clicks: Math.round(r.clicks),
    ctr: Math.round(r.ctr * 1000) / 10,
    position: Math.round(r.position * 10) / 10,
  }));

  const trend = (trendData?.rows ?? []).map((r: any) => ({
    date: r.keys[0] as string,
    impressions: Math.round(r.impressions),
    clicks: Math.round(r.clicks),
  }));

  return NextResponse.json({ connected: true, propertyUrl, overview, queries, trend });
}
