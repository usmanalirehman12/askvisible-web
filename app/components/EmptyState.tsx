"use client";
import type { LucideIcon } from "lucide-react";

// Standardizes the icon+heading+subtext+CTA pattern already used by Fixes ("No fixes yet")
// and Reports ("No reports yet") — this component doesn't invent new markup, it just makes
// that pattern reusable so Prompts/Competitors/Overview stop falling back to a bare <p>.
export default function EmptyState({
  icon: Icon,
  headline,
  subtext,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary
}: {
  icon: LucideIcon;
  headline: string;
  subtext: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="panel" style={{ padding: "40px 32px", textAlign: "center" }}>
      <Icon style={{ width: "32px", color: "var(--faint)", marginBottom: "12px" }} />
      <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--ink)" }}>{headline}</p>
      <p style={{ margin: "0 0 " + (onPrimary || onSecondary ? "18px" : "0"), fontSize: "13px", color: "var(--muted)", maxWidth: "420px", marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>{subtext}</p>
      {(onPrimary || onSecondary) && (
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          {onPrimary && primaryLabel && <button className="button" style={{ fontSize: "12px", padding: "9px 16px" }} onClick={onPrimary}>{primaryLabel}</button>}
          {onSecondary && secondaryLabel && <button className="button outline" style={{ fontSize: "12px", padding: "9px 16px" }} onClick={onSecondary}>{secondaryLabel}</button>}
        </div>
      )}
    </div>
  );
}
