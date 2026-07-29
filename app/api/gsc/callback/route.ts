import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const origin = new URL(request.url).origin;

  if (errorParam) {
    return NextResponse.redirect(`${origin}/app?gsc_error=${encodeURIComponent(errorParam)}`);
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("gsc_state")?.value;

  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${origin}/app?gsc_error=invalid_state`);
  }

  const brandId = state.split(":")[0];
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${origin}/api/gsc/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: code!,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/app?gsc_error=token_exchange_failed`);
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json();
  const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/app?gsc_error=unauthorized`);

  const { data: brand } = await supabase
    .from("brands")
    .select("workspace_id, domain")
    .eq("id", brandId)
    .maybeSingle();

  if (!brand) return NextResponse.redirect(`${origin}/app?gsc_error=brand_not_found`);

  // Auto-match the GSC property to the brand's domain
  let propertyUrl = `https://${brand.domain}/`;
  const sitesRes = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (sitesRes.ok) {
    const { siteEntry = [] } = await sitesRes.json() as { siteEntry?: { siteUrl: string }[] };
    const match =
      siteEntry.find(s => s.siteUrl === `sc-domain:${brand.domain}`) ||
      siteEntry.find(s => s.siteUrl === `https://${brand.domain}/`) ||
      siteEntry.find(s => s.siteUrl === `http://${brand.domain}/`) ||
      siteEntry[0];
    if (match) propertyUrl = match.siteUrl;
  }

  await supabase.from("gsc_tokens").upsert(
    { workspace_id: brand.workspace_id, access_token, refresh_token, expires_at, property_url: propertyUrl },
    { onConflict: "workspace_id" }
  );

  const response = NextResponse.redirect(`${origin}/app?gsc_connected=1`);
  response.cookies.delete("gsc_state");
  return response;
}
