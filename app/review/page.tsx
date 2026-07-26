"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, LoaderCircle, Sparkles, X } from "lucide-react";

type EngineResult = { provider: string; mentioned: boolean; position: number | null; sentiment: string; prompt: string; text: string };
type Fix = { category: string; title: string; rationale: string; generatedContent: string; impactLow: number; impactHigh: number };
type ReviewData = { brand: string; domain: string; score: number; results: EngineResult[]; fixes: Fix[] };

const ENGINE_META: Record<string, { name: string; short: string; color: string }> = {
  openai:     { name: "ChatGPT",    short: "C", color: "#20201f" },
  gemini:     { name: "Gemini",     short: "◆", color: "#4583eb" },
  perplexity: { name: "Perplexity", short: "P", color: "#1aa6a3" },
  anthropic:  { name: "Claude",     short: "C", color: "#d98345" },
  deepseek:   { name: "DeepSeek",   short: "D", color: "#b5121b" },
};

function scoreColor(s: number) { return s >= 60 ? "#10B981" : s >= 35 ? "#F59E0B" : "#EF4444"; }
function scoreLabel(s: number) { return s >= 60 ? "Strong — you appear frequently" : s >= 35 ? "Growing — inconsistent coverage" : "Low — largely invisible to AI"; }

function groupByEngine(results: EngineResult[]) {
  const map = new Map<string, EngineResult[]>();
  for (const r of results) { const list = map.get(r.provider) ?? []; list.push(r); map.set(r.provider, list); }
  return Array.from(map.entries()).map(([key, list]) => {
    const meta = ENGINE_META[key] || { name: key, short: key[0]?.toUpperCase() || "?", color: "#64748B" };
    const pct = Math.round(list.filter(r => r.mentioned).length / list.length * 100);
    return { key, ...meta, pct };
  });
}

export default function ReviewPage() {
  const params = useSearchParams();
  const urlBrand = params.get("brand") || "";
  const urlDomain = params.get("domain") || "";

  const [data, setData] = useState<ReviewData | null>(null);
  const [generatingFixes, setGeneratingFixes] = useState(false);
  const [fixError, setFixError] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("av-review");
      if (raw) { setData(JSON.parse(raw)); return; }
    } catch {}
    // No session data — show empty state with brand from URL
    if (urlBrand && urlDomain) {
      setData({ brand: urlBrand, domain: urlDomain, score: 0, results: [], fixes: [] });
    }
  }, [urlBrand, urlDomain]);

  async function generateFixes() {
    if (!data) return;
    setGeneratingFixes(true);
    setFixError("");
    try {
      const res = await fetch("/api/quick-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: data.brand, domain: data.domain, answers: data.results })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fix generation failed.");
      const updated = { ...data, fixes: json.fixes || [] };
      setData(updated);
      try { sessionStorage.setItem("av-review", JSON.stringify(updated)); } catch {}
    } catch (err) {
      setFixError(err instanceof Error ? err.message : "Fix generation failed.");
    } finally {
      setGeneratingFixes(false);
    }
  }

  function copyFix(content: string, idx: number) {
    navigator.clipboard.writeText(content).then(() => { setCopied(idx); setTimeout(() => setCopied(null), 2000); });
  }

  if (!data) return (
    <main className="review-shell">
      <nav className="review-nav"><Link className="brand" href="/"><span className="brand-mark">a</span>askvisibleai</Link></nav>
      <div className="review-empty">
        <h1>No scan data found</h1>
        <p>Run a free scan from the homepage to see your AI visibility report.</p>
        <Link className="button" href="/">Back to homepage <ArrowRight size={15} /></Link>
      </div>
    </main>
  );

  const engines = groupByEngine(data.results);
  const mentions = data.results.filter(r => r.mentioned).length;

  return (
    <main className="review-shell">
      <nav className="review-nav">
        <Link className="brand" href="/"><span className="brand-mark">a</span>askvisibleai</Link>
        <Link className="button small" href="/signup">Start tracking free <ArrowRight size={14} /></Link>
      </nav>

      <div className="review-body">
        <div className="review-header">
          <span className="review-kicker">AI VISIBILITY REPORT</span>
          <h1>{data.brand}</h1>
          <p className="review-domain">{data.domain}</p>
        </div>

        <div className="review-grid">
          {/* Score card */}
          <article className="review-card score-card">
            <div className="review-score" style={{ color: scoreColor(data.score) }}>{data.score}</div>
            <div className="review-score-label">{scoreLabel(data.score)}</div>
            <div className="review-mentions">
              {mentions} of {data.results.length} AI answers mentioned your brand
            </div>
          </article>

          {/* Engine breakdown */}
          <article className="review-card engines-card">
            <h3>Visibility by engine</h3>
            {engines.length > 0 ? engines.map(e => (
              <div key={e.key} className="review-engine-row">
                <span className="review-dot" style={{ background: e.color }}>{e.short}</span>
                <span className="review-engine-name">{e.name}</span>
                <div className="review-engine-bar">
                  <div style={{ width: `${e.pct}%`, background: e.pct > 0 ? "#10B981" : "transparent" }} />
                </div>
                <span className={`review-engine-pct ${e.pct > 0 ? "ok" : "miss"}`}>
                  {e.pct > 0 ? `${e.pct}%` : "0%"}
                </span>
              </div>
            )) : <p className="review-no-data">No scan data. Run a free scan first.</p>}
          </article>
        </div>

        {/* Fixes section */}
        <section className="review-fixes">
          <div className="review-fixes-head">
            <div>
              <h2><Sparkles size={18} /> AI-generated fixes</h2>
              <p>Ready-to-use recommendations to raise your AI visibility score.</p>
            </div>
            {data.fixes.length === 0 && !generatingFixes && (
              <button className="button" onClick={generateFixes}>
                Generate AI fixes <Sparkles size={14} />
              </button>
            )}
          </div>

          {generatingFixes && (
            <div className="review-generating">
              <LoaderCircle className="spin" size={22} />
              <span>Analysing your scan results and writing fixes…</span>
            </div>
          )}

          {fixError && <div className="review-fix-error"><X size={14} /> {fixError}</div>}

          {data.fixes.length > 0 && (
            <div className="review-fix-list">
              {data.fixes.map((f, i) => (
                <article key={i} className="review-fix-card">
                  <div className="review-fix-meta">
                    <span className="review-fix-cat">{f.category}</span>
                    <span className="review-fix-impact">+{f.impactLow}–{f.impactHigh}% estimated lift</span>
                  </div>
                  <h4>{f.title}</h4>
                  <p>{f.rationale}</p>
                  <div className="review-fix-content">
                    <div className="review-fix-content-head">
                      <span>Ready-to-use fix</span>
                      <button className="review-copy-btn" onClick={() => copyFix(f.generatedContent, i)}>
                        {copied === i ? <><Check size={12} /> Copied</> : "Copy"}
                      </button>
                    </div>
                    <pre>{f.generatedContent}</pre>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Sign up CTA */}
        <section className="review-cta">
          <div className="review-cta-inner">
            <h2>Track this score every week</h2>
            <p>Sign up free to monitor all 6 AI engines, get new fixes automatically, and see how competitors rank in AI answers.</p>
            <div className="review-cta-actions">
              <Link className="button" href="/signup">Start free — no credit card <ArrowRight size={15} /></Link>
            </div>
            <div className="review-cta-checks">
              <span><Check size={13} /> 6 AI engines tracked</span>
              <span><Check size={13} /> Weekly scans</span>
              <span><Check size={13} /> AI fix generator</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
