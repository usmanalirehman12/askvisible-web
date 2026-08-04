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
