import type { SupabaseClient } from "@supabase/supabase-js";
import { score } from "@/lib/ai/scoring";
import type { EmailMessage } from "./send";

// Ten points is roughly "one prompt stopped mentioning you across every engine" — big
// enough that a person would want to know, small enough to catch a slide before it's a
// cliff. Scores move a few points between scans from ordinary model variance, so a lower
// threshold would train people to ignore the emails.
export const SCORE_DROP_THRESHOLD = 10;

export function shouldAlertOnDrop(previous: number | null, current: number, threshold: number = SCORE_DROP_THRESHOLD): boolean {
  // No previous scan means no trend — a brand's first result isn't a drop, however low.
  if (previous == null) return false;
  return previous - current >= threshold;
}

export function scoreDropEmail(options: {
  to: string;
  brandName: string;
  previous: number;
  current: number;
  mentions: number;
  total: number;
  appUrl?: string;
}): EmailMessage {
  const { to, brandName, previous, current, mentions, total, appUrl } = options;
  const drop = previous - current;
  const lines = [
    `${brandName}'s AI visibility score dropped ${drop} points, from ${previous} to ${current}.`,
    "",
    `It was mentioned in ${mentions} of ${total} answers in the latest scan.`,
    "",
    "A drop usually means an AI engine stopped naming the brand for prompts it used to answer, or started ranking it lower. The Prompts tab shows which ones changed, and AI Fixes has the recommendations generated from this scan.",
  ];
  if (appUrl) lines.push("", appUrl);

  return {
    to,
    // The number goes in the subject so it's triageable from a notification without
    // opening anything.
    subject: `${brandName}: AI visibility down ${drop} points (${previous} → ${current})`,
    text: lines.join("\n")
  };
}

// The score isn't stored on scan_runs — only confidence is — so it's recomputed from the
// answers of the run before this one. Two queries, on a cron, once per brand per day.
export async function getPreviousScore(supabase: SupabaseClient, brandId: string, excludeRunId: string): Promise<number | null> {
  const { data: previousAnswer } = await supabase
    .from("answers")
    .select("run_id, created_at, prompts!inner(brand_id)")
    .eq("prompts.brand_id", brandId)
    .neq("run_id", excludeRunId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!previousAnswer) return null;

  const { data: answers } = await supabase
    .from("answers")
    .select("brand_mentioned, position, sentiment")
    .eq("run_id", previousAnswer.run_id);
  if (!answers?.length) return null;

  return score(answers.map(a => ({ mentioned: a.brand_mentioned, position: a.position, sentiment: a.sentiment })) as never);
}
