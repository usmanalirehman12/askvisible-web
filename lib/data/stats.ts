import type { SupabaseClient } from "@supabase/supabase-js";
import { score } from "@/lib/ai/scoring";

// Shape of one entry in answers.competitor_mentions, written by /api/scan/prompt.
// Not exported: only ScanAnswerRow below refers to it.
type CompetitorMentionRow = {
  id?: string;
  name: string;
  mentioned: boolean;
  position: number | null;
};

export type ScanAnswerRow = {
  id: string;
  engine: string;
  brand_mentioned: boolean;
  position: number | null;
  sentiment: "positive" | "neutral" | "negative" | "not-mentioned";
  prompt_id: string;
  prompts: { query: string } | null;
  competitor_mentions?: CompetitorMentionRow[] | null;
};

export type ShareOfVoiceRow = {
  name: string;
  isBrand: boolean;
  mentions: number;
  total: number;
  share: number;
  avgPosition: number | null;
};

export type LatestScan = {
  runId: string;
  confidence: number | null;
  completedAt: string | null;
  answers: ScanAnswerRow[];
};

// A scan_run has no direct brand_id (only workspace_id) — but in practice every run is
// brand-specific, since runAndSaveScan only ever scans one brand's own prompts at a time.
// Finding "the latest run for this brand" by walking backward through answers -> prompts ->
// brand_id is correct given that construction, without needing a schema change to add a
// direct brand_id column to scan_runs.
export async function getLatestScan(supabase: SupabaseClient, brandId: string): Promise<LatestScan | null> {
  const { data: latest } = await supabase
    .from("answers")
    .select("run_id, created_at, prompts!inner(brand_id)")
    .eq("prompts.brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return null;

  const [{ data: run }, { data: answers }] = await Promise.all([
    supabase.from("scan_runs").select("id,confidence,completed_at").eq("id", latest.run_id).maybeSingle(),
    supabase.from("answers").select("id,engine,brand_mentioned,position,sentiment,prompt_id,competitor_mentions,prompts(query)").eq("run_id", latest.run_id)
  ]);
  if (!run) return null;

  return { runId: run.id, confidence: run.confidence, completedAt: run.completed_at, answers: (answers as any) || [] };
}

// Share of voice across one scan: of the answers that named anybody we track, what
// fraction named each one. Denominator is the answer count, not the mention count, so the
// shares are "named in N% of answers" and deliberately don't sum to 100 — a single answer
// naming three brands counts for all three. Summing to 100 would require picking a winner
// per answer, which throws away the fact that being listed alongside a rival is the normal
// case and the interesting signal is who gets listed more often.
//
// Answers scanned before competitor tracking existed have an empty competitor_mentions,
// so they count toward the total without inflating anyone's mentions — an old scan reads
// as "brand only", which is what it was.
export function shareOfVoice(scan: LatestScan, brandName: string): ShareOfVoiceRow[] {
  const total = scan.answers.length;
  if (!total) return [];

  const rows = new Map<string, { mentions: number; positions: number[] }>();
  const bump = (name: string, mentioned: boolean, position: number | null) => {
    const row = rows.get(name) || { mentions: 0, positions: [] };
    if (mentioned) {
      row.mentions++;
      if (position != null) row.positions.push(position);
    }
    rows.set(name, row);
  };

  for (const answer of scan.answers) {
    bump(brandName, answer.brand_mentioned, answer.position);
    for (const competitor of answer.competitor_mentions || []) bump(competitor.name, competitor.mentioned, competitor.position);
  }

  return [...rows.entries()]
    .map(([name, row]) => ({
      name,
      isBrand: name === brandName,
      mentions: row.mentions,
      total,
      share: Math.round((row.mentions / total) * 100),
      avgPosition: row.positions.length ? Math.round((row.positions.reduce((s, p) => s + p, 0) / row.positions.length) * 10) / 10 : null
    }))
    // Most-mentioned first; the brand wins ties so it never looks buried by a competitor
    // on equal footing. Alphabetical last so the order is stable between renders.
    .sort((a, b) => b.mentions - a.mentions || Number(b.isBrand) - Number(a.isBrand) || a.name.localeCompare(b.name));
}

export function summarizeScan(scan: LatestScan) {
  const asAnalyzed = scan.answers.map(a => ({ mentioned: a.brand_mentioned, position: a.position, sentiment: a.sentiment })) as any;
  const mentioned = scan.answers.filter(a => a.brand_mentioned);
  const positions = mentioned.map(a => a.position).filter((p): p is number => p != null);
  return {
    score: score(asAnalyzed),
    confidence: scan.confidence ?? 0,
    mentions: mentioned.length,
    total: scan.answers.length,
    avgPosition: positions.length ? Math.round((positions.reduce((s, p) => s + p, 0) / positions.length) * 10) / 10 : null
  };
}
