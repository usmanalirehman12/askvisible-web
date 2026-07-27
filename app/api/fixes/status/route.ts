import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

const VALID_STATUSES = ["pending", "implementing", "done"];

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { fixId, status } = await request.json().catch(() => ({}));
    if (!fixId || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "fixId and status (pending|implementing|done) required" }, { status: 400 });
    }

    const { data, error } = await supabase.from("fixes").update({ status }).eq("id", fixId).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ fix: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
