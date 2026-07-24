export type ProviderName = "openai" | "gemini" | "perplexity" | "anthropic";

export type BrandProfile = {
  name: string;
  domain: string;
  url: string;
  title: string;
  description: string;
};

export type ProviderAnswer = {
  provider: ProviderName;
  model: string;
  prompt: string;
  text: string;
  citations: string[];
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
};

export type AnalyzedAnswer = ProviderAnswer & {
  mentioned: boolean;
  position: number | null;
  sentiment: "positive" | "neutral" | "negative" | "not-mentioned";
};

export type ProviderFailure = {
  provider: ProviderName;
  prompt: string;
  error: string;
};

export type VisibilityResult = {
  mode: "live";
  brand: BrandProfile;
  score: number;
  confidence: number;
  mentions: number;
  total: number;
  opportunities: number;
  prompts: string[];
  answers: AnalyzedAnswer[];
  failures: ProviderFailure[];
  providers: ProviderName[];
  scannedAt: string;
  summary: string;
};
