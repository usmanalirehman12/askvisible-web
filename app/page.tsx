import Link from "next/link";
import { ArrowRight, Check, ChevronRight, LineChart, Radar, Sparkles, Zap } from "lucide-react";

const enginesStrip = [
  {name:"ChatGPT",    s:"C", cls:"e0"},
  {name:"Gemini",     s:"G", cls:"e1"},
  {name:"Perplexity", s:"P", cls:"e2"},
  {name:"Claude",     s:"C", cls:"e3"},
  {name:"DeepSeek",   s:"D", cls:"e4"},
  {name:"AI Overviews",s:"G",cls:"e5"},
];

const engineScores = [
  {s:"C", name:"ChatGPT",    pct:72, color:"#20201f"},
  {s:"G", name:"Gemini",     pct:64, color:"#4583eb"},
  {s:"P", name:"Perplexity", pct:58, color:"#1aa6a3"},
  {s:"C", name:"Claude",     pct:51, color:"#d98345"},
  {s:"D", name:"DeepSeek",   pct:48, color:"#b5121b"},
  {s:"G", name:"AI Overv.",  pct:61, color:"#4285F4"},
] as const;

export default function Home() {
  return <main className="landing">
    <nav className="topnav container">
      <Link className="brand" href="/"><span className="brand-mark">a</span>askvisibleai</Link>
      <div className="navlinks">
        <a href="#how">How it works</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
      </div>
      <div className="nav-actions">
        <Link className="text-link" href="/app">Sign in</Link>
        <Link className="button small" href="/app">Start free <ArrowRight size={15}/></Link>
      </div>
    </nav>

    <section className="hero container">
      <div className="eyebrow"><Sparkles size={14}/> AI search visibility, made actionable</div>
      <h1>When AI recommends a brand,<br/><em>make sure it's yours.</em></h1>
      <p className="hero-copy">Track how ChatGPT, Gemini, Perplexity, Claude, DeepSeek, and Google AI Overviews talk about your brand — and get AI-written fixes that move you into the answer.</p>
      <div className="hero-actions">
        <Link className="button" href="/app">Start tracking free <ArrowRight size={17}/></Link>
        <Link className="button ghost" href="/app">Explore live demo</Link>
      </div>
      <div className="trustline">
        <span><Check/>No credit card</span>
        <span><Check/>6 AI engines</span>
        <span><Check/>Set up in 2 min</span>
      </div>
      <div className="hero-visual">
        <div className="float-card float-left">
          <span className="float-icon green"><LineChart/></span>
          <div><strong>+18.4%</strong><small>Visibility this month</small></div>
        </div>
        <div className="dashboard-preview">
          <div className="preview-head">
            <div><span className="dot red"/><span className="dot yellow"/><span className="dot green-dot"/></div>
            <span>askvisibleai.app/dashboard</span>
            <span/>
          </div>
          <div className="preview-body">
            <div className="mini-side">
              <span className="mini-logo">a</span>
              {[1,2,3,4,5].map(i=><i key={i} className={i===1?"active":""}/>)}
            </div>
            <div className="preview-main">
              <div className="preview-title">
                <div><small>OVERVIEW</small><h3>Good morning, Maya</h3></div>
                <button>Run a scan</button>
              </div>
              <div className="metric-grid">
                <div><small>AI visibility</small><b>67%</b><span>↗ 8.2%</span></div>
                <div><small>Mentions</small><b>142</b><span>↗ 12</span></div>
                <div><small>Engines</small><b>6/6</b><span>tracked</span></div>
              </div>
              <div className="chart-card">
                <div className="chart-label"><b>AI engine scores</b><span>Latest scan</span></div>
                <div className="preview-engines">
                  {engineScores.map(({s,name,pct,color})=>(
                    <div key={name} className="prev-eng-row">
                      <b className="engine-dot" style={{background:color}}>{s}</b>
                      <span>{name}</span>
                      <div className="prev-eng-bar"><div style={{width:`${pct}%`,background:color}}/></div>
                      <strong>{pct}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="float-card float-right">
          <span className="float-icon purple"><Sparkles/></span>
          <div><strong>3 fixes ready</strong><small>FixEngine — high impact</small></div>
        </div>
      </div>
    </section>

    <section className="engine-strip">
      <p>Track your brand across every AI engine shaping buying decisions</p>
      <div>
        {enginesStrip.map(e=><span key={e.name}><b className={`engine-dot ${e.cls}`}>{e.s}</b>{e.name}</span>)}
      </div>
    </section>

    <section id="how" className="feature-section">
      <div className="container">
        <div className="section-heading left">
          <span className="kicker">FROM SIGNAL TO ACTION</span>
          <h2>Stop guessing what AI wants.</h2>
          <p>AskVisibleAI turns thousands of AI answers into a clear, prioritized growth plan — then writes the fixes.</p>
        </div>
        <div className="feature-grid">
          <article>
            <span className="feature-no">01</span>
            <div className="feature-icon"><Radar/></div>
            <h3>Monitor every answer</h3>
            <p>Track the prompts your buyers use across all 6 AI engines, automatically. Daily scans. Real responses.</p>
            <div className="mini-answers">
              {engineScores.map(({s,name,pct},i)=><span key={name}><i className={`e${i}`}>{s}</i>{name}<b>{pct}%</b></span>)}
            </div>
          </article>
          <article>
            <span className="feature-no">02</span>
            <div className="feature-icon"><LineChart/></div>
            <h3>Understand why you lose</h3>
            <p>Compare position, sentiment, citations, and competitor wins over time — across all 6 engines, not just one.</p>
            <div className="bars">
              <span><i style={{height:"55%"}}/><small>Jan</small></span>
              <span><i style={{height:"65%"}}/><small>Feb</small></span>
              <span><i style={{height:"48%"}}/><small>Mar</small></span>
              <span><i style={{height:"76%"}}/><small>Apr</small></span>
              <span><i style={{height:"90%"}}/><small>May</small></span>
            </div>
          </article>
          <article>
            <span className="feature-no">03</span>
            <div className="feature-icon"><Zap/></div>
            <h3>FixEngine writes the fix</h3>
            <p>Our AI fix generator produces ready-to-publish page rewrites, schema, citation targets, and content briefs — ranked by expected visibility lift.</p>
            <div className="fix-sample">
              <span><Sparkles/> FixEngine recommendation</span>
              <b>Add comparison evidence to /features</b>
              <p>Estimated visibility lift</p>
              <strong>+12–18%</strong>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section className="social-section">
      <div className="container">
        <p className="social-label">Trusted by marketing teams across</p>
        <div className="social-strip">
          <span className="social-logo">B2B SaaS</span>
          <span className="social-logo">E-commerce</span>
          <span className="social-logo">FinTech</span>
          <span className="social-logo">Healthcare</span>
          <span className="social-logo">Agency</span>
        </div>
        <div className="testimonial-grid">
          <div className="testimonial">
            <blockquote>"We replaced our monthly SEO audit process with AskVisibleAI. FixEngine alone saves us 4–5 hours per client per week — the fixes are ready to publish."</blockquote>
            <div className="testimonial-author">
              <span className="t-avatar">SK</span>
              <div><div className="t-name">Sarah K.</div><div className="t-role">Head of Digital, B2B Agency</div></div>
            </div>
          </div>
          <div className="testimonial">
            <blockquote>"Within 3 weeks we went from invisible to appearing in 6 of 10 ChatGPT responses for our core queries. The competitor breakdown showed us exactly why we were losing."</blockquote>
            <div className="testimonial-author">
              <span className="t-avatar">MT</span>
              <div><div className="t-name">Marcus T.</div><div className="t-role">VP Marketing, FinTech Startup</div></div>
            </div>
          </div>
          <div className="testimonial">
            <blockquote>"Every other tool shows you a score. AskVisibleAI is the only one that shows the score and then writes the fix. That's a completely different product."</blockquote>
            <div className="testimonial-author">
              <span className="t-avatar">PM</span>
              <div><div className="t-name">Priya M.</div><div className="t-role">CMO, E-commerce Brand</div></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="revenue-section">
      <div className="container">
        <div className="revenue-grid">
          <div>
            <span className="kicker">THE COST OF INVISIBILITY</span>
            <h2>Every AI query you're missing is a customer your competitor wins.</h2>
            <p className="revenue-p">800 million searches happen in AI engines every week. Brands invisible in those answers lose pipeline silently — no ranking drop to notice, no traffic alert to trigger.</p>
            <Link className="button" href="/app">See your visibility score <ArrowRight size={16}/></Link>
          </div>
          <div className="revenue-stats">
            <div className="rev-stat"><b>800M+</b><span>weekly AI searches across all platforms</span></div>
            <div className="rev-stat"><b>63%</b><span>of B2B buyers use AI for purchase research</span></div>
            <div className="rev-stat"><b>6×</b><span>more engines tracked than the average tool</span></div>
          </div>
        </div>
      </div>
    </section>

    <section id="pricing" className="pricing-section">
      <div className="container">
        <div className="section-heading">
          <span className="kicker">SIMPLE PRICING</span>
          <h2>Start free. Grow when you're ready.</h2>
          <p>Every paid plan includes all 6 AI engines, daily scans, and FixEngine.</p>
        </div>
        <div className="pricing-grid">
          <Price name="Free"    price="0"   desc="See where you stand"        features={["3 tracked prompts","Weekly scans","1 brand","Basic visibility score"]}/>
          <Price name="Starter" price="49"  desc="Build consistent visibility" features={["50 tracked prompts","Daily scans","1 brand","Alerts & trend history"]}/>
          <Price name="Pro"     price="99"  desc="Turn insights into growth"   popular features={["250 tracked prompts","Daily scans","FixEngine — AI fix generator","Competitor intelligence","PDF & CSV reports"]}/>
          <Price name="Agency"  price="249" desc="Scale across client brands"  features={["Multiple brands","White-label reports","Team seats","Priority support"]}/>
        </div>
      </div>
    </section>

    <section id="faq" className="faq-section">
      <div className="container">
        <div className="section-heading">
          <span className="kicker">FAQ</span>
          <h2>Common questions</h2>
        </div>
        <div className="faq-list">
          <details className="faq-item">
            <summary>What AI engines does AskVisibleAI track?</summary>
            <p>We monitor all 6 major AI platforms: ChatGPT, Gemini, Perplexity, Claude, DeepSeek, and Google AI Overviews. Each is scanned daily on paid plans and weekly on the free tier. You get a unified score plus per-engine breakdowns so you know exactly where you're winning and where you're not.</p>
          </details>
          <details className="faq-item">
            <summary>How is the AI Visibility Score calculated?</summary>
            <p>Your score (0–100) is the weighted average of mention rate, mention position, sentiment, and citation frequency across all 6 engines. A score above 70 means AI engines are regularly recommending you for relevant queries. The dashboard shows which engine is dragging your score down — and why.</p>
          </details>
          <details className="faq-item">
            <summary>How is this different from SEO tools like Semrush or Ahrefs?</summary>
            <p>SEO tools track Google search rankings. AskVisibleAI tracks AI answers — a completely different signal. When someone asks ChatGPT "best CRM for small business," that query never touches Google. We track the AI layer; traditional SEO tools track the search layer. You need both, but only one tool exists for the AI layer.</p>
          </details>
          <details className="faq-item">
            <summary>What is FixEngine and how does it work?</summary>
            <p>FixEngine is our AI-powered fix generator, available on Pro and Agency plans. After each scan, it analyzes where you're losing visibility and produces specific, ready-to-implement fixes: page rewrites, schema markup, citation targets, and content briefs — each ranked by expected visibility lift. It doesn't just show you what's wrong; it writes the solution.</p>
          </details>
          <details className="faq-item">
            <summary>Can I track what competitors are doing?</summary>
            <p>Yes. Pro and Agency plans include competitor tracking. You'll see which AI engines mention them, what prompts trigger their mentions, and specific recommendations to close the gap. Most users find the competitor view more actionable than their own score alone.</p>
          </details>
          <details className="faq-item">
            <summary>How quickly will I see results after making fixes?</summary>
            <p>AI engines update on their own timelines — typically 2–8 weeks for content changes to be reflected. AskVisibleAI scans daily so you'll see the delta as it happens. Users who implement FixEngine recommendations typically see measurable visibility improvements within 3–6 weeks.</p>
          </details>
        </div>
      </div>
    </section>

    <section className="cta">
      <div className="orb one"/><div className="orb two"/>
      <div className="container">
        <span className="kicker light">YOUR NEXT CUSTOMER IS ASKING AI</span>
        <h2>Be the brand it recommends.</h2>
        <p>Start tracking today. Know exactly where you appear across every major AI engine.</p>
        <Link className="button white" href="/app">Start tracking for free <ArrowRight/></Link>
        <small>No credit card required · Set up in 2 minutes · 6 AI engines</small>
      </div>
    </section>

    <footer className="footer container">
      <Link className="brand" href="/"><span className="brand-mark">a</span>askvisibleai</Link>
      <p>Own the answer.</p>
      <div>
        <a href="#how">Product</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
        <a href="#faq">Privacy</a>
        <a href="#faq">Terms</a>
      </div>
      <small>© 2026 AskVisibleAI</small>
    </footer>
  </main>;
}

function Price({name,price,desc,features,popular}:{name:string;price:string;desc:string;features:string[];popular?:boolean}) {
  return <article className={`price-card ${popular?"popular":""}`}>
    {popular&&<span className="popular-label">MOST POPULAR</span>}
    <h3>{name}</h3>
    <p>{desc}</p>
    <div className="price"><sup>$</sup><b>{price}</b><span>{price!=="0"&&"/mo"}</span></div>
    <Link href="/app" className={`button ${popular?"":"outline"}`}>{price==="0"?"Start free":"Choose "+name}<ChevronRight/></Link>
    <ul>{features.map(f=><li key={f}><Check/>{f}</li>)}</ul>
  </article>;
}
