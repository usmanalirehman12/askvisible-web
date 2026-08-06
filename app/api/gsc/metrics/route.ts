import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DATE_RE, fetchGscTraffic } from "@/lib/gsc/metrics";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const range = searchParams.get("range") || "30d";
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  if (range === "custom" && (!startParam || !endParam || !DATE_RE.test(startParam) || !DATE_RE.test(endParam))) {
    return NextResponse.json({ error: "custom range requires start and end as YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: brand } = await supabase.from("brands").select("workspace_id, domain").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const traffic = await fetchGscTraffic(supabase, brand.workspace_id, brand.domain, range, startParam, endParam);
  if (traffic.connected && traffic.error) return NextResponse.json(traffic, { status: 502 });
  return NextResponse.json(traffic);
}
