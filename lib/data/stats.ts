import type { SupabaseClient } from "@supabase/supabase-js";
import { score } from "@/lib/ai/scoring";
import { extractMentionSnippet } from "@/lib/ai/analyze";

// Shape of one entry in answers.competitor_mentions, written by /api/scan/prompt.
// Not exported: only ScanAnswerRow below refers to it. sentiment is optional because
// answers scanned before competitor sentiment was tracked have rows without it.
type CompetitorMentionRow = {
  id?: string;
  name: string;
  mentioned: boolean;
  position: number | null;
  sentiment?: "positive" | "neutral" | "negative" | "not-mentioned";
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
  sentimentCounts: { positive: number; neutral: number; negative: number };
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

  const rows = new Map<string, { mentions: number; positions: number[]; sentimentCounts: { positive: number; neutral: number; negative: number } }>();
  const bump = (name: string, mentioned: boolean, position: number | null, sentiment?: string) => {
    const row = rows.get(name) || { mentions: 0, positions: [], sentimentCounts: { positive: 0, neutral: 0, negative: 0 } };
    if (mentioned) {
      row.mentions++;
      if (position != null) row.positions.push(position);
      if (sentiment === "positive" || sentiment === "neutral" || sentiment === "negative") row.sentimentCounts[sentiment]++;
    }
    rows.set(name, row);
  };

  for (const answer of scan.answers) {
    bump(brandName, answer.brand_mentioned, answer.position, answer.sentiment);
    for (const competitor of answer.competitor_mentions || []) bump(competitor.name, competitor.mentioned, competitor.position, competitor.sentiment);
  }

  return [...rows.entries()]
    .map(([name, row]) => ({
      name,
      isBrand: name === brandName,
      mentions: row.mentions,
      total,
      share: Math.round((row.mentions / total) * 100),
      avgPosition: row.positions.length ? Math.round((row.positions.reduce((s, p) => s + p, 0) / row.positions.length) * 10) / 10 : null,
      sentimentCounts: row.sentimentCounts
    }))
    // Most-mentioned first; the brand wins ties so it never looks buried by a competitor
    // on equal footing. Alphabetical last so the order is stable between renders.
    .sort((a, b) => b.mentions - a.mentions || Number(b.isBrand) - Number(a.isBrand) || a.name.localeCompare(b.name));
}

export type CompetitiveGapRow = { promptQuery: string; engine: string; competitors: string[] };

// The actionable half of "missed prompts": not just "we weren't named here" but "here's
// specifically who was named instead." Reuses the same per-answer competitor_mentions data
// shareOfVoice already reads -- no new AI calls, no schema change. An answer that named
// nobody (competitor_mentions all unmentioned, or empty/predates tracking) isn't a gap,
// it's just a prompt nobody won -- excluded so this stays "opportunities to displace a
// named competitor," not a duplicate of the missed-prompts count.
export function competitiveGaps(scan: LatestScan): CompetitiveGapRow[] {
  const rows: CompetitiveGapRow[] = [];
  for (const answer of scan.answers) {
    if (answer.brand_mentioned) continue;
    const competitors = (answer.competitor_mentions || []).filter(c => c.mentioned).map(c => c.name);
    if (!competitors.length) continue;
    rows.push({ promptQuery: answer.prompts?.query || "—", engine: answer.engine, competitors });
  }
  return rows;
}

export type SentimentPhraseRow = { phrase: string; sentiment: "positive" | "negative"; count: number };

// "Common sentiment phrases": the actual sentence AI engines used around the brand mention,
// deduped and counted across a scan's answers -- the qualitative complement to the
// positive/neutral/negative sentiment score. Reuses raw_answer text that's already
// persisted per answer (no new AI calls, no schema change) via extractMentionSnippet's
// keyword-window matcher, the same one analyzeMention scores sentiment with. Neutral
// mentions are excluded -- a bucket of neutral sentences isn't the actionable signal here,
// a recurring "expensive" or "best-in-class" phrase is.
export function commonSentimentPhrases(answers: { text: string; brand_mentioned: boolean; sentiment: string }[], brandName: string, brandDomain: string): SentimentPhraseRow[] {
  const counts = new Map<string, { phrase: string; sentiment: "positive" | "negative"; count: number }>();
  for (const a of answers) {
    if (!a.brand_mentioned || (a.sentiment !== "positive" && a.sentiment !== "negative")) continue;
    const snippet = extractMentionSnippet(a.text, brandName, brandDomain);
    if (!snippet) continue;
    const key = snippet.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { phrase: snippet, sentiment: a.sentiment as "positive" | "negative", count: 1 });
  }
  // Most-repeated first; ties broken by the longer (more specific) phrase so a generic
  // fragment doesn't outrank a more informative one at equal count.
  return [...counts.values()].sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length);
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
