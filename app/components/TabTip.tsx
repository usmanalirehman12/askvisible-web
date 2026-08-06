"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Lightweight, dismissible first-visit tip for a tab -- unlike CoachMarkTour (a full-screen
// spotlight overlay confined to Overview), this is an inline banner that doesn't block
// interaction with the page underneath. Only shown to accounts inside the new-account window
// (see lib/onboarding/checklistState.ts's isNewAccount) that haven't dismissed this specific
// tab's tip yet -- dismissal is per tab, so closing Prompts' tip doesn't hide Answers'.
export default function TabTip({ tabId, text, newUser }: { tabId: string; text: string; newUser: boolean }) {
  const key = `av-tab-tip-seen-${tabId}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(key) === "1");
  }, [key]);

  if (!newUser || dismissed) return null;

  function dismiss() {
    localStorage.setItem(key, "1");
    setDismissed(true);
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      padding: "12px 16px", marginBottom: "14px",
      background: "var(--sky-d)", border: "1px solid var(--sky)", borderRadius: "8px"
    }}>
      <p style={{ margin: 0, flex: 1, fontSize: "12px", color: "var(--ink)", lineHeight: 1.6 }}>{text}</p>
      <button onClick={dismiss} aria-label="Dismiss tip" style={{ border: 0, background: "none", color: "var(--sky)", cursor: "pointer", padding: "2px", flexShrink: 0 }}>
        <X size={15} />
      </button>
    </div>
  );
}
