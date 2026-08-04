// Minimal shape rather than importing app/app/page.tsx's ScanHistoryEntry: lib/ modules
// don't reach into app/, and every caller's history array already satisfies this
// structurally (extra fields like completedAt/mentions/total are ignored, not rejected).
export type ScoreHistoryEntry = { runId: string; score: number };

export type ScoreComparison = {
  current: number;
  previous: number | null;
  absoluteDelta: number | null;
  percentDelta: number | null;
  direction: "up" | "down" | "unchanged" | null;
  isBaseline: boolean;
};

// Baseline/delta math used to live inline at three call sites (Reports card list,
// ReportViewer header, Overview's ScoreHero), each recomputing the same thing slightly
// differently. This is the one place it happens now.
export function compareToPrevious(history: ScoreHistoryEntry[], runId: string): ScoreComparison {
  const idx = history.findIndex(h => h.runId === runId);
  if (idx < 0) return { current: 0, previous: null, absoluteDelta: null, percentDelta: null, direction: null, isBaseline: true };

  const current = history[idx];
  const previous = idx > 0 ? history[idx - 1] : null;
  if (!previous) return { current: current.score, previous: null, absoluteDelta: null, percentDelta: null, direction: null, isBaseline: true };

  const absoluteDelta = current.score - previous.score;
  const percentDelta = previous.score > 0 ? Math.round((absoluteDelta / previous.score) * 100) : 0;
  const direction = absoluteDelta > 0 ? "up" : absoluteDelta < 0 ? "down" : "unchanged";

  return { current: current.score, previous: previous.score, absoluteDelta, percentDelta, direction, isBaseline: false };
}
