"use client";

export type TabDef = { id: string; label: string };

// Every tab bar in this app so far has been a hand-rolled button array with no ARIA
// roles. That was fine at 2-3 tabs; the SEO Audit section needs ~10, which is where
// keyboard nav and screen-reader semantics stop being optional. Visually this still
// reuses the existing .overview-tabs class so it doesn't look like a new component.
export default function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    (document.getElementById(`tab-${tabs[next].id}`) as HTMLButtonElement | null)?.focus();
  }

  return (
    <div className="overview-tabs" role="tablist">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={`tabpanel-${t.id}`}
          tabIndex={active === t.id ? 0 : -1}
          className={active === t.id ? "active" : ""}
          onClick={() => onChange(t.id)}
          onKeyDown={e => onKeyDown(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: string; children: React.ReactNode }) {
  if (id !== active) return null;
  return <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`}>{children}</div>;
}
