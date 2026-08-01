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

export type WorkspaceContext = {
  fullName: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  plan: string;
  brands: Brand[];
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
