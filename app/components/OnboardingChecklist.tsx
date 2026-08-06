"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { checklistProgress, computeChecklistSteps, type ChecklistInput } from "@/lib/onboarding/checklistState";

const DISMISS_KEY = "av-onboarding-dismissed";

// Persistent card on Overview, keyed to real objects (brand/prompts/scans) already loaded
// by the caller — nothing here is a separate source of truth. Only "dismissed" needs
// persisting, same av-* localStorage convention as av-theme/av-active-brand.
export default function OnboardingChecklist({ input, onNavigate, onRunScan, brandId }: { input: ChecklistInput; onNavigate: (section: string) => void; onRunScan: () => void; brandId?: string }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, [brandId]);

  const steps = computeChecklistSteps(input);
  const progress = checklistProgress(steps);

  if (dismissed || progress.complete) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <article className="panel" style={{ marginBottom: "14px", borderLeft: "4px solid var(--sky)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: "0 0 4px", font: "700 15px 'Outfit',system-ui", color: "var(--ink)" }}>Get your first AI visibility score</h3>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>{progress.done} of {progress.total} done</span>
        </div>
        <button onClick={dismiss} style={{ border: 0, background: "none", color: "var(--muted)", fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: "2px" }}>
          Skip setup — I&apos;ll explore on my own
        </button>
      </div>
      <div style={{ height: "6px", background: "var(--line)", borderRadius: "3px", marginBottom: "16px" }}>
        <div style={{ height: "100%", width: `${(progress.done / progress.total) * 100}%`, background: "var(--em)", borderRadius: "3px", transition: "width .2s" }} />
      </div>
      <div style={{ display: "grid", gap: "10px" }}>
        {steps.map(step => (
          <div key={step.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 12px", borderRadius: "8px", background: step.done ? "var(--soft)" : "transparent" }}>
            <span style={{
              width: "20px", height: "20px", minWidth: "20px", borderRadius: "50%", marginTop: "1px",
              display: "grid", placeItems: "center",
              background: step.done ? "var(--em)" : "var(--line)",
              color: step.done ? "#fff" : "var(--muted)"
            }}>
              {step.done && <Check size={13} />}
            </span>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: "13px", color: "var(--ink)" }}>{step.done ? `${step.doneLabel} ✓` : step.title}</b>
              {!step.done && <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>{step.subtext}</p>}
            </div>
            {!step.done && (
              <button className="button outline" style={{ fontSize: "11px", padding: "6px 12px", flexShrink: 0 }} onClick={() => step.id === "scan" ? onRunScan() : onNavigate(step.targetSection)}>
                {step.buttonLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
