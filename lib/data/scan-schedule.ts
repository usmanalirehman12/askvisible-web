const SCAN_FREQUENCIES = ["weekly", "monthly", "off"] as const;
export type ScanFrequency = (typeof SCAN_FREQUENCIES)[number];

export function isScanFrequency(value: unknown): value is ScanFrequency {
  return typeof value === "string" && (SCAN_FREQUENCIES as readonly string[]).includes(value);
}

// One column serves both modes: day-of-week 0-6 when weekly, day-of-month 1-31 when
// monthly. The database check is deliberately permissive (0-31) because it can't know
// which mode a row is in without a conditional constraint that would reject existing
// rows. This is where the real rule lives, so a bad value comes back as a 400 instead of
// a Postgres constraint violation surfacing as a 500.
//
// Returns an error message, or null when the pair is valid. Both arguments are optional
// because PATCH bodies are partial — an absent field means "leave it alone".
export function validateSchedule(frequency: unknown, day: unknown): string | null {
  if (frequency !== undefined && !isScanFrequency(frequency)) return "Invalid frequency";
  if (day === undefined) return null;
  if (typeof day !== "number" || !Number.isInteger(day)) return "Scan day must be a whole number";

  // An absent frequency on a partial update means the stored one applies. Weekly is the
  // column default, so validating against the wider weekly-or-monthly range is the only
  // safe choice — rejecting 15 here would block a legitimate monthly brand.
  if (frequency === "weekly") return day >= 0 && day <= 6 ? null : "Weekly scans use a day of the week (0 = Sunday … 6 = Saturday)";
  if (frequency === "monthly") return day >= 1 && day <= 31 ? null : "Monthly scans use a day of the month (1-31)";
  return day >= 0 && day <= 31 ? null : "Scan day must be between 0 and 31";
}
