// Onboarding checklist step-completion, derived from data the app already loads — no
// separate "onboarding progress" DB column or flag. Mirrors the codebase's existing stance
// on not persisting anything recomputable (see session_notes.md on why scan_runs has no
// stored `score` column): a brand/prompts/scan either exist or they don't, so there's
// nothing to get out of sync.
export type ChecklistStep = {
  id: "brand" | "prompts" | "scan" | "report";
  title: string;
  subtext: string;
  buttonLabel: string;
  doneLabel: string;
  done: boolean;
  targetSection: string;
};

export type ChecklistInput = {
  hasBrand: boolean;
  promptCount: number;
  scanCount: number;
};

export function computeChecklistSteps({ hasBrand, promptCount, scanCount }: ChecklistInput): ChecklistStep[] {
  return [
    {
      id: "brand",
      title: "Confirm your brand",
      subtext: "We scraped your homepage to set it up. Check the name and domain are right.",
      buttonLabel: "Review brand",
      doneLabel: "Brand confirmed",
      done: hasBrand,
      targetSection: "settings"
    },
    {
      id: "prompts",
      title: "Review your buyer-intent prompts",
      subtext: "We used Claude to generate prompts real buyers ask AI about your category. Keep the good ones, edit or delete the rest, or add your own.",
      buttonLabel: "Review prompts",
      doneLabel: "Prompts ready",
      done: hasBrand && promptCount > 0,
      targetSection: "prompts"
    },
    {
      id: "scan",
      title: "Run your first scan",
      subtext: "We'll ask all 6 engines — ChatGPT, Gemini, Perplexity, Claude, DeepSeek and Google AI Overviews — your prompts at once, then score every answer.",
      buttonLabel: "Run first scan",
      doneLabel: "First scan complete",
      done: scanCount > 0,
      targetSection: "overview"
    },
    {
      id: "report",
      title: "See your score & first fixes",
      subtext: "Your visibility score blends mentions (60%), position (25%) and sentiment (15%) across every engine. We'll also suggest fixes to improve it.",
      buttonLabel: "View my report",
      doneLabel: "You're all set",
      done: scanCount > 0,
      targetSection: "reports"
    }
  ];
}

export function checklistProgress(steps: ChecklistStep[]): { done: number; total: number; complete: boolean } {
  const done = steps.filter(s => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}

const NEW_ACCOUNT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// A real account-age signal for first-run guidance (per-tab tips), independent of any
// localStorage flag — a cleared cache or a new device shouldn't make an established account
// look brand-new again. Invalid/unparseable timestamps are treated as "not new" rather than
// throwing, since a malformed date is more likely a data issue than an actual new signup.
export function isNewAccount(workspaceCreatedAt: string, now: number = Date.now()): boolean {
  const createdAt = new Date(workspaceCreatedAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return now - createdAt < NEW_ACCOUNT_WINDOW_MS;
}
