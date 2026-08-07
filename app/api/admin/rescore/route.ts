import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { planRescore, type RescoreRow } from "@/lib/data/rescore";

// Node runtime + long timeout, same as the cron route: this pages through the whole answers
// table. Guarded by CRON_SECRET because it rewrites historical scan data.
export const runtime = "nodejs";
export const maxDuration = 300;

// Recomputes brand_mentioned/position/sentiment on already-stored answers using the current
// analyzer, so history stops counting prompt-echoes and hallucinated brands as mentions.
//
// scan_runs has no `score` column — score is derived from answers at read time — so fixing
// these rows corrects every historical score automatically. Only scan_runs.confidence is a
// stored derivative, and that needs no second pass here: it's recomputed on the next scan.
//
// DRY RUN IS THE DEFAULT. Pass dryRun=0 to actually write.
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") !== "0";
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "200", 10) || 200, 1), 1000);
  const after = searchParams.get("after");
  const runId = searchParams.get("runId");

  const supabase = createServiceClient();
  let query = supabase
    .from("answers")
    .select("id, engine, raw_answer, brand_mentioned, position, sentiment, created_at, prompts(query, brands(name, domain))")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (after) query = query.gt("created_at", after);
  if (runId) query = query.eq("run_id", runId);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ dryRun, done: true, total: 0, nextCursor: null });

  const plan = planRescore(rows as unknown as RescoreRow[]);

  let written = 0;
  if (!dryRun) {
    for (const diff of plan.changed) {
      const { error: updateError } = await supabase
        .from("answers")
        .update({ brand_mentioned: diff.after.mentioned, position: diff.after.position, sentiment: diff.after.sentiment })
        .eq("id", diff.id);
      if (updateError) return NextResponse.json({ error: updateError.message, writtenBeforeFailure: written }, { status: 500 });
      written++;
    }
  }

  const last = rows[rows.length - 1] as any;
  return NextResponse.json({
    dryRun,
    total: plan.total,
    skipped: plan.skipped,
    unchanged: plan.unchanged,
    changed: plan.changed.length,
    written,
    mentionedTrueToFalse: plan.mentionedTrueToFalse,
    mentionedFalseToTrue: plan.mentionedFalseToTrue,
    byReason: plan.byReason,
    // Calibration sample: eyeball these before ever passing dryRun=0.
    sample: plan.changed.slice(0, 30),
    nextCursor: rows.length === limit ? last.created_at : null,
  });
}
