import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { brandId, scan_frequency, scan_day } = body;

  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const validFrequencies = ["weekly", "monthly", "off"];
  if (scan_frequency && !validFrequencies.includes(scan_frequency))
    return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });

  const { error } = await supabase
    .from("brands")
    .update({ scan_frequency, scan_day })
    .eq("id", brandId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
