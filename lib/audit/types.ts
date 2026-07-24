export type ReviewSnippet = { rating: number; text: string; relativeTime: string };

export type AuditFinding = {
  category: "gbp" | "reviews";
  title: string;
  rationale: string;
  impactLow: number;
  impactHigh: number;
};

export type LocalAuditResult = {
  mode: "live";
  found: boolean;
  name: string;
  rating: number | null;
  reviewCount: number;
  reviews: ReviewSnippet[];
  businessStatus: string | null;
  hasWebsite: boolean;
  hasHours: boolean;
  photoCount: number;
  categories: string[];
  auditScore: number;
  findings: AuditFinding[];
  scannedAt: string;
};
