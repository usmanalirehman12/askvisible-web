"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, ArrowDownRight, ArrowLeft, ArrowUpRight, BarChart3, Bell, Check, ChevronDown, CircleHelp, FileText, Gauge, LayoutDashboard, LoaderCircle, LogOut, Menu, Moon, MoreHorizontal, Play, Plus, Radar, Search, Settings, Sparkles, Sun, Target, TrendingUp, Users, WandSparkles, X } from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase/config";
import type { Brand, Competitor, Fix, Prompt, WorkspaceContext } from "@/lib/data/types";
import type { ScanAnswerRow } from "@/lib/data/stats";
import { summarizeScan } from "@/lib/data/stats";

const engines=[{name:"ChatGPT",short:"G",color:"green"},{name:"Gemini",short:"◆",color:"blue"},{name:"Perplexity",short:"P",color:"teal"},{name:"Claude",short:"C",color:"orange"},{name:"DeepSeek",short:"D",color:"crimson"},{name:"AI Overviews",short:"◈",color:"cobalt"}];
const engineByKey:Record<string,{name:string;short:string;color:string}>={openai:engines[0],gemini:engines[1],perplexity:engines[2],anthropic:engines[3],deepseek:engines[4],ai_overviews:engines[5]};
const nav=[{id:"overview",label:"Overview",icon:LayoutDashboard},{id:"prompts",label:"Prompts",icon:Search},{id:"competitors",label:"Competitors",icon:Users},{id:"fixes",label:"AI Fixes",icon:WandSparkles},{id:"reports",label:"Reports",icon:FileText}];
const demoEngines=[{name:"ChatGPT",short:"G",score:74,color:"green"},{name:"Gemini",short:"◆",score:68,color:"blue"},{name:"Perplexity",short:"P",score:61,color:"teal"},{name:"Claude",short:"C",score:54,color:"orange"},{name:"DeepSeek",short:"D",score:48,color:"crimson"},{name:"AI Overviews",short:"◈",score:55,color:"cobalt"}];
const demoPrompts=[
  {q:"Best AI visibility tools for SaaS companies",engine:"ChatGPT",status:"Mentioned",position:2,sentiment:"Positive",change:1},
  {q:"How can I track my brand in AI search?",engine:"Gemini",status:"Mentioned",position:3,sentiment:"Positive",change:0},
  {q:"Top generative engine optimization platforms",engine:"Perplexity",status:"Not mentioned",position:null,sentiment:"—",change:-1},
  {q:"AskVisible alternatives for marketing teams",engine:"Claude",status:"Mentioned",position:4,sentiment:"Neutral",change:2},
  {q:"Tools to improve brand visibility in ChatGPT",engine:"ChatGPT",status:"Not mentioned",position:null,sentiment:"—",change:0}
];

// demo === true means Supabase isn't configured — the dashboard falls back to the original
// static demo content everywhere (README's "runs in a safe demo mode without credentials"
// promise). Reports/Settings tabs still show demo content in both modes — not wired this
// pass; that's a smaller, separate task than "make scans and fixes real."
export default function AppPage(){
 const router=useRouter();
 const demo=!supabaseConfigured();
 const [section,setSection]=useState("overview"),[scanning,setScanning]=useState(false),[open,setOpen]=useState(false),[toast,setToast]=useState("");
 const [scanProgress,setScanProgress]=useState<{done:number;total:number}|null>(null);
 const [ctx,setCtx]=useState<WorkspaceContext|null>(null);
 const [ctxLoading,setCtxLoading]=useState(!demo);
 const [ctxError,setCtxError]=useState("");
 const [refreshKey,setRefreshKey]=useState(0);
 const [theme,setTheme]=useState<'light'|'dark'>('light');
 useEffect(()=>{const saved=localStorage.getItem('av-theme') as 'light'|'dark'|null;const t=saved||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');setTheme(t);document.documentElement.setAttribute('data-theme',t);},[]);
 function toggleTheme(){const n=theme==='light'?'dark':'light';setTheme(n);document.documentElement.setAttribute('data-theme',n);localStorage.setItem('av-theme',n)}

 useEffect(()=>{
  if(demo)return;
  let cancelled=false;
  (async()=>{
   try{
    const [{createClient},{getWorkspaceContext}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/workspace")]);
    const supabase=createClient();
    const result=await getWorkspaceContext(supabase);
    if(cancelled)return;
    if(!result){router.push("/login");return}
    setCtx(result);
   }catch(err){if(!cancelled)setCtxError(err instanceof Error?err.message:"Couldn't load your workspace.")}
   finally{if(!cancelled)setCtxLoading(false)}
  })();
  return ()=>{cancelled=true};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 const activeBrand=ctx?.brands[0];

 async function scan(){
  if(demo){setScanning(true);setTimeout(()=>{setScanning(false);setToast("Scan complete — 4 new mentions found");setTimeout(()=>setToast(""),3500)},1800);return}
  if(!activeBrand){setToast("Add a client before running a scan");setTimeout(()=>setToast(""),3500);return}
  setScanning(true);setScanProgress(null);
  try{
   const startRes=await fetch("/api/scan/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({brandId:activeBrand.id})});
   const startData=await startRes.json();
   if(!startRes.ok)throw new Error(startData.error||"Scan failed.");
   const {scanRunId,brand,tasks}=startData;
   setScanProgress({done:0,total:tasks.length});
   let done=0;const skipped:{provider:string;reason:string}[]=[];
   await Promise.all(tasks.map(async(task:{provider:string;prompt:string;promptId:string})=>{
    try{
     const r=await fetch("/api/scan/prompt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scanRunId,provider:task.provider,prompt:task.prompt,promptId:task.promptId,brandName:brand.name,brandDomain:brand.domain})});
     const d=await r.json().catch(()=>({}));
     if(d.skipped&&!skipped.find(s=>s.provider===task.provider))skipped.push({provider:task.provider,reason:d.reason||"provider failed"});
    }catch{}
    done++;setScanProgress({done,total:tasks.length});
   }));
   const finishRes=await fetch("/api/scan/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scanRunId,totalExpected:tasks.length})});
   const finishData=await finishRes.json();
   if(!finishRes.ok)throw new Error(finishData.error||"Scan failed.");
   const fixPromise=fetch("/api/fixes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scanRunId,brandId:activeBrand.id})}).then(r=>r.json().catch(()=>({}))).catch(()=>({error:"request failed"}));
   const skipNote=skipped.length?` · skipped: ${skipped.map(s=>{const name=s.provider==="ai_overviews"?"AI Overviews":s.provider;return `${name} (${s.reason.slice(0,40)})`;}).join(", ")}`:"";
   setToast(`Scan complete — ${finishData.mentions}/${finishData.total} mentions${skipNote}`);
   await new Promise(r=>setTimeout(r,800));
   setRefreshKey(k=>k+1);
   fixPromise.then(fixResult=>{
    setRefreshKey(k=>k+1);
    if(fixResult.error){setToast(`Fix failed: ${String(fixResult.error).slice(0,80)}`);setTimeout(()=>setToast(""),7000);}
    else if(fixResult.skipped){setToast("Fixes skipped — ANTHROPIC_API_KEY not found in Vercel env vars");setTimeout(()=>setToast(""),7000);}
    else if(!fixResult.fixesGenerated){setToast(`Fixes returned 0 — Claude may have returned empty JSON`);setTimeout(()=>setToast(""),7000);}
    else{setToast(`${fixResult.fixesGenerated} AI fix${fixResult.fixesGenerated===1?"":"es"} generated`);setTimeout(()=>setToast(""),5000);}
   });
  }catch(err){setToast(err instanceof Error?err.message:"Scan failed.")}
  finally{setScanning(false);setScanProgress(null);setTimeout(()=>setToast(""),4500)}
 }

 if(!demo&&ctxLoading)return <main className="app-shell auth-shell"><LoaderCircle className="spin"/></main>;
 if(!demo&&ctxError)return <main className="auth-shell"><div className="modal"><span className="feature-icon"><AlertCircle/></span><h2>Couldn&apos;t load your workspace</h2><p>{ctxError}</p></div></main>;

 const displayName=demo?"Maya Johnson":(ctx?.fullName||"");
 const displayEmail=demo?"maya@acme.co":(ctx?.email||"");
 const firstName=displayName.split(" ")[0]||"there";

 return <main className="app-shell">{toast&&<div className="toast"><Check/>{toast}</div>}
  <aside className={`sidebar ${open?"open":""}`}>
   <div className="side-brand"><Link className="brand" href="/"><span className="brand-mark">a</span>askvisibleai</Link><button className="mobile-close" onClick={()=>setOpen(false)}><X/></button></div>
   <BrandSwitcher demo={demo} ctx={ctx} onBrandAdded={b=>setCtx(c=>c?{...c,brands:[...c.brands,b]}:c)}/>
   <nav>{nav.map(n=><button key={n.id} className={section===n.id?"active":""} onClick={()=>{setSection(n.id);setOpen(false)}}><n.icon/>{n.label}</button>)}</nav>
   <div className="side-bottom">
    <button><CircleHelp/>Help & resources</button>
    <button onClick={()=>setSection("settings")}><Settings/>Settings</button>
    <div className="usage-mini"><div><span>Monthly usage</span><b>183 / 250</b></div><i><span/></i><small>67 prompts remaining</small></div>
    <div className="profile"><span>{displayName.slice(0,2).toUpperCase()||"?"}</span><div><b>{displayName||"…"}</b><small>{displayEmail}</small></div>{demo?<MoreHorizontal/>:<form action="/logout" method="POST"><button className="icon-btn" title="Log out" aria-label="Log out"><LogOut/></button></form>}</div>
   </div>
  </aside>
  <section className="app-content"><header className="app-header"><button className="menu-btn" onClick={()=>setOpen(true)}><Menu/></button><div className="header-search"><Search/><input placeholder="Search prompts, reports, fixes…"/><kbd>⌘ K</kbd></div><div className="header-actions"><button className="icon-btn"><Bell/><i/></button><button className="icon-btn theme-toggle" onClick={toggleTheme} title={theme==='light'?'Switch to dark mode':'Switch to light mode'} aria-label="Toggle theme">{theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button><button className="scan-btn" onClick={scan} disabled={scanning}>{scanning?<LoaderCircle className="spin"/>:<Play/>}{scanning?(scanProgress?`${scanProgress.done}/${scanProgress.total} prompts…`:"Starting…"):"Run scan"}</button></div></header>
    <div className="app-page">{section==="overview"?<Overview demo={demo} brand={activeBrand} refreshKey={refreshKey} scan={scan} scanning={scanning} setSection={setSection} firstName={firstName}/>:section==="prompts"?<Prompts demo={demo} brand={activeBrand} refreshKey={refreshKey}/>:section==="fixes"?<Fixes demo={demo} brand={activeBrand} refreshKey={refreshKey}/>:section==="competitors"?<Competitors demo={demo} brand={activeBrand}/>:section==="reports"?<Reports/>:<SettingsPage/>}</div>
  </section>
 </main>
}

function BrandSwitcher({demo,ctx,onBrandAdded}:{demo:boolean;ctx:WorkspaceContext|null;onBrandAdded:(b:Brand)=>void}){
 const [modal,setModal]=useState(false),[name,setName]=useState(""),[domain,setDomain]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState("");
 if(demo)return <button className="brand-switch"><span>AC</span><div><b>Acme Software</b><small>Pro plan</small></div><ChevronDown/></button>;
 const active=ctx?.brands[0];
 async function addClient(e:React.FormEvent){
  e.preventDefault();if(!ctx)return;setSaving(true);setError("");
  try{
   const r=await fetch("/api/brands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:ctx.workspaceId,name,domain:domain.replace(/^https?:\/\//,"").replace(/\/$/,"")})});
   const j=await r.json().catch(()=>({}));
   if(!r.ok||!j.brand)throw new Error(j.error||"Couldn't add that client.");
   onBrandAdded(j.brand);setName("");setDomain("");setModal(false);
  }catch(err){setError(err instanceof Error?err.message:"Couldn't add that client.")}
  finally{setSaving(false)}
 }
 return <>
  <button className="brand-switch" onClick={()=>setModal(true)}><span>{active?active.name.slice(0,2).toUpperCase():"+"}</span><div><b>{active?active.name:"Add your first client"}</b><small>{ctx?`${ctx.plan.charAt(0).toUpperCase()}${ctx.plan.slice(1)} plan`:""}</small></div><ChevronDown/></button>
  {modal&&<div className="modal-back"><div className="modal"><button className="modal-x" onClick={()=>setModal(false)}><X/></button><span className="feature-icon"><Users/></span><h2>Your clients</h2>
   {ctx&&ctx.brands.length>0?<ul className="client-list">{ctx.brands.map(b=><li key={b.id}><b>{b.name}</b><small>{b.domain}</small></li>)}</ul>:<p>No clients yet. Add your first client brand to start tracking AI-search visibility.</p>}
   <form onSubmit={addClient}>
    <label>Client name<input required autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Acme Plumbing"/></label>
    <label>Website<input required value={domain} onChange={e=>setDomain(e.target.value)} placeholder="acmeplumbing.com"/></label>
    {error&&<div className="checker-error"><AlertCircle/><div><b>Couldn&apos;t add client</b><p>{error}</p></div></div>}
    <button className="button" disabled={saving}>{saving?"Adding…":"Add client"}</button>
   </form>
  </div></div>}
 </>;
}

function useLatestScan(demo:boolean,brand:Brand|undefined,refreshKey:number){
 const [scan,setScan]=useState<{runId:string;confidence:number|null;completedAt:string|null;answers:ScanAnswerRow[]}|null>(null);
 const [loading,setLoading]=useState(!demo);
 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{
   setLoading(true);
   const [{createClient},{getLatestScan}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/stats")]);
   const supabase=createClient();
   const result=await getLatestScan(supabase,brand.id);
   if(!cancelled){setScan(result);setLoading(false)}
  })();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);
 return {scan,loading};
}

function useFixes(demo:boolean,brand:Brand|undefined,refreshKey:number){
 const [fixes,setFixes]=useState<Fix[]>([]);
 useEffect(()=>{
  if(demo||!brand)return;
  let cancelled=false;
  (async()=>{const r=await fetch(`/api/fixes/list?brandId=${encodeURIComponent(brand.id)}`);const j=await r.json().catch(()=>({}));if(!cancelled)setFixes(j.fixes||[])})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);
 return fixes;
}

function Overview({demo,brand,refreshKey,scan,scanning,setSection,firstName}:{demo:boolean;brand?:Brand;refreshKey:number;scan:()=>void;scanning:boolean;setSection:(s:string)=>void;firstName:string}){
 const {scan:latest,loading}=useLatestScan(demo,brand,refreshKey);
 const fixes=useFixes(demo,brand,refreshKey);
 const [promptCount,setPromptCount]=useState<number|null>(null);
 useEffect(()=>{
  if(demo||!brand)return;
  let cancelled=false;
  (async()=>{const [{createClient},{getPrompts}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/prompts")]);const supabase=createClient();const rows=await getPrompts(supabase,brand.id);if(!cancelled)setPromptCount(rows.length)})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);

 const header=<div className="page-title"><div><span className="overline">OVERVIEW</span><h1>Good morning, {firstName} <span>👋</span></h1><p>Here’s how your brand is showing up in AI answers.</p></div><div className="date-control">Last 30 days <ChevronDown/></div></div>;

 if(demo)return <>{header}
  <ScoreHero score={67} trend="8.2%" confidence="High confidence"/>
  <div className="stats-grid"><Stat label="Total mentions" value="142" trend="12.4%" icon={Activity}/><Stat label="Average position" value="#2.4" sub="when mentioned" icon={Target}/><Stat label="Prompts tracked" value="183" sub="of 250 monthly" icon={Search}/><Stat label="AI engines" value="6" sub="ChatGPT · Gemini · Perplexity · Claude · DeepSeek · AI Overviews" icon={BarChart3}/></div>
  <div className="dashboard-grid"><article className="panel visibility-panel"><PanelHead title="Visibility trend" sub="Your share of AI answers over time"/><div className="chart-legend"><span><i/>Your brand</span><span><i/>Top competitor</span></div><div className="big-chart"><div className="axis"><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span></div><svg viewBox="0 0 800 260" preserveAspectRatio="none"><defs><linearGradient id="appfill"><stop offset="0" stopColor="#0EA5E9" stopOpacity=".22"/><stop offset="1" stopColor="#0EA5E9" stopOpacity="0"/></linearGradient></defs><path className="grid-lines" d="M0 10H800M0 70H800M0 130H800M0 190H800M0 250H800"/><path className="competitor-line" d="M0 158 C90 144 110 118 190 125 S300 98 380 112 S510 75 590 92 S700 65 800 68"/><path className="trend-area" d="M0 205 C80 195 110 185 170 188 S260 143 330 153 S440 115 510 125 S625 80 690 92 S760 50 800 43 L800 260L0 260Z"/><path className="trend-line" d="M0 205 C80 195 110 185 170 188 S260 143 330 153 S440 115 510 125 S625 80 690 92 S760 50 800 43"/><circle cx="800" cy="43" r="5"/></svg><div className="x-axis"><span>Jun 19</span><span>Jun 25</span><span>Jul 1</span><span>Jul 7</span><span>Jul 13</span><span>Jul 19</span></div></div></article>
  <article className="panel engine-panel"><PanelHead title="Visibility by engine" sub="Last 30 days"/>{demoEngines.map(e=><div className="engine-row" key={e.name}><span className={`engine-logo ${e.color}`}>{e.short}</span><div><b>{e.name}</b><i><span style={{width:e.score+"%"}}/></i></div><strong>{e.score}%</strong></div>)}<button className="panel-link" onClick={()=>setSection("prompts")}>View prompt details <ArrowUpRight/></button></article>
  <article className="panel prompt-panel"><PanelHead title="Recent prompt performance" sub="Latest results across all engines" action={<button onClick={()=>setSection("prompts")}>View all <ArrowUpRight/></button>}/><DemoPromptTable short/></article>
  <article className="panel opportunities"><PanelHead title="Top opportunities" sub="AI-recommended actions ranked by impact" action={<button onClick={()=>setSection("fixes")}>View all</button>}/>{[{t:"Add direct comparison content",p:"Your competitors win 14 prompts with comparison pages.",impact:"High",lift:"+12–18%"},{t:"Strengthen third-party citations",p:"AI engines cite 3 sources that don’t mention your brand.",impact:"High",lift:"+8–14%"},{t:"Add SoftwareApplication schema",p:"Help engines understand your product entity and pricing.",impact:"Med",lift:"+4–7%"}].map((o,i)=><div className="opportunity" key={o.t}><span className="opp-icon"><Sparkles/></span><div><b>{o.t}</b><p>{o.p}</p><small><em className={o.impact==="High"?"high":"medium"}>{o.impact} impact</em>Estimated lift <strong>{o.lift}</strong></small></div><button onClick={()=>setSection("fixes")}>Fix this <ArrowUpRight/></button></div>)}</article>
  </div></>;

 if(!brand)return <>{header}<p>Add a client to start tracking AI visibility.</p></>;
 if(loading)return <>{header}<p>Loading…</p></>;
 if(!latest)return <>{header}<div className="panel" style={{padding:"24px"}}><p>No scans yet for {brand.name}. Click <b>Run scan</b> above to check its AI visibility for the first time.</p></div></>;

 const summary=summarizeScan(latest);
 const byEngine=groupByEngine(latest.answers);

 return <>{header}
  <ScoreHero score={summary.score} confidence={confidenceLabel(latest.confidence??0)}/>
  <div className="stats-grid">
   <Stat label="Total mentions" value={String(summary.mentions)} sub={`of ${summary.total} answers checked`} icon={Activity}/>
   <Stat label="Average position" value={summary.avgPosition!=null?`#${summary.avgPosition}`:"—"} sub="when mentioned" icon={Target}/>
   <Stat label="Prompts tracked" value={promptCount!=null?String(promptCount):"…"} sub="active prompts" icon={Search}/>
   <Stat label="AI engines" value="6" sub="ChatGPT · Gemini · Perplexity · Claude · DeepSeek · AI Overviews" icon={BarChart3}/>
  </div>
  <div className="dashboard-grid">
   <article className="panel engine-panel"><PanelHead title="Visibility by engine" sub="Most recent scan"/>{byEngine.map(e=><div className="engine-row" key={e.key}><span className={`engine-logo ${e.color}`}>{e.short}</span><div><b>{e.name}</b><i><span style={{width:e.pct+"%"}}/></i></div><strong>{e.pct}%</strong></div>)}<button className="panel-link" onClick={()=>setSection("prompts")}>View prompt details <ArrowUpRight/></button></article>
   <article className="panel prompt-panel"><PanelHead title="Recent prompt performance" sub="Latest results across all engines" action={<button onClick={()=>setSection("prompts")}>View all <ArrowUpRight/></button>}/><RealPromptTable answers={latest.answers.slice(0,4)}/></article>
  </div>
  {fixes.length>0&&<article className="panel opportunities" style={{marginTop:"14px"}}><PanelHead title="Top AI-generated fixes" sub="Claude's recommendations from your most recent scan" action={<button onClick={()=>setSection("fixes")}>View all <ArrowUpRight/></button>}/>{fixes.slice(0,3).map(f=><div className="opportunity" key={f.id}><span className="opp-icon"><Sparkles/></span><div><b>{f.title}</b><p>{f.rationale}</p><small><em className={(f.impact_high||0)>=12?"high":"medium"}>{(f.impact_high||0)>=12?"High":"Med"} impact</em>Estimated lift <strong>+{f.impact_low}–{f.impact_high}%</strong></small></div><button onClick={()=>setSection("fixes")}>View fix <ArrowUpRight/></button></div>)}</article>}
 </>;
}

function confidenceLabel(value:number){return value>=70?"High confidence":value>=40?"Medium confidence":"Low confidence"}
function groupByEngine(answers:ScanAnswerRow[]){
 const byKey=new Map<string,ScanAnswerRow[]>();
 for(const a of answers){const list=byKey.get(a.engine)??[];list.push(a);byKey.set(a.engine,list)}
 return Array.from(byKey.entries()).map(([key,list])=>{const meta=engineByKey[key]||{name:key,short:key[0]?.toUpperCase()||"?",color:"green"};const pct=list.length?Math.round(list.filter(a=>a.brand_mentioned).length/list.length*100):0;return {key,name:meta.name,short:meta.short,color:meta.color,pct}});
}

function Stat({label,value,trend,sub,confidence,icon:Icon}:{label:string;value:string;trend?:string;sub?:string;confidence?:string;icon:any}){return <article className="stat"><div><span>{label}</span><b>{value}</b>{trend?<small className="up"><ArrowUpRight/>{trend} <em>vs last period</em></small>:<small>{sub}</small>}{confidence&&<span className="confidence-tag">{confidence}</span>}</div><span className="stat-icon"><Icon/></span></article>}
function ScoreHero({score,trend,confidence}:{score:number|string;trend?:string;confidence?:string}){return <div style={{background:"var(--surface,#fff)",border:"1px solid var(--line)",borderRadius:"10px",padding:"24px 28px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"32px",borderLeft:"4px solid var(--sky,#0EA5E9)"}}><div><span style={{display:"block",fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--sky,#0EA5E9)",marginBottom:"4px"}}>AI Visibility Score</span><span style={{display:"block",fontSize:"76px",fontWeight:800,lineHeight:1,fontFamily:"Outfit,system-ui,sans-serif",color:"var(--sky,#0EA5E9)",letterSpacing:"-4px"}}>{score}</span>{confidence&&<span className="confidence-tag" style={{display:"inline-block",marginTop:"10px"}}>{confidence}</span>}</div>{trend&&<div style={{marginLeft:"auto",textAlign:"right"}}><span style={{display:"block",fontSize:"28px",fontWeight:700,fontFamily:"Outfit,system-ui",color:"var(--em,#10B981)",letterSpacing:"-1px"}}>↑{trend}</span><span style={{fontSize:"12px",color:"var(--muted,#64748B)"}}>vs last period</span></div>}</div>}
function PanelHead({title,sub,action}:{title:string;sub?:string;action?:React.ReactNode}){return <div className="panel-head"><div><h3>{title}</h3>{sub&&<p>{sub}</p>}</div>{action||<button><MoreHorizontal/></button>}</div>}
function DemoPromptTable({short=false}:{short?:boolean}){let rows=short?demoPrompts.slice(0,4):demoPrompts;return <div className="table-wrap"><table><thead><tr><th>Prompt</th><th>Engine</th><th>Status</th><th>Position</th><th>Sentiment</th><th>Change</th></tr></thead><tbody>{rows.map(p=><tr key={p.q}><td><b>{p.q}</b></td><td>{p.engine}</td><td><span className={p.status==="Mentioned"?"status yes":"status no"}>{p.status}</span></td><td>{p.position?`#${p.position}`:"—"}</td><td>{p.sentiment}</td><td><span className={p.change>0?"up":p.change<0?"down":""}>{p.change>0?<ArrowUpRight/>:p.change<0?<ArrowDownRight/>:"—"}{p.change!==0&&Math.abs(p.change)}</span></td></tr>)}</tbody></table></div>}
// Real mode has no "Change" column — that needs comparing against a previous scan, which
// isn't tracked yet (this is the first real scan for most brands). Showing a fabricated
// trend arrow next to real mention data would be worse than omitting the column.
function RealPromptTable({answers}:{answers:ScanAnswerRow[]}){return <div className="table-wrap"><table><thead><tr><th>Prompt</th><th>Engine</th><th>Status</th><th>Position</th><th>Sentiment</th></tr></thead><tbody>{answers.map(a=><tr key={a.id}><td><b>{a.prompts?.query||"—"}</b></td><td>{engineByKey[a.engine]?.name||a.engine}</td><td><span className={a.brand_mentioned?"status yes":"status no"}>{a.brand_mentioned?"Mentioned":"Not mentioned"}</span></td><td>{a.position?`#${a.position}`:"—"}</td><td>{a.sentiment==="not-mentioned"?"—":a.sentiment}</td></tr>)}</tbody></table></div>}
function PromptMatrix({prompts,answers}:{prompts:Prompt[];answers:ScanAnswerRow[]}){
 const engineKeys=[...new Set(answers.map(a=>a.engine))];
 const byPromptEngine=new Map<string,Map<string,ScanAnswerRow>>();
 for(const a of answers){if(!byPromptEngine.has(a.prompt_id))byPromptEngine.set(a.prompt_id,new Map());byPromptEngine.get(a.prompt_id)!.set(a.engine,a)}
 if(!prompts.length)return <p style={{padding:"14px",color:"var(--muted)",fontSize:"12px"}}>No prompts tracked yet.</p>;
 return <div className="table-wrap"><table><thead><tr><th>Prompt</th>{engineKeys.map(k=><th key={k}>{engineByKey[k]?.name||k}</th>)}{!engineKeys.length&&<th>Run a scan to see results</th>}</tr></thead><tbody>{prompts.map(p=>{const byEng=byPromptEngine.get(p.id)||new Map();return <tr key={p.id}><td><b>{p.query}</b></td>{engineKeys.map(k=>{const a=byEng.get(k);if(!a)return <td key={k} style={{color:"#ccc",textAlign:"center"}}>—</td>;return <td key={k}><span className={a.brand_mentioned?"status yes":"status no"}>{a.brand_mentioned?`✓${a.position?` #${a.position}`:""}`:"✗"}</span></td>})}{!engineKeys.length&&<td style={{color:"var(--muted)",fontSize:"11px"}}>—</td>}</tr>})}</tbody></table></div>
}
function FixContent({content}:{content:string}){
 const [copied,setCopied]=useState(false);
 function copy(){navigator.clipboard.writeText(content).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)}).catch(()=>{})}
 return <div style={{position:"relative",margin:"12px 0"}}>
  <button onClick={copy} style={{position:"absolute",right:"8px",top:"8px",border:"1px solid #ddd",background:"var(--surface,#fff)",borderRadius:"5px",padding:"3px 8px",fontSize:"9px",cursor:"pointer",zIndex:1}}>{copied?"Copied!":"Copy"}</button>
  <pre style={{whiteSpace:"pre-wrap",fontSize:"11px",background:"#f7f6fb",padding:"12px",paddingRight:"60px",borderRadius:"8px",margin:0,lineHeight:1.6,color:"#2a2640",overflowX:"auto",fontFamily:"inherit"}}>{content}</pre>
 </div>
}

function Prompts({demo,brand,refreshKey}:{demo:boolean;brand?:Brand;refreshKey:number}){
 const [modal,setModal]=useState(false);
 const [prompts,setPrompts]=useState<Prompt[]>([]);
 const [loading,setLoading]=useState(!demo);
 const {scan:latest}=useLatestScan(demo,brand,refreshKey);

 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{setLoading(true);const [{createClient},{getPrompts}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/prompts")]);const supabase=createClient();const rows=await getPrompts(supabase,brand.id);if(!cancelled){setPrompts(rows);setLoading(false)}})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);

 if(demo)return <><div className="page-title"><div><span className="overline">MONITORING</span><h1>Tracked prompts</h1><p>Questions your customers ask AI engines.</p></div><button className="scan-btn" onClick={()=>setModal(true)}><Plus/>Add prompt</button></div><div className="filterbar"><div><Search/><input placeholder="Search prompts…"/></div><button>All engines <ChevronDown/></button><button>All statuses <ChevronDown/></button></div><article className="panel prompt-full"><DemoPromptTable/></article>{modal&&<div className="modal-back"><div className="modal"><button className="modal-x" onClick={()=>setModal(false)}><X/></button><span className="feature-icon"><Search/></span><h2>Add a buyer prompt</h2><p>Track a question your customers ask before choosing a product.</p><label>Prompt<input autoFocus placeholder="e.g. Best analytics tools for startups"/></label><label>Engines<div className="check-grid">{engines.map(e=><span key={e.name}><Check/>{e.name}</span>)}</div></label><button className="button" onClick={()=>setModal(false)}>Add prompt</button></div></div>}</>;

 if(!brand)return <div className="page-title"><div><span className="overline">MONITORING</span><h1>Tracked prompts</h1><p>Add a client first — its buyer-intent prompts are generated automatically.</p></div></div>;

 return <><div className="page-title"><div><span className="overline">MONITORING</span><h1>Tracked prompts for {brand.name}</h1><p>Each question is checked against every AI engine. Run a scan to see where you appear.</p></div></div>
  {loading?<p>Loading…</p>:<article className="panel prompt-full">{latest?<PromptMatrix prompts={prompts} answers={latest.answers}/>:<div className="table-wrap"><table><thead><tr><th>Prompt</th><th>Schedule</th></tr></thead><tbody>{prompts.map(p=><tr key={p.id}><td><b>{p.query}</b></td><td>{p.frequency}</td></tr>)}</tbody></table></div>}</article>}
 </>;
}

function Fixes({demo,brand,refreshKey}:{demo:boolean;brand?:Brand;refreshKey:number}){
 const [fixes,setFixes]=useState<Fix[]>([]);
 const [loading,setLoading]=useState(!demo);
 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{setLoading(true);const r=await fetch(`/api/fixes/list?brandId=${encodeURIComponent(brand.id)}`);const j=await r.json().catch(()=>({}));if(!cancelled){setFixes(j.fixes||[]);if(j.rlsError)console.error("Fixes RLS error:",j.rlsError);setLoading(false)}})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);

 if(demo)return <><div className="page-title"><div><span className="overline">AI FIX GENERATOR</span><h1>Turn gaps into growth</h1><p>Actionable recommendations based on where competitors beat you.</p></div></div><div className="fix-grid">{[{type:"CONTENT",title:"Create an alternatives comparison page",desc:"You’re absent from 8 high-intent prompts where direct competitors have detailed comparison pages.",lift:"12–18%",effort:"~25 min",color:"purple"},{type:"AUTHORITY",title:"Earn mentions from 3 cited sources",desc:"These publications appear in 41% of winning answers but don't currently mention Acme.",lift:"8–14%",effort:"~2 hrs",color:"green"},{type:"TECHNICAL",title:"Add SoftwareApplication schema",desc:"Clarify your product category, pricing, features, and reviews for answer engines.",lift:"4–7%",effort:"~10 min",color:"blue"}].map((f,i)=><article className="fix-card" key={f.title}><div><span className={`fix-type ${f.color}`}>{f.type}</span><em>#{i+1}</em></div><span className="big-fix-icon"><WandSparkles/></span><h3>{f.title}</h3><p>{f.desc}</p><div className="lift"><span>Estimated lift<b>{f.lift}</b></span><span>Time to implement<b>{f.effort}</b></span></div><button className="button">Generate fix <Sparkles/></button></article>)}</div></>;

 if(!brand)return <div className="page-title"><div><span className="overline">AI FIX GENERATOR</span><h1>Turn gaps into growth</h1><p>Add a client and run a scan first — fixes are generated by Claude from real scan results.</p></div></div>;
 if(loading)return <div className="page-title"><div><span className="overline">AI FIX GENERATOR</span><h1>Turn gaps into growth</h1></div></div>;
 if(!fixes.length)return <><div className="page-title"><div><span className="overline">AI FIX GENERATOR</span><h1>Turn gaps into growth</h1><p>No fixes yet for {brand.name}. Click <b>Run scan</b> — Claude generates fix suggestions automatically from the results.</p></div></div></>;

 const colorFor=(category:string)=>({schema:"blue",content:"purple",authority:"green",reviews:"orange",gbp:"orange"} as Record<string,string>)[category]||"purple";

 return <><div className="page-title"><div><span className="overline">AI FIX GENERATOR</span><h1>Turn gaps into growth</h1><p>Claude-generated recommendations for {brand.name}, based on your most recent scan.</p></div></div>
  <div className="fix-grid">{fixes.map((f,i)=><article className="fix-card" key={f.id}><div><span className={`fix-type ${colorFor(f.category)}`}>{f.category.toUpperCase()}</span><em>#{i+1}</em></div><span className="big-fix-icon"><WandSparkles/></span><h3>{f.title}</h3><p>{f.rationale}</p>{f.generated_content&&<FixContent content={f.generated_content}/>}<div className="lift"><span>Estimated lift<b>+{f.impact_low}–{f.impact_high}%</b></span><span>Status<b>{f.status}</b></span></div></article>)}</div>
 </>;
}

// Real mode (demo=false) diverges deliberately from the static demo below: the "Share of AI
// voice" percentage-bars panel is demo-only, because those percentages come from scan_runs/
// answers, which aren't wired yet — showing real competitor names next to fabricated scores
// would be worse than not showing the panel at all. It comes back once scan data is real.
function Competitors({demo,brand}:{demo:boolean;brand?:Brand}){
 const [items,setItems]=useState<Competitor[]>([]);
 const [loading,setLoading]=useState(!demo);
 const [modal,setModal]=useState(false),[name,setName]=useState(""),[domain,setDomain]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState("");

 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{
   setLoading(true);
   const [{createClient},{getCompetitors}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/competitors")]);
   const supabase=createClient();
   const rows=await getCompetitors(supabase,brand.id);
   if(!cancelled){setItems(rows);setLoading(false)}
  })();
  return ()=>{cancelled=true};
 },[demo,brand]);

 async function addCompetitor(e:React.FormEvent){
  e.preventDefault();if(!brand)return;setSaving(true);setError("");
  try{
   const [{createClient},{createCompetitor}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/competitors")]);
   const supabase=createClient();
   const row=await createCompetitor(supabase,brand.id,name,domain);
   setItems(prev=>[...prev,row]);setName("");setDomain("");setModal(false);
  }catch(err){setError(err instanceof Error?err.message:"Couldn't add that competitor.")}
  finally{setSaving(false)}
 }

 if(demo)return <><div className="page-title"><div><span className="overline">LOCAL COMPETITIVE INTELLIGENCE</span><h1>Competitors near you</h1><p>See which nearby businesses in your category AI recommends instead of you—and what makes them win.</p></div><button className="scan-btn"><Plus/>Add a local competitor</button></div><div className="competitor-grid">{[{n:"SearchPilot",s:72,c:"SP",d:5},{n:"Riverside Rivals",s:64,c:"RR",d:-2},{n:"PromptWatch",s:49,c:"PW",d:8}].map(x=><article className="panel competitor-card" key={x.n}><span>{x.c}</span><div><h3>{x.n}</h3><p>Visibility score</p></div><b>{x.s}%</b><small className={x.d>0?"up":"down"}>{x.d>0?<ArrowUpRight/>:<ArrowDownRight/>}{Math.abs(x.d)}%</small><button><MoreHorizontal/></button></article>)}</div><article className="panel"><PanelHead title="Share of AI voice" sub="Mention frequency across tracked prompts, vs. competitors in your area"/><div className="share-bars">{[{n:"Acme Software",v:67},{n:"SearchPilot",v:72},{n:"Riverside Rivals",v:64},{n:"PromptWatch",v:49}].map(x=><div key={x.n}><span>{x.n}</span><i><b style={{width:x.v+"%"}}/></i><strong>{x.v}%</strong></div>)}</div></article></>;

 if(!brand)return <div className="page-title"><div><span className="overline">LOCAL COMPETITIVE INTELLIGENCE</span><h1>Competitors near you</h1><p>Add a client brand first, then track the local competitors AI recommends instead of them.</p></div></div>;

 return <><div className="page-title"><div><span className="overline">LOCAL COMPETITIVE INTELLIGENCE</span><h1>Competitors near you</h1><p>See which nearby businesses in {brand.name}&apos;s category AI recommends instead of them.</p></div><button className="scan-btn" onClick={()=>setModal(true)}><Plus/>Add a local competitor</button></div>
  {loading?<p>Loading competitors…</p>:items.length===0?<p>No competitors tracked yet for {brand.name}.</p>:<div className="competitor-grid">{items.map(c=><article className="panel competitor-card" key={c.id}><span>{c.name.slice(0,2).toUpperCase()}</span><div><h3>{c.name}</h3><p>{c.domain||"No domain set"}</p></div><button><MoreHorizontal/></button></article>)}</div>}
  {modal&&<div className="modal-back"><div className="modal"><button className="modal-x" onClick={()=>setModal(false)}><X/></button><span className="feature-icon"><Users/></span><h2>Add a local competitor</h2><p>Who else near {brand.name} shows up for these questions?</p>
   <form onSubmit={addCompetitor}>
    <label>Competitor name<input required autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Riverside Plumbing Co."/></label>
    <label>Website (optional)<input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="riversideplumbing.com"/></label>
    {error&&<div className="checker-error"><AlertCircle/><div><b>Couldn&apos;t add competitor</b><p>{error}</p></div></div>}
    <button className="button" disabled={saving}>{saving?"Adding…":"Add competitor"}</button>
   </form>
  </div></div>}
 </>;
}

function Reports(){return <><div className="page-title"><div><span className="overline">REPORTS</span><h1>Visibility reports</h1><p>Share clear progress with your team and clients.</p></div><button className="scan-btn"><Plus/>Create report</button></div><div className="report-grid">{["June 2026 visibility report","Q2 executive summary","Competitor benchmark — June"].map((r,i)=><article className="panel report-card" key={r}><span className="report-icon"><FileText/></span><div><small>{i===0?"MONTHLY":"CUSTOM"}</small><h3>{r}</h3><p>Generated {i*7+2} days ago · PDF</p></div><button><MoreHorizontal/></button><div className="report-score"><span>Visibility</span><b>{67-i*4}%</b></div><button className="button outline">Open report</button></article>)}</div></>}
function SettingsPage(){return <><div className="page-title"><div><span className="overline">SETTINGS</span><h1>Workspace settings</h1><p>Manage your brand, alerts, team, and subscription.</p></div></div><div className="settings-grid"><article className="panel settings-nav"><button className="active">Brand profile</button><button>Notifications</button><button>Team members</button><button>Billing & usage</button><button>Integrations</button></article><article className="panel settings-form"><h3>Brand profile</h3><p>Used to identify mentions and compare your market position.</p><label>Brand name<input defaultValue="Acme Software"/></label><label>Website<input defaultValue="https://acme.co"/></label><label>Brand description<textarea defaultValue="AI-powered workflow software for growing SaaS teams."/></label><button className="button">Save changes</button></article></div></>}
