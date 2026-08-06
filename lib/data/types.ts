import type { ScanFrequency } from "./scan-schedule";

export type Brand = {
  id: string;
  workspace_id: string;
  name: string;
  domain: string;
  description: string | null;
  created_at: string;
  // Sourced from scan-schedule so the union can't drift from the validator that enforces it.
  scan_frequency?: ScanFrequency;
  scan_day?: number;
};

export type Competitor = {
  id: string;
  brand_id: string;
  name: string;
  domain: string | null;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  plan: string;
  role: string;
};

export type WorkspaceContext = {
  fullName: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  plan: string;
  // The caller's role in the active workspace, so the UI can hide actions it knows the
  // server would reject rather than showing a button that always errors.
  role: string;
  // Every workspace the user belongs to, for the switcher. Usually one.
  workspaces: WorkspaceSummary[];
  brands: Brand[];
  // Set by handle_new_user() at signup — a real account-age signal for first-run guidance,
  // independent of any localStorage flag (which resets on a cleared cache or new device).
  workspaceCreatedAt: string;
};

export type Prompt = {
  id: string;
  brand_id: string;
  query: string;
  engines: string[];
  frequency: "daily" | "weekly" | "manual";
  active: boolean;
  created_at: string;
};

export type Fix = {
  id: string;
  brand_id: string;
  answer_id: string | null;
  scan_run_id: string | null;
  category: string;
  title: string;
  rationale: string | null;
  generated_content: string | null;
  impact_low: number | null;
  impact_high: number | null;
  status: string;
  created_at: string;
};

// Not exported: nothing outside this file consumes it directly, it exists only as the
// base of ScanResultWithAnswers below.
type ScanSummary = {
  scanRunId: string;
  score: number;
  confidence: number;
  mentions: number;
  total: number;
  opportunities: number;
};

export type ScanResultWithAnswers = ScanSummary & {
  brand: { name: string; domain: string };
  answers: import("../ai/types").AnalyzedAnswer[];
};
