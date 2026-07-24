import Link from "next/link";
import { ArrowRight, Check, ChevronRight, LineChart, Radar, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Checker } from "@/components/checker";

const engines = ["ChatGPT", "Gemini", "Perplexity", "Claude"];

export default function Home() {
  return <main className="landing">
    <nav className="topnav container">
      <Link className="brand" href="/"><span className="brand-mark">a</span>askvisible</Link>
      <div className="navlinks"><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></div>
      <div className="nav-actions"><Link className="text-link" href="/app">Sign in</Link><Link className="button small" href="/app">Start free <ArrowRight size={15}/></Link></div>
    </nav>

    <section className="hero container">
      <div className="eyebrow"><Sparkles size={14}/> AI search visibility, made actionable</div>
      <h1>When AI recommends a brand,<br/><em>make sure it’s yours.</em></h1>
      <p className="hero-copy">See exactly how ChatGPT, Gemini, Perplexity, and Claude talk about your brand—and get the fixes that move you into the answer.</p>
      <div className="hero-actions"><a className="button" href="#checker">Check my visibility <ArrowRight size={17}/></a><Link className="button ghost" href="/app">Explore live demo</Link></div>
      <div className="trustline"><span><Check/>No credit card</span><span><Check/>Results in 60 seconds</span><span><Check/>3 prompts free</span></div>
      <div className="hero-visual">
        <div className="float-card float-left"><span className="float-icon green"><LineChart/></span><div><strong>+18.4%</strong><small>Visibility this month</small></div></div>
        <div className="dashboard-preview">
          <div className="preview-head"><div><span className="dot red"/><span className="dot yellow"/><span className="dot green-dot"/></div><span>askvisible.app/dashboard</span><span/></div>
          <div className="preview-body">
            <div className="mini-side"><span className="mini-logo">a</span>{[1,2,3,4,5].map(i=><i key={i} className={i===1?"active":""}/>)}</div>
            <div className="preview-main"><div className="preview-title"><div><small>OVERVIEW</small><h3>Good morning, Maya</h3></div><button>Run a scan</button></div>
              <div className="metric-grid"><div><small>AI visibility</small><b>67%</b><span>↗ 8.2%</span></div><div><small>Mentions</small><b>142</b><span>↗ 12</span></div><div><small>Avg. position</small><b>2.4</b><span>↗ 0.3</span></div></div>
              <div className="chart-card"><div className="chart-label"><b>Visibility trend</b><span>Last 30 days</span></div><svg viewBox="0 0 700 180" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d5ce8" stopOpacity=".3"/><stop offset="100%" stopColor="#6d5ce8" stopOpacity="0"/></linearGradient></defs><path className="area" d="M0,145 C50,138 70,120 110,128 S180,90 225,105 S310,70 350,80 S430,35 480,58 S560,50 610,25 S670,30 700,12 L700,180 L0,180Z"/><path className="line" d="M0,145 C50,138 70,120 110,128 S180,90 225,105 S310,70 350,80 S430,35 480,58 S560,50 610,25 S670,30 700,12"/></svg></div>
            </div>
          </div>
        </div>
        <div className="float-card float-right"><span className="float-icon purple"><Sparkles/></span><div><strong>3 fixes ready</strong><small>High-impact opportunities</small></div></div>
      </div>
    </section>

    <section className="engine-strip"><p>Track your brand across the answers that shape buying decisions</p><div>{engines.map((e,i)=><span key={e}><b className={`engine-dot e${i}`}>{e[0]}</b>{e}</span>)}</div></section>

    <section id="checker" className="checker-section container"><div className="section-heading"><span className="kicker">FREE AI VISIBILITY CHECKER</span><h2>Do AI engines know your brand?</h2><p>Enter your website. We’ll test real buyer questions and show where you appear.</p></div><Checker/></section>

    <section id="how" className="feature-section"><div className="container"><div className="section-heading left"><span className="kicker">FROM SIGNAL TO ACTION</span><h2>Stop guessing what AI wants.</h2><p>AskVisible turns thousands of AI answers into a clear, prioritized growth plan.</p></div><div className="feature-grid">
      <article><span className="feature-no">01</span><div className="feature-icon"><Radar/></div><h3>Monitor every answer</h3><p>Track the prompts your buyers actually use across four leading AI engines, automatically.</p><div className="mini-answers">{engines.map((e,i)=><span key={e}><i className={`e${i}`}>{e[0]}</i>{e}<b>{[72,64,58,51][i]}%</b></span>)}</div></article>
      <article><span className="feature-no">02</span><div className="feature-icon"><LineChart/></div><h3>Understand why you lose</h3><p>Compare position, sentiment, citations, and competitor wins over time—not just a vanity score.</p><div className="bars"><span><i style={{height:"55%"}}/><small>Jan</small></span><span><i style={{height:"65%"}}/><small>Feb</small></span><span><i style={{height:"48%"}}/><small>Mar</small></span><span><i style={{height:"76%"}}/><small>Apr</small></span><span><i style={{height:"90%"}}/><small>May</small></span></div></article>
      <article><span className="feature-no">03</span><div className="feature-icon"><Zap/></div><h3>Fix what moves the needle</h3><p>Get page rewrites, schema, citation targets, and entity fixes—ranked by likely impact.</p><div className="fix-sample"><span><Sparkles/> Recommended fix</span><b>Add comparison evidence to /features</b><p>Estimated visibility lift</p><strong>+12–18%</strong></div></article>
    </div></div></section>

    <section id="pricing" className="pricing-section container"><div className="section-heading"><span className="kicker">SIMPLE PRICING</span><h2>Start free. Grow when you’re ready.</h2><p>Every plan includes all four AI engines and historical tracking.</p></div><div className="pricing-grid">
      <Price name="Free" price="0" desc="See where you stand" features={["3 tracked prompts","Weekly scans","1 brand","Basic visibility score"]}/>
      <Price name="Starter" price="29" desc="Build consistent visibility" features={["50 tracked prompts","Daily scans","1 brand","Alerts & trend history"]}/>
      <Price name="Pro" price="79" desc="Turn insights into growth" popular features={["250 tracked prompts","Daily scans","AI fix generator","Competitor intelligence","PDF & CSV reports"]}/>
      <Price name="Agency" price="199" desc="Scale across client brands" features={["Multiple brands","White-label reports","Team seats","Priority support"]}/>
    </div></section>

    <section className="cta"><div className="orb one"/><div className="orb two"/><div className="container"><span className="kicker light">YOUR NEXT CUSTOMER IS ASKING AI</span><h2>Be the brand it recommends.</h2><p>Start tracking your AI visibility today. Your first three prompts are free.</p><Link className="button white" href="/app">Start tracking for free <ArrowRight/></Link><small>No credit card required · Set up in 2 minutes</small></div></section>
    <footer className="footer container"><Link className="brand" href="/"><span className="brand-mark">a</span>askvisible</Link><p>Own the answer.</p><div><a href="#how">Product</a><a href="#pricing">Pricing</a><a href="#faq">Privacy</a><a href="#faq">Terms</a></div><small>© 2026 AskVisible</small></footer>
  </main>;
}

function Price({name,price,desc,features,popular}:{name:string;price:string;desc:string;features:string[];popular?:boolean}) { return <article className={`price-card ${popular?"popular":""}`}>{popular&&<span className="popular-label">MOST POPULAR</span>}<h3>{name}</h3><p>{desc}</p><div className="price"><sup>$</sup><b>{price}</b><span>{price!=="0"&&"/mo"}</span></div><Link href="/app" className={`button ${popular?"":"outline"}`}>{price==="0"?"Start free":"Choose "+name}<ChevronRight/></Link><ul>{features.map(f=><li key={f}><Check/>{f}</li>)}</ul></article> }
