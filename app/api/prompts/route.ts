import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

// GET  ?brandId=X        — list active prompts for a brand
// POST {brandId, query}  — add a new prompt
// PATCH {promptId, query} — edit prompt text
// DELETE {promptId}      — deactivate prompt

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { data, error } = await supabase
      .from("prompts").select("*").eq("brand_id", brandId).eq("active", true).order("created_at", { ascending: true });
    if (error) return NextResponse.json({ prompts: [], rlsError: error.message });
    return NextResponse.json({ prompts: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { brandId, query } = await request.json().catch(() => ({}));
    if (!brandId || !query?.trim()) return NextResponse.json({ error: "brandId and query required" }, { status: 400 });

    const { data, error } = await supabase.from("prompts").insert({ brand_id: brandId, query: query.trim() }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prompt: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { promptId, query } = await request.json().catch(() => ({}));
    if (!promptId || !query?.trim()) return NextResponse.json({ error: "promptId and query required" }, { status: 400 });

    const { data, error } = await supabase.from("prompts").update({ query: query.trim() }).eq("id", promptId).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prompt: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { promptId } = await request.json().catch(() => ({}));
    if (!promptId) return NextResponse.json({ error: "promptId required" }, { status: 400 });

    const { error } = await supabase.from("prompts").update({ active: false }).eq("id", promptId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
