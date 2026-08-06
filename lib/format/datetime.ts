// Single formatter for every timestamp shown in the app. Before this, each call site had
// its own toLocaleDateString options (three different variants for what was conceptually
// the same "scan date"), and none of them showed time-of-day — so two scans completed
// hours apart on the same day were indistinguishable in the UI.
export function formatTimestamp(iso: string | null | undefined, style: "date" | "datetime" = "date"): string {
  if (!iso) return "Unknown date";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "Invalid date";
  if (style === "datetime") return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// Used by Overview's trend-chart range picker (7/15/30 days) to decide which scan-history
// points fall inside the selected window. An unparseable/missing timestamp is treated as
// outside every window rather than throwing -- a malformed date shouldn't crash the chart.
export function isWithinDays(iso: string | null | undefined, days: number, now: number = Date.now()): boolean {
  if (!iso) return false;
  const date = new Date(iso).getTime();
  if (isNaN(date)) return false;
  return now - date <= days * 24 * 60 * 60 * 1000;
}
