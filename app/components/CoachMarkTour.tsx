"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SEEN_KEY = "av-has-seen-tour";

type Step = { anchorSelector: string; title: string; body: string };

const STEPS: Step[] = [
  { anchorSelector: ".brand-switch", title: "This is your brand", body: "Manage multiple brands? Switch between them here — each has its own prompts and scores." },
  { anchorSelector: ".scan-btn", title: "Start here", body: "One click asks all 6 engines your prompts and scores every answer." },
  { anchorSelector: "[data-tour=score-hero]", title: "Your results land here", body: "Your blended visibility score, engine breakdown, competitor share-of-voice, and fixes to improve." }
];

// Fires once for a real new user (demo visitors haven't signed up yet, so they aren't
// tour-gated before the "aha" moment). Positions against existing stable DOM anchors —
// no new refs needed on the elements it points at, except score-hero which gets one
// data-tour attribute since it's a plain <div>, not a class-bearing component.
export default function CoachMarkTour({ demo, active }: { demo: boolean; active: boolean }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (demo || !active) return;
    if (localStorage.getItem(SEEN_KEY) === "1") return;
    setVisible(true);
  }, [demo, active]);

  useEffect(() => {
    if (!visible) return;
    const el = document.querySelector(STEPS[step].anchorSelector);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [visible, step]);

  if (!visible || typeof document === "undefined") return null;

  function finish() {
    localStorage.setItem(SEEN_KEY, "1");
    setVisible(false);
  }
  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else finish();
  }

  const current = STEPS[step];
  const top = rect ? rect.bottom + 12 : 100;
  const left = rect ? Math.min(rect.left, window.innerWidth - 320) : 100;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 90, pointerEvents: "none" }}>
      {rect && (
        <div style={{
          position: "fixed", top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12,
          borderRadius: "10px", boxShadow: "0 0 0 4px var(--sky), 0 0 0 2000px rgba(15,23,42,.55)",
          pointerEvents: "none", transition: "all .15s"
        }} />
      )}
      <div style={{
        position: "fixed", top, left, maxWidth: "300px",
        background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "10px",
        padding: "16px 18px", boxShadow: "0 10px 30px rgba(15,23,42,.25)", pointerEvents: "auto"
      }}>
        <b style={{ fontSize: "13px", color: "var(--ink)" }}>{current.title}</b>
        <p style={{ margin: "6px 0 14px", fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>{current.body}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={finish} style={{ border: 0, background: "none", color: "var(--muted)", fontSize: "11px", cursor: "pointer" }}>Skip tour</button>
          <button className="button" style={{ fontSize: "11px", padding: "6px 14px" }} onClick={next}>{step < STEPS.length - 1 ? "Next" : "Got it"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
