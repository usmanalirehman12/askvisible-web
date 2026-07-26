"use client";
import { useState } from "react";
import { ArrowRight, Check, LoaderCircle, Sparkles, X, Zap } from "lucide-react";

type EngineResult = { provider: string; mentioned: boolean; position: number | null; sentiment: string; prompt: string; text: string };
type Fix = { category: string; title: string; rationale: string; generatedContent: string; impactLow: number; impactHigh: number };

const ENGINE_META: Record<string, { name: string; short: string; color: string }> = {
  openai:     { name: "ChatGPT",      short: "C", color: "#20201f" },
  gemini:     { name: "Gemini",       short: "◆", color: "#4583eb" },
  perplexity: { name: "Perplexity",   short: "P", color: "#1aa6a3" },
  anthropic:  { name: "Claude",       short: "C", color: "#d98345" },
  deepseek:   { name: "DeepSeek",     short: "D", color: "#b5121b" },
};

function publicScore(results: EngineResult[]) {
  if (!results.length) return 0;
  const m = results.filter(r => r.mentioned);
  const ms = m.length / results.length * 60;
  const ps = m.reduce((s, r) => s + (r.position ? Math.max(0, 6 - r.position) / 5 : 0.4), 0) / results.length * 25;
  const ss = m.reduce((s, r) => s + (r.sentiment === "positive" ? 1 : r.sentiment === "neutral" ? 0.55 : 0.1), 0) / results.length * 15;
  return Math.round(ms + ps + ss);
}

function scoreColor(s: number) { return s >= 60 ? "#10B981" : s >= 35 ? "#F59E0B" : "#EF4444"; }
function scoreLabel(s: number) { return s >= 60 ? "Strong visibility" : s >= 35 ? "Room to grow" : "Largely invisible"; }

function groupByEngine(results: EngineResult[]) {
  const map = new Map<string, EngineResult[]>();
  for (const r of results) { const list = map.get(r.provider) ?? []; list.push(r); map.set(r.provider, list); }
  return Array.from(map.entries()).map(([key, list]) => {
    const meta = ENGINE_META[key] || { name: key, short: key[0]?.toUpperCase() || "?", color: "#64748B" };
    const pct = Math.round(list.filter(r => r.mentioned).length / list.length * 100);
    return { key, ...meta, pct };
  });
}

export default function HomeChecker() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"form" | "scanning" | "results" | "fixing" | "fixed">("form");
  const [brand, setBrand] = useState("");
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<EngineResult[]>([]);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [error, setError] = useState("");

  function close() { setOpen(false); setTimeout(() => { setMode("form"); setResults([]); setFixes([]); setError(""); }, 300); }

  async function runScan(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMode("scanning");
    setProgress({ done: 0, total: 0 });

    try {
      const startRes = await fetch("/api/public-scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim(), domain: domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), category: category.trim() })
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "Failed to start scan.");

      const { tasks } = startData as { brand: string; domain: string; tasks: { provider: string; prompt: string }[] };
      setProgress({ done: 0, total: tasks.length });

      const gathered: EngineResult[] = [];
      const dom = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

      await Promise.all(tasks.map(async (task) => {
        try {
          const r = await fetch("/api/public-scan/prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: task.provider, prompt: task.prompt, brandName: brand.trim(), brandDomain: dom })
          });
          const d = await r.json().catch(() => ({}));
          if (!d.skipped) gathered.push(d as EngineResult);
        } catch {}
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }));

      setResults(gathered);
      setMode("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed. Please try again.");
      setMode("form");
    }
  }

  async function getFixes() {
    setMode("fixing");
    try {
      const res = await fetch("/api/quick-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim(), domain: domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), answers: results })
      });
      const data = await res.json();
      const fixList: Fix[] = data.fixes || [];
      setFixes(fixList);
      // Store for /review page
      try {
        sessionStorage.setItem("av-review", JSON.stringify({
          brand: brand.trim(),
          domain: domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
          score: publicScore(results),
          results,
          fixes: fixList
        }));
      } catch {}
      setMode("fixed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fix generation failed.");
      setMode("results");
    }
  }

  const score = mode === "results" || mode === "fixing" || mode === "fixed" ? publicScore(results) : 0;
  const engines = groupByEngine(results);

  return (
    <>
      <button className="checker-trigger" onClick={() => { setOpen(true); setMode("form"); }}>
        <Zap size={15} /> Check my AI visibility free
      </button>

      {open && (
        <div className="checker-overlay" onClick={e => e.target === e.currentTarget && close()}>
          <div className="checker-modal">
            <button className="checker-close" onClick={close}><X size={18} /></button>

            {/* FORM */}
            {mode === "form" && (
              <form onSubmit={runScan} className="checker-form">
                <div className="checker-head">
                  <span className="checker-icon"><Sparkles size={20} /></span>
                  <h2>See where AI mentions your brand</h2>
                  <p>We ask ChatGPT, Gemini, and Perplexity about your category — and show you exactly where you appear.</p>
                </div>
                {error && <div className="checker-error-msg">{error}</div>}
                <label>
                  Brand name
                  <input required value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Acme Software" autoFocus />
                </label>
                <label>
                  Website
                  <input required value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.com" />
                </label>
                <label>
                  What category are you in?
                  <input required value={category} onChange={e => setCategory(e.target.value)} placeholder='e.g. "project management tools"' />
                </label>
                <button type="submit" className="checker-btn">
                  Run free scan <ArrowRight size={15} />
                </button>
                <p className="checker-fine">No signup · No credit card · Results in ~15s</p>
              </form>
            )}

            {/* SCANNING */}
            {mode === "scanning" && (
              <div className="checker-scanning">
                <LoaderCircle className="spin checker-spin" size={40} />
                <h2>Scanning AI engines…</h2>
                <p>Asking ChatGPT, Gemini, and Perplexity about <strong>{category}</strong></p>
                {progress.total > 0 && (
                  <>
                    <div className="checker-progress-bar">
                      <div style={{ width: `${Math.round(progress.done / progress.total * 100)}%` }} />
                    </div>
                    <span className="checker-progress-label">{progress.done} / {progress.total} prompts complete</span>
                  </>
                )}
              </div>
            )}

            {/* RESULTS */}
            {(mode === "results" || mode === "fixing") && (
              <div className="checker-results">
                <div className="checker-score-row">
                  <div>
                    <span className="checker-score-label">AI Visibility Score</span>
                    <div className="checker-score-num" style={{ color: scoreColor(score) }}>{score}</div>
                    <span className="checker-score-sub">{scoreLabel(score)}</span>
                  </div>
                  <div className="checker-score-right">
                    <div className="checker-fix-cta">
                      <Sparkles size={14} />
                      <span>AI can write fixes to raise this score</span>
                    </div>
                  </div>
                </div>

                <div className="checker-engines">
                  {engines.map(e => (
                    <div key={e.key} className="checker-engine-row">
                      <span className="checker-dot" style={{ background: e.color }}>{e.short}</span>
                      <span className="checker-engine-name">{e.name}</span>
                      <div className="checker-engine-bar">
                        <div style={{ width: `${e.pct}%`, background: e.pct > 0 ? "#10B981" : "transparent" }} />
                      </div>
                      <span className={`checker-engine-pct ${e.pct > 0 ? "mentioned" : "missed"}`}>
                        {e.pct > 0 ? `${e.pct}% mentioned` : "Not mentioned"}
                      </span>
                    </div>
                  ))}
                </div>

                {mode === "fixing" ? (
                  <div className="checker-fixing-msg">
                    <LoaderCircle className="spin" size={16} /> Generating AI fixes…
                  </div>
                ) : (
                  <div className="checker-actions">
                    <button className="checker-btn" onClick={getFixes}>
                      <Sparkles size={14} /> Fix with AI — generate recommendations
                    </button>
                    <a className="checker-signup-link" href="/signup">Create free account <ArrowRight size={13} /></a>
                  </div>
                )}
              </div>
            )}

            {/* FIXES */}
            {mode === "fixed" && (
              <div className="checker-fixed">
                <div className="checker-score-compact">
                  <span>AI Visibility Score</span>
                  <strong style={{ color: scoreColor(score) }}>{score}</strong>
                  <span>·</span>
                  <span>{scoreLabel(score)}</span>
                </div>
                <h3 className="checker-fixes-title"><Sparkles size={15} /> AI-generated fixes for {brand}</h3>
                {fixes.length > 0 ? fixes.map((f, i) => (
                  <div key={i} className="checker-fix-card">
                    <div className="checker-fix-top">
                      <span className="checker-fix-category">{f.category}</span>
                      <span className="checker-fix-impact">+{f.impactLow}–{f.impactHigh}% lift</span>
                    </div>
                    <b>{f.title}</b>
                    <p>{f.rationale}</p>
                    <div className="checker-fix-content">
                      <span>Ready to use</span>
                      <pre>{f.generatedContent.slice(0, 300)}{f.generatedContent.length > 300 ? "…" : ""}</pre>
                    </div>
                  </div>
                )) : (
                  <p className="checker-no-fixes">Fix generation didn't return results. Try signing up for the full scan.</p>
                )}
                <div className="checker-cta-final">
                  <p>Sign up free to track your score weekly, get all fixes, and unlock competitor analysis.</p>
                  <a className="checker-btn" href="/signup">
                    <Check size={14} /> Start tracking free
                  </a>
                  <a className="checker-review-link" href={`/review?brand=${encodeURIComponent(brand)}&domain=${encodeURIComponent(domain.replace(/^https?:\/\//, "").replace(/\/$/, ""))}`}>
                    View full report <ArrowRight size={13} />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
