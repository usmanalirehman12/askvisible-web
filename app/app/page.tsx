"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, ArrowDownRight, ArrowLeft, ArrowUpRight, BarChart3, Bell, Check, ChevronDown, CircleHelp, Edit2, FileText, Gauge, Globe, LayoutDashboard, Link2, LoaderCircle, LogOut, Mail, Menu, Moon, MoreHorizontal, Play, Plus, Radar, Search, Settings, Sparkles, Sun, Target, Trash2, TrendingUp, Users, WandSparkles, X } from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase/config";
import type { Brand, Competitor, Fix, Prompt, WorkspaceContext } from "@/lib/data/types";
import type { ScanAnswerRow, ShareOfVoiceRow } from "@/lib/data/stats";
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
  const p=new URLSearchParams(window.location.search);
  if(p.get("gsc_connected")){setToast("Google Search Console connected!");setSection("settings");window.history.replaceState({},"","/app")}
  if(p.get("gsc_error")){setToast("GSC connection failed: "+p.get("gsc_error"));window.history.replaceState({},"","/app")}
 },[]);

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

 const [activeBrandId,setActiveBrandId]=useState<string|null>(()=>typeof window!=="undefined"?localStorage.getItem("av-active-brand"):null);
 const activeBrand=ctx?.brands.find(b=>b.id===activeBrandId)||ctx?.brands[0];
 function selectBrand(id:string){setActiveBrandId(id);localStorage.setItem("av-active-brand",id)}

 async function scan(){
  if(demo){setScanning(true);setTimeout(()=>{setScanning(false);setToast("Scan complete — 4 new mentions found");setTimeout(()=>setToast(""),3500)},1800);return}
  if(!activeBrand){setToast("Add a client before running a scan");setTimeout(()=>setToast(""),3500);return}
  setScanning(true);setScanProgress(null);
  try{
   const startRes=await fetch("/api/scan/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({brandId:activeBrand.id})});
   const startData=await startRes.json();
   if(!startRes.ok)throw new Error(startData.error||"Scan failed.");
   const {scanRunId,brand,tasks,competitors}=startData;
   setScanProgress({done:0,total:tasks.length});
   let done=0;const skipped:{provider:string;reason:string}[]=[];
   await Promise.all(tasks.map(async(task:{provider:string;prompt:string;promptId:string})=>{
    try{
     const r=await fetch("/api/scan/prompt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scanRunId,provider:task.provider,prompt:task.prompt,promptId:task.promptId,brandName:brand.name,brandDomain:brand.domain,competitors})});
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
   <BrandSwitcher demo={demo} ctx={ctx} activeBrandId={activeBrand?.id} onSelectBrand={selectBrand} onBrandAdded={b=>{setCtx(c=>c?{...c,brands:[...c.brands,b]}:c);selectBrand(b.id)}}/>
   <nav>{nav.map(n=><button key={n.id} className={section===n.id?"active":""} onClick={()=>{setSection(n.id);setOpen(false)}}><n.icon/>{n.label}</button>)}</nav>
   <div className="side-bottom">
    <button><CircleHelp/>Help & resources</button>
    <button onClick={()=>setSection("settings")}><Settings/>Settings</button>
    <div className="usage-mini"><div><span>Monthly usage</span><b>183 / 250</b></div><i><span/></i><small>67 prompts remaining</small></div>
    <div className="profile"><span>{displayName.slice(0,2).toUpperCase()||"?"}</span><div><b>{displayName||"…"}</b><small>{displayEmail}</small></div>{demo?<MoreHorizontal/>:<form action="/logout" method="POST"><button className="icon-btn" title="Log out" aria-label="Log out"><LogOut/></button></form>}</div>
   </div>
  </aside>
  <section className="app-content"><header className="app-header"><button className="menu-btn" onClick={()=>setOpen(true)}><Menu/></button><div className="header-search"><Search/><input placeholder="Search prompts, reports, fixes…"/><kbd>⌘ K</kbd></div><div className="header-actions"><button className="icon-btn"><Bell/><i/></button><button className="icon-btn theme-toggle" onClick={toggleTheme} title={theme==='light'?'Switch to dark mode':'Switch to light mode'} aria-label="Toggle theme">{theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button><button className="scan-btn" onClick={scan} disabled={scanning}>{scanning?<LoaderCircle className="spin"/>:<Play/>}{scanning?(scanProgress?`${scanProgress.done}/${scanProgress.total} prompts…`:"Starting…"):"Run scan"}</button></div></header>
    <div className="app-page">{section==="overview"?<Overview demo={demo} brand={activeBrand} refreshKey={refreshKey} scan={scan} scanning={scanning} setSection={setSection} firstName={firstName}/>:section==="prompts"?<Prompts demo={demo} brand={activeBrand} refreshKey={refreshKey}/>:section==="fixes"?<Fixes demo={demo} brand={activeBrand} refreshKey={refreshKey}/>:section==="competitors"?<Competitors demo={demo} brand={activeBrand}/>:section==="reports"?<Reports demo={demo} brand={activeBrand} refreshKey={refreshKey}/>:<SettingsPage demo={demo} brand={activeBrand} ctx={ctx} onBrandUpdated={updated=>setCtx(c=>c?{...c,brands:c.brands.map(b=>b.id===updated.id?{...b,...updated}:b)}:c)}/>}</div>
  </section>
 </main>
}

function BrandSwitcher({demo,ctx,activeBrandId,onSelectBrand,onBrandAdded}:{demo:boolean;ctx:WorkspaceContext|null;activeBrandId?:string;onSelectBrand:(id:string)=>void;onBrandAdded:(b:Brand)=>void}){
 const [modal,setModal]=useState(false),[name,setName]=useState(""),[domain,setDomain]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState("");
 if(demo)return <button className="brand-switch"><span>AC</span><div><b>Acme Software</b><small>Pro plan</small></div><ChevronDown/></button>;
 const active=ctx?.brands.find(b=>b.id===activeBrandId)||ctx?.brands[0];
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
  {modal&&typeof document!=="undefined"&&createPortal(<div className="modal-back"><div className="modal"><button className="modal-x" onClick={()=>setModal(false)}><X/></button><span className="feature-icon"><Users/></span><h2>Your clients</h2>
   {ctx&&ctx.brands.length>0?<ul className="client-list">{ctx.brands.map(b=><li key={b.id}><button type="button" className={b.id===active?.id?"active":""} aria-current={b.id===active?.id||undefined} onClick={()=>{onSelectBrand(b.id);setModal(false)}}><div><b>{b.name}</b><small>{b.domain}</small></div>{b.id===active?.id&&<Check size={15}/>}</button></li>)}</ul>:<p>No clients yet. Add your first client brand to start tracking AI-search visibility.</p>}
   <form onSubmit={addClient}>
    <label>Client name<input required autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Acme Plumbing"/></label>
    <label>Website<input required value={domain} onChange={e=>setDomain(e.target.value)} placeholder="acmeplumbing.com"/></label>
    {error&&<div className="checker-error"><AlertCircle/><div><b>Couldn&apos;t add client</b><p>{error}</p></div></div>}
    <button className="button" disabled={saving}>{saving?"Adding…":"Add client"}</button>
   </form>
  </div></div>,document.body)}
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
  (async()=>{const [{createClient},{getFixes}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/fixes")]);const supabase=createClient();const rows=await getFixes(supabase,brand.id);if(!cancelled)setFixes(rows)})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);
 return fixes;
}

type ScanHistoryEntry={runId:string;completedAt:string|null;score:number;mentions:number;total:number};
function useScanHistory(demo:boolean,brand:Brand|undefined,refreshKey:number){
 const [history,setHistory]=useState<ScanHistoryEntry[]>([]);
 useEffect(()=>{
  if(demo||!brand)return;
  let cancelled=false;
  (async()=>{const r=await fetch(`/api/scan-history?brandId=${encodeURIComponent(brand.id)}`);const j=await r.json().catch(()=>({}));if(!cancelled)setHistory(j.history||[])})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);
 return history;
}

function Sparkline({data}:{data:{score:number;date:string}[]}){
 if(data.length<2)return null;
 const w=180,h=44;
 const scores=data.map(d=>d.score);
 const lo=Math.max(0,Math.min(...scores)-8),hi=Math.min(100,Math.max(...scores)+8);
 const range=hi-lo||1;
 const pts=data.map((d,i)=>`${(i/(data.length-1))*w},${h-((d.score-lo)/range)*h}`).join(" ");
 return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{overflow:"visible",flexShrink:0}}>
  <polyline points={pts} fill="none" stroke="var(--sky,#0EA5E9)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
  {data.map((d,i)=>{const x=(i/(data.length-1))*w;const y=h-((d.score-lo)/range)*h;return <circle key={i} cx={x} cy={y} r={i===data.length-1?4:2.5} fill="var(--sky,#0EA5E9)"/>})}
 </svg>;
}

function Overview({demo,brand,refreshKey,scan,scanning,setSection,firstName}:{demo:boolean;brand?:Brand;refreshKey:number;scan:()=>void;scanning:boolean;setSection:(s:string)=>void;firstName:string}){
 const {scan:latest,loading}=useLatestScan(demo,brand,refreshKey);
 const fixes=useFixes(demo,brand,refreshKey);
 const history=useScanHistory(demo,brand,refreshKey);
 const [overviewTab,setOverviewTab]=useState<"summary"|"traffic"|"rankings">("summary");
 const [promptCount,setPromptCount]=useState<number|null>(null);
 useEffect(()=>{
  if(demo||!brand)return;
  let cancelled=false;
  (async()=>{const [{createClient},{getPrompts}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/prompts")]);const supabase=createClient();const rows=await getPrompts(supabase,brand.id);if(!cancelled)setPromptCount(rows.length)})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);

 const header=<div className="page-title"><div><span className="overline">OVERVIEW</span><h1>Good morning, {firstName} <span>👋</span></h1><p>Here&apos;s how your brand is showing up in AI answers.</p></div><div className="date-control">Last 30 days <ChevronDown/></div></div>;
 const tabBar=<div className="overview-tabs"><button className={overviewTab==="summary"?"active":""} onClick={()=>setOverviewTab("summary")}>Summary</button><button className={overviewTab==="traffic"?"active":""} onClick={()=>setOverviewTab("traffic")}>Traffic &amp; Reach</button><button className={overviewTab==="rankings"?"active":""} onClick={()=>setOverviewTab("rankings")}>Rankings</button></div>;

 if(demo)return <>{header}{tabBar}
  {overviewTab==="summary"&&<>
   <ScoreHero score={67} trend="8.2%" confidence="Full scan"/>
   <div className="stats-grid"><Stat label="Total mentions" value="142" trend="12.4%" icon={Activity}/><Stat label="Average position" value="#2.4" sub="when mentioned" icon={Target}/><Stat label="Prompts tracked" value="183" sub="of 250 monthly" icon={Search}/><Stat label="AI engines" value="6" sub="ChatGPT · Gemini · Perplexity · Claude · DeepSeek · AI Overviews" icon={BarChart3}/></div>
   <div className="dashboard-grid"><article className="panel visibility-panel"><PanelHead title="Visibility trend" sub="Your share of AI answers over time"/><div className="chart-legend"><span><i/>Your brand</span><span><i/>Top competitor</span></div><div className="big-chart"><div className="axis"><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span></div><svg viewBox="0 0 800 260" preserveAspectRatio="none"><defs><linearGradient id="appfill"><stop offset="0" stopColor="#0EA5E9" stopOpacity=".22"/><stop offset="1" stopColor="#0EA5E9" stopOpacity="0"/></linearGradient></defs><path className="grid-lines" d="M0 10H800M0 70H800M0 130H800M0 190H800M0 250H800"/><path className="competitor-line" d="M0 158 C90 144 110 118 190 125 S300 98 380 112 S510 75 590 92 S700 65 800 68"/><path className="trend-area" d="M0 205 C80 195 110 185 170 188 S260 143 330 153 S440 115 510 125 S625 80 690 92 S760 50 800 43 L800 260L0 260Z"/><path className="trend-line" d="M0 205 C80 195 110 185 170 188 S260 143 330 153 S440 115 510 125 S625 80 690 92 S760 50 800 43"/><circle cx="800" cy="43" r="5"/></svg><div className="x-axis"><span>Jun 19</span><span>Jun 25</span><span>Jul 1</span><span>Jul 7</span><span>Jul 13</span><span>Jul 19</span></div></div></article>
   <article className="panel engine-panel"><PanelHead title="Visibility by engine" sub="Last 30 days"/>{demoEngines.map(e=><div className="engine-row" key={e.name}><span className={`engine-logo ${e.color}`}>{e.short}</span><div><b>{e.name}</b><i><span style={{width:e.score+"%"}}/></i></div><strong>{e.score}%</strong></div>)}<button className="panel-link" onClick={()=>setSection("prompts")}>View prompt details <ArrowUpRight/></button></article>
   <article className="panel prompt-panel"><PanelHead title="Recent prompt performance" sub="Latest results across all engines" action={<button onClick={()=>setSection("prompts")}>View all <ArrowUpRight/></button>}/><DemoPromptTable short/></article>
   <article className="panel opportunities"><PanelHead title="Top opportunities" sub="AI-recommended actions ranked by impact" action={<button onClick={()=>setSection("fixes")}>View all</button>}/>{[{t:"Add direct comparison content",p:"Your competitors win 14 prompts with comparison pages.",impact:"High",lift:"+12–18%"},{t:"Strengthen third-party citations",p:"AI engines cite 3 sources that don't mention your brand.",impact:"High",lift:"+8–14%"},{t:"Add SoftwareApplication schema",p:"Help engines understand your product entity and pricing.",impact:"Med",lift:"+4–7%"}].map(o=><div className="opportunity" key={o.t}><span className="opp-icon"><Sparkles/></span><div><b>{o.t}</b><p>{o.p}</p><small><em className={o.impact==="High"?"high":"medium"}>{o.impact} impact</em>Estimated lift <strong>{o.lift}</strong></small></div><button onClick={()=>setSection("fixes")}>Fix this <ArrowUpRight/></button></div>)}</article>
   </div>
  </>}
  {overviewTab==="traffic"&&<GscTrafficTab demo brandId={undefined}/>}
  {overviewTab==="rankings"&&<RankingsDetail demo answers={[]}/>}
 </>;

 if(!brand)return <>{header}{tabBar}<p>Add a client to start tracking AI visibility.</p></>;
 if(loading)return <>{header}{tabBar}<p>Loading…</p></>;
 if(!latest)return <>{header}{tabBar}<div className="panel" style={{padding:"24px"}}><p>No scans yet for {brand.name}. Click <b>Run scan</b> above to check its AI visibility for the first time.</p></div></>;

 const summary=summarizeScan(latest);
 const byEngine=groupByEngine(latest.answers);
 const prevScan=history.length>=2?history[history.length-2]:null;
 const delta=prevScan!=null?summary.score-prevScan.score:null;
 const sparkData=history.map(h=>({score:h.score,date:h.completedAt||""}));

 return <>{header}{tabBar}
  {overviewTab==="summary"&&<>
   <ScoreHero score={summary.score} confidence={coverageLabel(latest.confidence??0)} delta={delta} sparkData={sparkData}/>
   <div className="stats-grid">
    <Stat label="Total mentions" value={String(summary.mentions)} sub={`of ${summary.total} answers checked`} icon={Activity}/>
    <Stat label="Average position" value={summary.avgPosition!=null?`#${summary.avgPosition}`:"—"} sub="when mentioned" icon={Target}/>
    <Stat label="Scans run" value={String(history.length||1)} sub={history.length>1?`first scan ${new Date(history[0]?.completedAt||"").toLocaleDateString()}`:"baseline scan"} icon={Search}/>
    <Stat label="AI engines" value="6" sub="ChatGPT · Gemini · Perplexity · Claude · DeepSeek · AI Overviews" icon={BarChart3}/>
   </div>
   <div className="dashboard-grid">
    <article className="panel engine-panel"><PanelHead title="Visibility by engine" sub="Most recent scan"/>{byEngine.map(e=><div className="engine-row" key={e.key}><span className={`engine-logo ${e.color}`}>{e.short}</span><div><b>{e.name}</b><i><span style={{width:e.pct+"%"}}/></i></div><strong>{e.pct}%</strong></div>)}<button className="panel-link" onClick={()=>setSection("prompts")}>View prompt details <ArrowUpRight/></button></article>
    <article className="panel prompt-panel"><PanelHead title="Recent prompt performance" sub="Latest results across all engines" action={<button onClick={()=>setSection("prompts")}>View all <ArrowUpRight/></button>}/><RealPromptTable answers={latest.answers.slice(0,4)}/></article>
   </div>
   {fixes.length>0&&<article className="panel opportunities" style={{marginTop:"14px"}}><PanelHead title="Top AI-generated fixes" sub="Claude&apos;s recommendations from your most recent scan" action={<button onClick={()=>setSection("fixes")}>View all <ArrowUpRight/></button>}/>{fixes.slice(0,3).map(f=><div className="opportunity" key={f.id}><span className="opp-icon"><Sparkles/></span><div><b>{f.title}</b><p>{f.rationale}</p><small><em className={(f.impact_high||0)>=12?"high":"medium"}>{(f.impact_high||0)>=12?"High":"Med"} impact</em>Estimated lift <strong>+{f.impact_low}–{f.impact_high}%</strong></small></div><button onClick={()=>setSection("fixes")}>View fix <ArrowUpRight/></button></div>)}</article>}
  </>}
  {overviewTab==="traffic"&&<GscTrafficTab demo={false} brandId={brand?.id}/>}
  {overviewTab==="rankings"&&<RankingsDetail demo={false} answers={latest.answers}/>}
 </>;
}

function scoreRating(s:number){if(s>=70)return{label:"Strong",color:"var(--em,#10B981)"};if(s>=50)return{label:"Good",color:"var(--sky,#0EA5E9)"};if(s>=30)return{label:"Fair",color:"var(--am,#F59E0B)"};if(s>=10)return{label:"Weak",color:"#F97316"};return{label:"Critical",color:"var(--cr,#EF4444)"}}
function coverageLabel(value:number){return value>=70?"Full scan":value>=40?"Partial scan":"Limited data"}
function groupByEngine(answers:ScanAnswerRow[]){
 const byKey=new Map<string,ScanAnswerRow[]>();
 for(const a of answers){const list=byKey.get(a.engine)??[];list.push(a);byKey.set(a.engine,list)}
 return Array.from(byKey.entries()).map(([key,list])=>{const meta=engineByKey[key]||{name:key,short:key[0]?.toUpperCase()||"?",color:"green"};const pct=list.length?Math.round(list.filter(a=>a.brand_mentioned).length/list.length*100):0;return {key,name:meta.name,short:meta.short,color:meta.color,pct}});
}

const ENG_KEY_MAP:Record<string,string>={ChatGPT:"openai",Gemini:"gemini",Perplexity:"perplexity",Claude:"anthropic",DeepSeek:"deepseek","AI Overviews":"ai_overviews"};
function fmtNum(n:number){if(n>=1_000_000)return(n/1_000_000).toFixed(1)+"M";if(n>=1_000)return(n/1_000).toFixed(0)+"K";return n.toString()}

type GscData={connected:boolean;propertyUrl?:string;overview:{impressions:number;clicks:number;ctr:number;position:number};queries:{query:string;impressions:number;clicks:number;ctr:number;position:number}[];trend:{date:string;impressions:number;clicks:number}[]};

function GscTrafficTab({demo,brandId}:{demo:boolean;brandId?:string}){
 const [status,setStatus]=useState<"idle"|"loading"|"connected"|"disconnected"|"error">("idle");
 const [data,setData]=useState<GscData|null>(null);
 const [disconnecting,setDisconnecting]=useState(false);
 const [retryKey,setRetryKey]=useState(0);
 useEffect(()=>{
  if(demo||!brandId){setStatus("disconnected");return}
  setStatus("loading");
  fetch(`/api/gsc/metrics?brandId=${brandId}`)
   .then(r=>r.json())
   .then((d:GscData)=>{if(d.connected){setData(d);setStatus("connected")}else setStatus("disconnected")})
   .catch(()=>setStatus("error"));
 },[demo,brandId,retryKey]);
 async function disconnect(){
  if(!brandId)return;
  setDisconnecting(true);
  try{await fetch(`/api/gsc/disconnect?brandId=${brandId}`,{method:"DELETE"});setStatus("disconnected");setData(null)}
  finally{setDisconnecting(false)}
 }
 if(status==="loading")return <div style={{padding:"48px",textAlign:"center",color:"var(--muted)"}}><LoaderCircle size={24} style={{animation:"spin 1s linear infinite",display:"inline-block"}}/><p style={{marginTop:"12px",fontSize:"13px"}}>Loading Search Console data…</p></div>;
 if(status==="error")return <article className="panel" style={{padding:"40px",textAlign:"center"}}><AlertCircle size={28} color="var(--cr)"/><p style={{marginTop:"12px",fontSize:"14px",color:"var(--ink)"}}>Failed to load Search Console data</p><button className="button outline" style={{marginTop:"16px"}} onClick={()=>setRetryKey(k=>k+1)}>Retry</button></article>;
 if(status==="disconnected"||status==="idle")return(
  <article className="panel" style={{padding:"56px 32px",textAlign:"center"}}>
   <div style={{width:"60px",height:"60px",borderRadius:"16px",background:"color-mix(in srgb,var(--sky) 12%,transparent)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}}><TrendingUp size={30} color="var(--sky)"/></div>
   <h3 style={{fontSize:"18px",fontWeight:700,margin:"0 0 8px"}}>Connect Google Search Console</h3>
   <p style={{fontSize:"13px",color:"var(--muted)",maxWidth:"400px",margin:"0 auto 24px",lineHeight:1.7}}>See your real impressions, clicks, CTR, and ranking positions from Google Search — updated daily.</p>
   {!demo&&brandId
    ?<a href={`/api/gsc/auth?brandId=${brandId}`} className="button" style={{textDecoration:"none",display:"inline-flex",alignItems:"center",gap:"7px"}}><Link2 size={15}/>Connect Google Search Console</a>
    :<button className="button" disabled>Connect Google Search Console</button>}
   <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"16px"}}>Read-only access · you can disconnect any time</p>
  </article>
 );
 if(status==="connected"&&data){
  const maxImp=Math.max(1,...data.trend.map(t=>t.impressions));
  return <div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px",marginBottom:"14px"}}>
    <article className="panel" style={{padding:"18px 20px",borderLeft:"4px solid var(--sky)"}}>
     <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"4px"}}>Impressions</div>
     <div style={{fontSize:"38px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--sky)",letterSpacing:"-1.5px",lineHeight:1}}>{fmtNum(data.overview.impressions)}</div>
     <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"4px"}}>last 28 days</div>
    </article>
    <article className="panel" style={{padding:"18px 20px",borderLeft:"4px solid var(--em)"}}>
     <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"4px"}}>Clicks</div>
     <div style={{fontSize:"38px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--em)",letterSpacing:"-1.5px",lineHeight:1}}>{fmtNum(data.overview.clicks)}</div>
     <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"4px"}}>last 28 days</div>
    </article>
    <article className="panel" style={{padding:"18px 20px"}}>
     <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"4px"}}>Avg CTR</div>
     <div style={{fontSize:"38px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--ink)",letterSpacing:"-1.5px",lineHeight:1}}>{data.overview.ctr}%</div>
     <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"4px"}}>click-through rate</div>
    </article>
    <article className="panel" style={{padding:"18px 20px"}}>
     <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"4px"}}>Avg Position</div>
     <div style={{fontSize:"38px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--ink)",letterSpacing:"-1.5px",lineHeight:1}}>#{data.overview.position}</div>
     <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"4px"}}>in Google Search</div>
    </article>
   </div>
   {data.trend.length>0&&<article className="panel" style={{padding:"20px 24px",marginBottom:"14px"}}>
    <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"12px"}}>Daily impressions — last 28 days</div>
    <div style={{display:"flex",gap:"3px",alignItems:"flex-end",height:"54px"}}>
     {data.trend.map((t,i)=><div key={i} title={`${t.date}: ${fmtNum(t.impressions)}`}
      style={{flex:1,background:"var(--sky)",borderRadius:"2px 2px 0 0",opacity:.5+(t.impressions/maxImp)*.5,height:`${Math.max(4,(t.impressions/maxImp)*54)}px`,transition:"height .2s"}}/>)}
    </div>
   </article>}
   {data.queries.length>0&&<article className="panel" style={{marginBottom:"14px"}}>
    <div className="panel-head"><div><h3>Top queries</h3><p>Search terms driving the most impressions in the last 28 days</p></div></div>
    <div className="table-wrap"><table><thead><tr><th>Query</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Avg position</th></tr></thead>
    <tbody>{data.queries.map((q,i)=><tr key={i}>
     <td style={{maxWidth:"320px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.query}</td>
     <td style={{fontVariantNumeric:"tabular-nums"}}>{fmtNum(q.impressions)}</td>
     <td style={{fontVariantNumeric:"tabular-nums"}}>{fmtNum(q.clicks)}</td>
     <td>{q.ctr}%</td>
     <td>#{q.position}</td>
    </tr>)}</tbody></table></div>
   </article>}
   <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:"11px",color:"var(--muted)",padding:"0 2px"}}>
    <span>Connected: {data.propertyUrl}</span>
    <button onClick={disconnect} disabled={disconnecting} style={{fontSize:"11px",color:"var(--cr)",background:"none",border:"none",cursor:"pointer",padding:"4px 8px",borderRadius:"5px"}}>{disconnecting?"Disconnecting…":"Disconnect GSC"}</button>
   </div>
  </div>;
 }
 return null;
}

function RankingsDetail({demo,answers}:{demo:boolean;answers:ScanAnswerRow[]}){
 const allAnswers=demo?demoPrompts.map((p,i)=>({id:String(i),engine:ENG_KEY_MAP[p.engine]||p.engine,brand_mentioned:p.status==="Mentioned",position:p.position,sentiment:"positive" as const,prompt_id:String(i),prompts:{query:p.q}})):answers;
 const mentioned=allAnswers.filter(a=>a.brand_mentioned);
 const notMentioned=allAnswers.filter(a=>!a.brand_mentioned);
 const posDist:{[k:number]:number}={};
 for(const a of mentioned){if(a.position){posDist[a.position]=(posDist[a.position]||0)+1}}
 const maxPosCnt=Math.max(1,...Object.values(posDist));
 const bestPos=Object.keys(posDist).length?Math.min(...Object.keys(posDist).map(Number)):null;
 type PromptBest={query:string;engine:string;position:number};
 const promptBest=new Map<string,PromptBest>();
 for(const a of mentioned){if(a.position&&a.prompts){const ex=promptBest.get(a.prompt_id);if(!ex||a.position<ex.position)promptBest.set(a.prompt_id,{query:a.prompts.query,engine:a.engine,position:a.position})}}
 const topPrompts=[...promptBest.values()].sort((a,b)=>a.position-b.position).slice(0,5);
 type MissedInfo={query:string;engineCount:number};
 const missedMap=new Map<string,MissedInfo>();
 for(const a of notMentioned){if(a.prompts&&!promptBest.has(a.prompt_id)){const ex=missedMap.get(a.prompt_id)||{query:a.prompts.query,engineCount:0};ex.engineCount++;missedMap.set(a.prompt_id,ex)}}
 const missed=[...missedMap.values()].sort((a,b)=>b.engineCount-a.engineCount).slice(0,5);
 const byEngineData=groupByEngine(allAnswers).map(e=>{const ea=allAnswers.filter(a=>a.engine===e.key);const em=ea.filter(a=>a.brand_mentioned);const pos=em.map(a=>a.position).filter((p):p is number=>p!=null);const avgPos=pos.length?Math.round(pos.reduce((s,p)=>s+p,0)/pos.length*10)/10:null;const pos_pct=em.length?Math.round(em.filter(a=>a.sentiment==="positive").length/em.length*100):0;return{...e,total:ea.length,avgPos,pos_pct}});
 return <div>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px",marginBottom:"14px"}}>
   <article className="panel" style={{padding:"16px 20px"}}><div style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",fontWeight:700,letterSpacing:"1px"}}>Mentioned</div><div style={{fontSize:"36px",fontWeight:800,fontFamily:"Outfit",color:"var(--em)",letterSpacing:"-1px",marginTop:"4px"}}>{mentioned.length}</div><div style={{fontSize:"12px",color:"var(--muted)"}}>of {allAnswers.length} answers</div></article>
   <article className="panel" style={{padding:"16px 20px"}}><div style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",fontWeight:700,letterSpacing:"1px"}}>Best position</div><div style={{fontSize:"36px",fontWeight:800,fontFamily:"Outfit",color:"var(--sky)",letterSpacing:"-1px",marginTop:"4px"}}>{bestPos!=null?`#${bestPos}`:"—"}</div><div style={{fontSize:"12px",color:"var(--muted)"}}>highest rank recorded</div></article>
   <article className="panel" style={{padding:"16px 20px"}}><div style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",fontWeight:700,letterSpacing:"1px"}}>Missed prompts</div><div style={{fontSize:"36px",fontWeight:800,fontFamily:"Outfit",color:"var(--am)",letterSpacing:"-1px",marginTop:"4px"}}>{missed.length}</div><div style={{fontSize:"12px",color:"var(--muted)"}}>opportunities to win</div></article>
  </div>
  {Object.keys(posDist).length>0&&<article className="panel" style={{marginBottom:"14px",padding:"20px"}}>
   <h3 style={{margin:"0 0 14px",font:"700 13px 'Outfit',system-ui",color:"var(--ink)"}}>Position distribution</h3>
   <div style={{display:"grid",gap:"8px"}}>{[1,2,3,4,5].map(pos=><div key={pos} style={{display:"grid",gridTemplateColumns:"32px 1fr 32px",alignItems:"center",gap:"10px"}}>
    <span style={{fontSize:"12px",fontWeight:700,color:"var(--muted)"}}>#{pos}</span>
    <div style={{height:"10px",background:"var(--line)",borderRadius:"5px",overflow:"hidden"}}><div style={{height:"100%",width:`${((posDist[pos]||0)/maxPosCnt)*100}%`,background:"var(--sky)",borderRadius:"5px"}}/></div>
    <span style={{fontSize:"12px",fontWeight:700,color:"var(--ink)",textAlign:"right"}}>{posDist[pos]||0}</span>
   </div>)}</div>
  </article>}
  <article className="panel" style={{marginBottom:"14px"}}>
   <div className="panel-head"><div><h3>Rankings by engine</h3><p>Visibility, average position, and sentiment per AI engine</p></div></div>
   <div className="table-wrap"><table><thead><tr><th>Engine</th><th>Mention rate</th><th>Avg position</th><th>Positive sentiment</th><th>Answers</th></tr></thead>
   <tbody>{byEngineData.map(e=><tr key={e.key}><td><div style={{display:"flex",alignItems:"center",gap:"8px"}}><span className={`engine-logo ${e.color}`}>{e.short}</span><b>{e.name}</b></div></td><td><span style={{fontWeight:700,color:e.pct>=50?"var(--em)":e.pct>=25?"var(--sky)":"var(--cr)"}}>{e.pct}%</span></td><td>{e.avgPos!=null?`#${e.avgPos}`:"—"}</td><td>{e.pct>0?`${e.pos_pct}%`:"—"}</td><td style={{color:"var(--muted)"}}>{e.total}</td></tr>)}
   </tbody></table></div>
  </article>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
   {topPrompts.length>0&&<article className="panel"><div className="panel-head"><div><h3>Best performing</h3><p>Prompts where you rank highest</p></div></div><div>{topPrompts.map((p,i)=><div key={i} style={{display:"flex",gap:"10px",alignItems:"flex-start",padding:"10px 16px",borderBottom:"1px solid var(--line)"}}><span style={{fontSize:"20px",fontWeight:800,fontFamily:"Outfit",color:"var(--em)",minWidth:"34px",letterSpacing:"-1px"}}>#{p.position}</span><div><div style={{fontSize:"12px",fontWeight:600,color:"var(--ink)",lineHeight:1.4}}>{p.query}</div><div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>{engineByKey[p.engine]?.name||p.engine}</div></div></div>)}</div></article>}
   {missed.length>0&&<article className="panel"><div className="panel-head"><div><h3>Missed opportunities</h3><p>Prompts where you&apos;re not mentioned</p></div></div><div>{missed.map((p,i)=><div key={i} style={{display:"flex",gap:"10px",alignItems:"flex-start",padding:"10px 16px",borderBottom:"1px solid var(--line)"}}><span style={{fontSize:"16px",fontWeight:700,color:"var(--cr)",minWidth:"34px",paddingTop:"2px"}}>✗</span><div><div style={{fontSize:"12px",fontWeight:600,color:"var(--ink)",lineHeight:1.4}}>{p.query}</div><div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>Missed by {p.engineCount} engine{p.engineCount!==1?"s":""}</div></div></div>)}</div></article>}
  </div>
 </div>
}

function Stat({label,value,trend,sub,confidence,icon:Icon}:{label:string;value:string;trend?:string;sub?:string;confidence?:string;icon:any}){return <article className="stat"><div><span>{label}</span><b>{value}</b>{trend?<small className="up"><ArrowUpRight/>{trend} <em>vs last period</em></small>:<small>{sub}</small>}{confidence&&<span className="confidence-tag">{confidence}</span>}</div><span className="stat-icon"><Icon/></span></article>}
function ScoreHero({score,trend,confidence,delta,sparkData}:{score:number|string;trend?:string;confidence?:string;delta?:number|null;sparkData?:{score:number;date:string}[]}){
 const numScore=typeof score==="number"?score:parseInt(String(score))||0;
 const rating=scoreRating(numScore);
 const showDelta=delta!=null&&delta!==0;
 const deltaColor=delta!=null&&delta>=0?"var(--em,#10B981)":"#ef4444";
 const deltaSign=delta!=null&&delta>0?"+":"";
 return <div style={{background:"var(--surface,#fff)",border:"1px solid var(--line)",borderRadius:"10px",padding:"24px 28px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"32px",borderLeft:`4px solid ${rating.color}`}}>
  <div>
   <span style={{display:"block",fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted,#64748B)",marginBottom:"4px"}}>AI Visibility Score</span>
   <div style={{display:"flex",alignItems:"baseline",gap:"14px"}}>
    <span style={{fontSize:"76px",fontWeight:800,lineHeight:1,fontFamily:"Outfit,system-ui,sans-serif",color:rating.color,letterSpacing:"-4px"}}>{score}</span>
    <span style={{fontSize:"22px",fontWeight:800,fontFamily:"Outfit,system-ui",color:rating.color,letterSpacing:"-0.5px",opacity:.75}}>{rating.label}</span>
   </div>
   <div style={{marginTop:"10px",display:"flex",gap:"6px",flexWrap:"wrap",alignItems:"center"}}>
    {confidence&&<span className="confidence-tag" style={{display:"inline-block"}}>{confidence}</span>}
    <span style={{fontSize:"10px",fontWeight:600,padding:"3px 8px",borderRadius:"99px",background:`color-mix(in srgb,${rating.color} 12%,transparent)`,color:rating.color}}>{numScore>=70?"Regularly mentioned in AI answers":numScore>=50?"Solid AI presence, room to grow":numScore>=30?"Appearing occasionally — gaps to close":numScore>=10?"Rarely mentioned — needs optimization":"Not visible in AI answers — urgent"}</span>
   </div>
  </div>
  {sparkData&&sparkData.length>=2&&<div style={{marginLeft:"auto",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"8px"}}><Sparkline data={sparkData}/>{showDelta&&<span style={{fontSize:"20px",fontWeight:700,fontFamily:"Outfit,system-ui",color:deltaColor,letterSpacing:"-0.5px"}}>{deltaSign}{delta} pts vs last scan</span>}{sparkData.length>0&&<span style={{fontSize:"11px",color:"var(--muted,#64748B)"}}>{sparkData.length} scan{sparkData.length!==1?"s":""} tracked</span>}</div>}
  {trend&&!sparkData&&<div style={{marginLeft:"auto",textAlign:"right"}}><span style={{display:"block",fontSize:"28px",fontWeight:700,fontFamily:"Outfit,system-ui",color:"var(--em,#10B981)",letterSpacing:"-1px"}}>↑{trend}</span><span style={{fontSize:"12px",color:"var(--muted,#64748B)"}}>vs last period</span></div>}
 </div>;
}
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
 const [editId,setEditId]=useState<string|null>(null);
 const [editText,setEditText]=useState("");
 const [newQuery,setNewQuery]=useState("");
 const [saving,setSaving]=useState(false);
 const {scan:latest}=useLatestScan(demo,brand,refreshKey);

 async function loadPrompts(){
  if(!brand)return;
  const r=await fetch(`/api/prompts?brandId=${encodeURIComponent(brand.id)}`);
  const j=await r.json().catch(()=>({}));
  setPrompts(j.prompts||[]);
 }

 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{setLoading(true);const r=await fetch(`/api/prompts?brandId=${encodeURIComponent(brand.id)}`);const j=await r.json().catch(()=>({}));if(!cancelled){setPrompts(j.prompts||[]);setLoading(false)}})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);

 async function saveEdit(promptId:string){
  if(!editText.trim())return;
  setSaving(true);
  await fetch("/api/prompts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({promptId,query:editText})});
  setSaving(false);setEditId(null);await loadPrompts();
 }
 async function deletePrompt(promptId:string){
  if(!confirm("Remove this prompt? It won't be used in future scans."))return;
  await fetch("/api/prompts",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({promptId})});
  await loadPrompts();
 }
 async function addPrompt(e:React.FormEvent){
  e.preventDefault();if(!brand||!newQuery.trim())return;
  setSaving(true);
  await fetch("/api/prompts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({brandId:brand.id,query:newQuery.trim()})});
  setSaving(false);setNewQuery("");setModal(false);await loadPrompts();
 }

 if(demo)return <><div className="page-title"><div><span className="overline">MONITORING</span><h1>Tracked prompts</h1><p>Questions your customers ask AI engines.</p></div><button className="scan-btn" onClick={()=>setModal(true)}><Plus/>Add prompt</button></div><div className="filterbar"><div><Search/><input placeholder="Search prompts…"/></div><button>All engines <ChevronDown/></button><button>All statuses <ChevronDown/></button></div><article className="panel prompt-full"><DemoPromptTable/></article>{modal&&<div className="modal-back"><div className="modal"><button className="modal-x" onClick={()=>setModal(false)}><X/></button><span className="feature-icon"><Search/></span><h2>Add a buyer prompt</h2><p>Track a question your customers ask before choosing a product.</p><label>Prompt<input autoFocus placeholder="e.g. Best analytics tools for startups"/></label><label>Engines<div className="check-grid">{engines.map(e=><span key={e.name}><Check/>{e.name}</span>)}</div></label><button className="button" onClick={()=>setModal(false)}>Add prompt</button></div></div>}</>;

 if(!brand)return <div className="page-title"><div><span className="overline">MONITORING</span><h1>Tracked prompts</h1><p>Add a client first — its buyer-intent prompts are generated automatically.</p></div></div>;

 return <><div className="page-title"><div><span className="overline">MONITORING</span><h1>Tracked prompts for {brand.name}</h1><p>Each question is checked against every AI engine. Run a scan to see where you appear.</p></div><button className="scan-btn" onClick={()=>setModal(true)}><Plus/>Add prompt</button></div>
  {loading?<p>Loading…</p>:<>
   {latest&&<article className="panel prompt-full" style={{marginBottom:"14px"}}><PromptMatrix prompts={prompts} answers={latest.answers}/></article>}
   <article className="panel prompt-full">
    <div className="panel-head"><div><h3>Prompt list</h3><p>Click any prompt to edit. Changes take effect on the next scan.</p></div></div>
    <div style={{padding:"0 0 8px"}}>
     {prompts.map(p=><div key={p.id} style={{display:"flex",alignItems:"flex-start",gap:"10px",padding:"10px 16px",borderBottom:"1px solid var(--line)"}}>
      {editId===p.id
       ?<><textarea autoFocus value={editText} onChange={e=>setEditText(e.target.value)} rows={2} style={{flex:1,resize:"vertical",fontSize:"13px",padding:"6px 8px",borderRadius:"6px",border:"1px solid var(--sky,#0EA5E9)",fontFamily:"inherit"}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();saveEdit(p.id)}if(e.key==="Escape")setEditId(null)}}/><button className="button" style={{padding:"5px 12px",fontSize:"12px"}} onClick={()=>saveEdit(p.id)} disabled={saving}>{saving?"…":"Save"}</button><button className="icon-btn" onClick={()=>setEditId(null)} title="Cancel"><X/></button></>
       :<><span style={{flex:1,fontSize:"13px",lineHeight:1.5,cursor:"pointer",color:"var(--text)"}} onClick={()=>{setEditId(p.id);setEditText(p.query)}}>{p.query}</span><button className="icon-btn" title="Edit" onClick={()=>{setEditId(p.id);setEditText(p.query)}}><Edit2 size={13}/></button><button className="icon-btn" title="Remove" onClick={()=>deletePrompt(p.id)}><Trash2 size={13}/></button></>}
     </div>)}
     {!prompts.length&&<p style={{padding:"14px 16px",color:"var(--muted)",fontSize:"13px"}}>No prompts yet.</p>}
    </div>
   </article>
  </>}
  {modal&&<div className="modal-back"><div className="modal"><button className="modal-x" onClick={()=>setModal(false)}><X/></button><span className="feature-icon"><Search/></span><h2>Add a prompt</h2><p>Write a question a buyer would ask when researching your category.</p><form onSubmit={addPrompt}><label>Prompt<input autoFocus required value={newQuery} onChange={e=>setNewQuery(e.target.value)} placeholder="e.g. Best greeting cards to send for birthdays"/></label><button className="button" disabled={saving}>{saving?"Adding…":"Add prompt"}</button></form></div></div>}
 </>;
}

function Fixes({demo,brand,refreshKey}:{demo:boolean;brand?:Brand;refreshKey:number}){
 const [fixesTab,setFixesTab]=useState<"fixes"|"seo">("fixes");
 const [fixes,setFixes]=useState<Fix[]>([]);
 const [loading,setLoading]=useState(!demo);
 const [updatingId,setUpdatingId]=useState<string|null>(null);

 async function loadFixes(){
  if(!brand)return;
  const [{createClient},{getFixes}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/fixes")]);
  const supabase=createClient();
  setFixes(await getFixes(supabase,brand.id));
 }

 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{setLoading(true);const [{createClient},{getFixes}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/fixes")]);const supabase=createClient();const rows=await getFixes(supabase,brand.id);if(!cancelled){setFixes(rows);setLoading(false)}})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);

 async function setStatus(fixId:string,status:string){
  setUpdatingId(fixId);
  await fetch("/api/fixes/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({fixId,status})});
  setUpdatingId(null);await loadFixes();
 }

 const pageHeader=<div className="page-title"><div><span className="overline">AI FIX GENERATOR</span><h1>Turn gaps into growth</h1><p>{demo?"Actionable recommendations based on where competitors beat you.":brand?`Recommendations for ${brand.name} from your most recent scan.`:"Add a client and run a scan to generate recommendations."}</p></div></div>;
 const tabBar=<div className="overview-tabs" style={{marginBottom:"14px"}}><button className={fixesTab==="fixes"?"active":""} onClick={()=>setFixesTab("fixes")}><WandSparkles size={14}/>AI Visibility Fixes</button><button className={fixesTab==="seo"?"active":""} onClick={()=>setFixesTab("seo")}><Globe size={14}/>SEO Audit</button></div>;

 if(fixesTab==="seo") return <>{pageHeader}{tabBar}<SeoAuditTab demo={demo} domain={demo?"acme.co":(brand?.domain||"")}/></>;

 if(demo)return <>{pageHeader}{tabBar}<div className="fix-grid">{[{type:"CONTENT",title:"Create an alternatives comparison page",desc:"You're absent from 8 high-intent prompts where direct competitors have detailed comparison pages.",lift:"12–18%",effort:"~25 min",color:"purple"},{type:"AUTHORITY",title:"Earn mentions from 3 cited sources",desc:"These publications appear in 41% of winning answers but don't currently mention Acme.",lift:"8–14%",effort:"~2 hrs",color:"green"},{type:"TECHNICAL",title:"Add SoftwareApplication schema",desc:"Clarify your product category, pricing, features, and reviews for answer engines.",lift:"4–7%",effort:"~10 min",color:"blue"}].map((f,i)=><article className="fix-card" key={f.title}><div><span className={`fix-type ${f.color}`}>{f.type}</span><em>#{i+1}</em></div><span className="big-fix-icon"><WandSparkles/></span><h3>{f.title}</h3><p>{f.desc}</p><div className="lift"><span>Estimated lift<b>{f.lift}</b></span><span>Time to implement<b>{f.effort}</b></span></div><button className="button">Generate fix <Sparkles/></button></article>)}</div></>;

 if(!brand)return <>{pageHeader}{tabBar}<p style={{color:"var(--muted)",fontSize:"13px"}}>Add a client first to generate AI fixes.</p></>;
 if(loading)return <>{pageHeader}{tabBar}</>;
 if(!fixes.length)return <>{pageHeader}{tabBar}<div className="panel" style={{padding:"32px",textAlign:"center"}}><WandSparkles style={{width:"32px",color:"var(--faint)",marginBottom:"12px"}}/><p style={{margin:"0 0 6px",fontWeight:600}}>No fixes yet for {brand.name}</p><p style={{margin:0,fontSize:"13px",color:"var(--muted)"}}>Click <b>Run scan</b> — Claude generates fix suggestions automatically from the results.</p></div></>;

 const colorFor=(category:string)=>({schema:"blue",content:"purple",authority:"green",reviews:"orange",gbp:"orange"} as Record<string,string>)[category]||"purple";
 const statusColor:Record<string,string>={pending:"var(--muted,#64748B)",implementing:"var(--sky,#0EA5E9)",done:"var(--em,#10B981)"};
 const statusLabel:Record<string,string>={pending:"Pending",implementing:"Implementing",done:"Done ✓"};

 return <>{pageHeader}{tabBar}
  <div className="fix-grid">{fixes.map((f,i)=>{const busy=updatingId===f.id;const st=f.status||"pending";return <article className="fix-card" key={f.id}><div><span className={`fix-type ${colorFor(f.category)}`}>{f.category.toUpperCase()}</span><em>#{i+1}</em></div><span className="big-fix-icon"><WandSparkles/></span><h3>{f.title}</h3><p>{f.rationale}</p>{f.generated_content&&<FixContent content={f.generated_content}/>}<div className="lift"><span>Estimated lift<b>+{f.impact_low}–{f.impact_high}%</b></span><span>Status<b style={{color:statusColor[st]||"var(--muted)"}}>{statusLabel[st]||st}</b></span></div><div style={{display:"flex",gap:"6px",marginTop:"10px"}}>{(["pending","implementing","done"] as const).map(s=><button key={s} onClick={()=>setStatus(f.id,s)} disabled={busy||st===s} style={{flex:1,padding:"5px 0",fontSize:"11px",borderRadius:"6px",border:`1px solid ${st===s?statusColor[s]:"var(--line)"}`,background:st===s?statusColor[s]:"transparent",color:st===s?"#fff":"var(--muted)",cursor:st===s?"default":"pointer",fontWeight:st===s?700:400,transition:"all 0.15s"}}>{busy&&st!==s?"…":statusLabel[s]}</button>)}</div></article>})}
  </div>
 </>;
}

type SeoCheck={id:string;label:string;category:"technical"|"meta"|"content"|"social"|"schema";status:"pass"|"warning"|"fail";message:string;recommendation?:string};
type SeoAuditResult={checks:SeoCheck[];seoScore:number;domain:string;fetchError:string|null};

function SeoAuditTab({demo,domain}:{demo:boolean;domain:string}){
 const [audit,setAudit]=useState<SeoAuditResult|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");

 async function runAudit(){
  if(!domain){setError("No domain configured. Add a domain in brand settings.");return}
  setLoading(true);setError("");
  const r=await fetch(`/api/seo-audit?domain=${encodeURIComponent(domain)}`);
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.error)setError(j.error||"SEO audit failed. Try again.");
  else setAudit(j);
  setLoading(false);
 }

 if(demo){
  const da:SeoAuditResult={seoScore:72,domain:"acme.co",fetchError:null,checks:[
   {id:"https",label:"HTTPS enabled",category:"technical",status:"pass",message:"Site uses HTTPS encryption"},
   {id:"title",label:"Page title",category:"meta",status:"pass",message:'Title: "Acme Software - AI Workflow Tools" (38 chars)'},
   {id:"meta_description",label:"Meta description",category:"meta",status:"warning",message:"Found (95 chars)",recommendation:"Description too short — aim for 100–160 characters"},
   {id:"h1",label:"H1 heading",category:"content",status:"pass",message:"Single H1 tag found ✓"},
   {id:"h2",label:"H2 subheadings",category:"content",status:"pass",message:"4 H2 headings found"},
   {id:"og_tags",label:"Open Graph tags",category:"social",status:"warning",message:"og:title ✓  og:description ✓  og:image ✗",recommendation:"Add og:image for better social media previews"},
   {id:"twitter_card",label:"Twitter/X Card",category:"social",status:"pass",message:"Twitter Card meta tag found"},
   {id:"canonical",label:"Canonical URL",category:"technical",status:"pass",message:"Canonical tag present"},
   {id:"schema",label:"Structured data (Schema.org)",category:"schema",status:"fail",message:"No structured data found",recommendation:"Add Schema.org markup (Organization or SoftwareApplication) — AI engines use structured data to cite and understand your brand"},
   {id:"viewport",label:"Mobile viewport",category:"technical",status:"pass",message:"Viewport meta tag present — mobile-friendly"},
   {id:"img_alt",label:"Image alt text",category:"content",status:"warning",message:"8/12 images have alt text",recommendation:"Add descriptive alt text to 4 images"},
  ]};
  return <SeoAuditResults audit={da}/>;
 }

 if(loading)return <div style={{textAlign:"center",padding:"60px 40px"}}><LoaderCircle className="spin" style={{width:"32px",color:"var(--sky)"}}/><p style={{marginTop:"12px",color:"var(--muted)",fontSize:"13px"}}>Auditing {domain}…</p></div>;
 if(error)return <div style={{maxWidth:"480px"}}><div className="checker-error"><AlertCircle/><div><b>Audit failed</b><p>{error}</p></div></div><button className="button" style={{marginTop:"12px"}} onClick={runAudit}>Try again</button></div>;

 if(!audit)return <div style={{textAlign:"center",padding:"60px 40px"}}>
  <Globe style={{width:"40px",color:"var(--faint)",marginBottom:"16px"}}/>
  <h3 style={{margin:"0 0 8px",font:"700 18px 'Outfit',system-ui",color:"var(--ink)"}}>Technical SEO Audit</h3>
  <p style={{color:"var(--muted)",fontSize:"13px",maxWidth:"360px",margin:"0 auto 24px",lineHeight:1.6}}>Check your website for SEO issues that impact both traditional search rankings and AI engine visibility — schema, meta tags, content structure, and more.</p>
  {!domain?<p style={{color:"var(--cr)",fontSize:"12px"}}>No domain configured for this brand.</p>:<button className="button" onClick={runAudit}><Globe size={14}/>Audit {domain}</button>}
 </div>;

 return <SeoAuditResults audit={audit} onRerun={runAudit}/>;
}

function SeoAuditResults({audit,onRerun}:{audit:SeoAuditResult;onRerun?:()=>void}){
 const passed=audit.checks.filter(c=>c.status==="pass").length;
 const warnings=audit.checks.filter(c=>c.status==="warning").length;
 const failed=audit.checks.filter(c=>c.status==="fail").length;
 const scoreColor=audit.seoScore>=70?"var(--em)":audit.seoScore>=50?"var(--am)":"var(--cr)";
 const cats:[SeoCheck["category"],string][]=[["technical","Technical SEO"],["meta","Meta Tags"],["content","Content"],["social","Social & Sharing"],["schema","Structured Data"]];
 const sIcon=(s:string)=>s==="pass"?"✓":s==="warning"?"!":"✗";
 const sBg=(s:string)=>s==="pass"?"var(--em-d,#DCFCE7)":s==="warning"?"var(--am-d,#FEF3C7)":"#FEE2E2";
 const sColor=(s:string)=>s==="pass"?"var(--em)":s==="warning"?"var(--am)":"var(--cr)";
 return <div>
  <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",alignItems:"center",gap:"24px",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"10px",padding:"20px 24px",marginBottom:"14px",borderLeft:`4px solid ${scoreColor}`}}>
   <div><div style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",fontWeight:700,letterSpacing:"1px",marginBottom:"4px"}}>SEO Score</div><div style={{fontSize:"52px",fontWeight:800,fontFamily:"Outfit,system-ui",color:scoreColor,letterSpacing:"-2px",lineHeight:1}}>{audit.seoScore}</div></div>
   <div style={{display:"flex",gap:"20px",paddingLeft:"8px"}}>
    <div style={{textAlign:"center"}}><div style={{fontSize:"24px",fontWeight:800,fontFamily:"Outfit",color:"var(--em)",letterSpacing:"-1px"}}>{passed}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>Passed</div></div>
    <div style={{textAlign:"center"}}><div style={{fontSize:"24px",fontWeight:800,fontFamily:"Outfit",color:"var(--am)",letterSpacing:"-1px"}}>{warnings}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>Warnings</div></div>
    <div style={{textAlign:"center"}}><div style={{fontSize:"24px",fontWeight:800,fontFamily:"Outfit",color:"var(--cr)",letterSpacing:"-1px"}}>{failed}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>Failed</div></div>
   </div>
   <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"6px"}}><span style={{fontSize:"12px",color:"var(--muted)"}}>Audited: <b style={{color:"var(--ink)"}}>{audit.domain}</b></span>{onRerun&&<button className="button outline" onClick={onRerun} style={{fontSize:"12px",padding:"6px 12px"}}>Re-audit</button>}</div>
  </div>
  {cats.map(([key,label])=>{const cc=audit.checks.filter(c=>c.category===key);if(!cc.length)return null;return <article key={key} className="panel" style={{marginBottom:"10px"}}>
   <div className="panel-head"><div><h3>{label}</h3></div></div>
   <div>{cc.map(c=><div key={c.id} style={{display:"flex",gap:"12px",alignItems:"flex-start",padding:"12px 16px",borderBottom:"1px solid var(--line)"}}>
    <span style={{fontSize:"10px",fontWeight:800,width:"20px",height:"20px",minWidth:"20px",borderRadius:"50%",background:sBg(c.status),color:sColor(c.status),display:"flex",alignItems:"center",justifyContent:"center",marginTop:"1px"}}>{sIcon(c.status)}</span>
    <div style={{flex:1}}><div style={{fontWeight:600,fontSize:"13px",color:"var(--ink)"}}>{c.label}</div><div style={{fontSize:"12px",color:"var(--muted)",marginTop:"2px"}}>{c.message}</div>{c.recommendation&&<div style={{fontSize:"11px",color:"var(--sky)",marginTop:"5px",fontWeight:600}}>→ {c.recommendation}</div>}</div>
    <span style={{fontSize:"10px",fontWeight:700,padding:"2px 7px",borderRadius:"4px",background:sBg(c.status),color:sColor(c.status),flexShrink:0,textTransform:"uppercase"}}>{c.status}</span>
   </div>)}</div>
  </article>})}
  {audit.fetchError&&<p style={{fontSize:"11px",color:"var(--am)",lineHeight:1.5}}>Note: Could not fully fetch {audit.domain} ({audit.fetchError}). Some checks may be incomplete or based on partial data.</p>}
 </div>
}

// Real mode (demo=false) diverges deliberately from the static demo below: the "Share of AI
// voice" percentage-bars panel is demo-only, because those percentages come from scan_runs/
// answers, which aren't wired yet — showing real competitor names next to fabricated scores
// would be worse than not showing the panel at all. It comes back once scan data is real.
function Competitors({demo,brand}:{demo:boolean;brand?:Brand}){
 const [items,setItems]=useState<Competitor[]>([]);
 const [sov,setSov]=useState<ShareOfVoiceRow[]>([]);
 const [scanned,setScanned]=useState(false);
 const [loading,setLoading]=useState(!demo);
 const [modal,setModal]=useState(false),[name,setName]=useState(""),[domain,setDomain]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState("");

 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{
   setLoading(true);
   const [{createClient},{getCompetitors},{getLatestScan,shareOfVoice}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/competitors"),import("@/lib/data/stats")]);
   const supabase=createClient();
   const [rows,scan]=await Promise.all([getCompetitors(supabase,brand.id),getLatestScan(supabase,brand.id)]);
   if(cancelled)return;
   setItems(rows);setScanned(!!scan);
   // Competitors added after the last scan have no data yet, so they're filtered out of
   // the chart rather than shown at a misleading 0%.
   setSov(scan?shareOfVoice(scan,brand.name).filter(r=>r.isBrand||rows.some(c=>c.name===r.name)):[]);
   setLoading(false);
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
  {loading?<p>Loading competitors…</p>:items.length===0?<p>No competitors tracked yet for {brand.name}.</p>:<><div className="competitor-grid">{items.map(c=>{const row=sov.find(r=>r.name===c.name);return <article className="panel competitor-card" key={c.id}><span>{c.name.slice(0,2).toUpperCase()}</span><div><h3>{c.name}</h3><p>{c.domain||"No domain set"}</p></div>{row&&<b>{row.share}%</b>}<button><MoreHorizontal/></button></article>})}</div>
  <article className="panel"><PanelHead title="Share of AI voice" sub={sov.length?`How often each brand is named across the ${sov[0].total} answers in the latest scan`:"Run a scan to see who AI names for your prompts"}/>
   {sov.length===0?<p className="muted-note">{scanned?"The latest scan ran before competitor tracking was added. Run a new scan to compare.":`No scan yet for ${brand.name}.`}</p>
   :<><div className="share-bars">{sov.map(r=><div key={r.name}><span>{r.name}{r.isBrand?" (you)":""}</span><i><b style={{width:r.share+"%"}}/></i><strong>{r.share}%</strong></div>)}</div>
   <p className="muted-note">Shares don&apos;t total 100% — one answer can name several brands, and being listed alongside a rival is the normal case. {sov.filter(r=>r.avgPosition!=null).length>0&&`Average position when named: ${sov.filter(r=>r.avgPosition!=null).map(r=>`${r.name} ${r.avgPosition}`).join(", ")}.`}</p></>}
  </article></>}
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

type ReportDetail={run:{id:string;completedAt:string|null;confidence:number|null;score:number;mentions:number;total:number};brand:{name:string;domain:string};answers:{id:string;engine:string;brand_mentioned:boolean;position:number|null;sentiment:string;prompt:string}[];fixes:{id:string;category:string;title:string;rationale:string|null;impact_low:number|null;impact_high:number|null;status:string}[]};
function groupByEngineRaw(answers:{engine:string;brand_mentioned:boolean}[]){const byKey=new Map<string,{mentioned:number;total:number}>();for(const a of answers){const e=byKey.get(a.engine)||{mentioned:0,total:0};e.total++;if(a.brand_mentioned)e.mentioned++;byKey.set(a.engine,e)}return Array.from(byKey.entries()).map(([key,{mentioned,total}])=>{const meta=engineByKey[key]||{name:key,short:key[0]?.toUpperCase()||"?",color:"green"};const pct=total?Math.round(mentioned/total*100):0;return{key,name:meta.name,short:meta.short,color:meta.color,pct}})}
function Reports({demo,brand,refreshKey}:{demo:boolean;brand?:Brand;refreshKey:number}){
 const history=useScanHistory(demo,brand,refreshKey);
 const [viewRunId,setViewRunId]=useState<string|null>(null);
 const [report,setReport]=useState<ReportDetail|null>(null);
 const [reportLoading,setReportLoading]=useState(false);
 async function openReport(runId:string){setViewRunId(runId);setReportLoading(true);const r=await fetch(`/api/reports/${runId}`);const j=await r.json().catch(()=>({}));setReport(j.run?j:null);setReportLoading(false)}
 function closeReport(){setViewRunId(null);setReport(null)}
 const header=<div className="page-title"><div><span className="overline">REPORTS</span><h1>Visibility reports</h1><p>Every scan auto-generates a full report. Click any entry to view or export.</p></div></div>;
 if(demo)return <>{header}<div className="report-grid">{["June 2026","Q2 summary","May 2026"].map((r,i)=><article className="panel report-card" key={r}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}><span style={{fontSize:"10px",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--muted)"}}>SCAN #{3-i}</span><span style={{fontSize:"10px",fontWeight:700,padding:"3px 8px",borderRadius:"99px",background:"var(--sky-d)",color:"var(--sky)"}}>Demo</span></div><div style={{display:"flex",alignItems:"flex-end",gap:"14px",marginBottom:"16px"}}><span style={{fontSize:"52px",fontWeight:800,lineHeight:1,fontFamily:"Outfit,system-ui",color:"var(--em)",letterSpacing:"-2px"}}>{67-i*4}</span><div style={{paddingBottom:"5px"}}><div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"2px"}}>AI Visibility Score</div><div style={{fontSize:"12px",fontWeight:600,color:"var(--ink)"}}>{14-i*2}/25 mentions</div></div></div><button className="button" style={{fontSize:"12px",padding:"7px 14px"}}>View report <ArrowUpRight style={{width:"13px"}}/></button></article>)}</div></>;
 if(!brand)return <>{header}<p style={{color:"var(--muted)",fontSize:"13px"}}>Add a client brand to start generating reports.</p></>;
 if(history.length===0)return <>{header}<div className="panel" style={{padding:"40px 32px",textAlign:"center"}}><FileText style={{width:"32px",color:"var(--faint)",marginBottom:"12px"}}/><p style={{margin:"0 0 8px",fontWeight:600,color:"var(--ink)"}}>No reports yet for {brand.name}</p><p style={{margin:0,fontSize:"13px",color:"var(--muted)"}}>Click <b>Run scan</b> above to generate your first AI visibility report.</p></div></>;
 const reversed=[...history].reverse();
 return <>{header}
  <div className="report-grid">
   {reversed.map((h,ri)=>{const origIndex=history.length-1-ri;const isFirst=origIndex===0;const prev=origIndex>0?history[origIndex-1]:null;const delta=prev!=null?h.score-prev.score:null;const dateStr=h.completedAt?new Date(h.completedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"Unknown date";const scoreColor=h.score>=70?"var(--em)":h.score>=45?"var(--am)":"var(--cr)";
   return <article className="panel report-card" key={h.runId} onClick={()=>openReport(h.runId)}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"14px"}}>
     <div><span style={{fontSize:"10px",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--muted)"}}>SCAN #{history.length-ri}</span><p style={{margin:"3px 0 0",fontSize:"12px",color:"var(--muted)"}}>{dateStr}</p></div>
     {isFirst?<span style={{fontSize:"10px",fontWeight:700,padding:"3px 8px",borderRadius:"99px",background:"var(--am-d,#FEF3C7)",color:"var(--am)"}}>Baseline</span>:delta!=null?<span style={{fontSize:"12px",fontWeight:700,color:delta>=0?"var(--em)":"var(--cr)"}}>{delta>0?"+":""}{delta} pts</span>:null}
    </div>
    <div style={{display:"flex",alignItems:"flex-end",gap:"14px",marginBottom:"14px"}}>
     <span style={{fontSize:"56px",fontWeight:800,lineHeight:1,fontFamily:"Outfit,system-ui",color:scoreColor,letterSpacing:"-2px"}}>{h.score}</span>
     <div style={{paddingBottom:"5px"}}><div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"2px"}}>AI Visibility Score</div><div style={{fontSize:"12px",fontWeight:600,color:"var(--ink)"}}>{h.mentions}/{h.total} mentions</div></div>
    </div>
    {isFirst&&<p style={{margin:"0 0 14px",fontSize:"11px",color:"var(--muted)",lineHeight:1.5}}>Baseline scan — run your next scan to start tracking progress.</p>}
    <button className="button" style={{fontSize:"12px",padding:"7px 14px",marginTop:"auto"}} onClick={e=>{e.stopPropagation();openReport(h.runId)}}>View report <ArrowUpRight style={{width:"13px"}}/></button>
   </article>})}
  </div>
  {viewRunId&&<ReportViewer runId={viewRunId} report={report} loading={reportLoading} history={history} onClose={closeReport}/>}
 </>;
}
function ReportViewer({runId,report,loading,history,onClose}:{runId:string;report:ReportDetail|null;loading:boolean;history:ScanHistoryEntry[];onClose:()=>void}){
 function printReport(){window.print()}
 const histIdx=report?history.findIndex(h=>h.runId===runId):-1;
 const isBaseline=histIdx===0;
 const prev=histIdx>0?history[histIdx-1]:null;
 const delta=prev!=null&&report?report.run.score-prev.score:null;
 const dateStr=report?.run.completedAt?new Date(report.run.completedAt).toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"}):"";
 const engineBreakdown=report?groupByEngineRaw(report.answers):[];
 return <div className="rv-overlay" onClick={onClose}>
  <div className="rv-panel" onClick={e=>e.stopPropagation()}>
   <div className="rv-actions no-print">
    <span style={{fontSize:"12px",fontWeight:700,color:"var(--ink)"}}>Scan Report{report?` — ${report.brand.name}`:""}</span>
    <div style={{display:"flex",gap:"8px"}}><button className="button" onClick={printReport} style={{fontSize:"12px",padding:"7px 14px"}}><FileText style={{width:"13px"}}/>Export PDF</button><button className="icon-btn" onClick={onClose}><X/></button></div>
   </div>
   {loading&&<div style={{padding:"80px",textAlign:"center"}}><LoaderCircle className="spin" style={{width:"32px",color:"var(--sky)"}}/></div>}
   {!loading&&!report&&<div style={{padding:"48px",textAlign:"center",color:"var(--muted)"}}><AlertCircle style={{width:"32px",marginBottom:"12px"}}/><p>Couldn&apos;t load this report.</p></div>}
   {!loading&&report&&<>
    <div className="rv-header">
     <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"28px"}}>
      <span style={{fontSize:"16px",fontWeight:700,color:"#E2E8F0",letterSpacing:"-.3px"}}>a<span style={{color:"#0EA5E9"}}>askvisibleai</span></span>
      <div style={{textAlign:"right"}}><div style={{fontSize:"10px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"#475569",marginBottom:"2px"}}>AI VISIBILITY REPORT</div><div style={{fontSize:"12px",color:"#94A3B8"}}>{dateStr}</div></div>
     </div>
     <div style={{display:"flex",alignItems:"flex-start",gap:"32px",flexWrap:"wrap"}}>
      <div>
       {isBaseline&&<span style={{display:"inline-block",marginBottom:"10px",fontSize:"11px",fontWeight:700,padding:"4px 10px",borderRadius:"99px",background:"rgba(245,158,11,.18)",color:"#F59E0B",letterSpacing:".5px"}}>BASELINE SCAN</span>}
       {!isBaseline&&delta!=null&&<span style={{display:"block",marginBottom:"10px",fontSize:"14px",fontWeight:700,color:delta>=0?"#10B981":"#EF4444"}}>{delta>0?"↑":"↓"}{Math.abs(delta)} pts vs previous scan</span>}
       <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#475569",marginBottom:"4px"}}>AI VISIBILITY SCORE</div>
       <div style={{fontSize:"96px",fontWeight:800,lineHeight:1,fontFamily:"Outfit,system-ui",color:"#0EA5E9",letterSpacing:"-5px"}}>{report.run.score}</div>
       <div style={{marginTop:"14px",display:"flex",gap:"8px",flexWrap:"wrap"}}>
        <span style={{fontSize:"12px",color:"#94A3B8",padding:"4px 10px",borderRadius:"5px",background:"rgba(255,255,255,.07)"}}>{report.run.mentions}/{report.run.total} mentions</span>
        {report.run.confidence!=null&&<span style={{fontSize:"12px",color:"#94A3B8",padding:"4px 10px",borderRadius:"5px",background:"rgba(255,255,255,.07)"}}>{coverageLabel(report.run.confidence)}</span>}
       </div>
      </div>
      <div style={{marginLeft:"auto",textAlign:"right",paddingTop:"4px"}}>
       <div style={{fontSize:"22px",fontWeight:700,fontFamily:"Outfit,system-ui",color:"#E2E8F0",marginBottom:"4px"}}>{report.brand.name}</div>
       <div style={{fontSize:"13px",color:"#64748B"}}>{report.brand.domain}</div>
       {isBaseline&&<div style={{marginTop:"16px",maxWidth:"240px",fontSize:"12px",color:"#475569",lineHeight:1.6}}>First AI health check for {report.brand.name}. Run your next scan to start tracking trends.</div>}
      </div>
     </div>
    </div>
    <div className="rv-section">
     <div className="rv-section-title">Visibility by engine</div>
     <div style={{display:"grid",gap:"10px"}}>
      {engineBreakdown.map(e=><div key={e.key} style={{display:"flex",alignItems:"center",gap:"12px"}}>
       <span className={`engine-logo ${e.color}`} style={{flexShrink:0}}>{e.short}</span>
       <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}><span style={{fontSize:"13px",fontWeight:600,color:"var(--ink)"}}>{e.name}</span><span style={{fontSize:"13px",fontWeight:700,color:"var(--sky)",fontVariantNumeric:"tabular-nums"}}>{e.pct}%</span></div><div style={{height:"6px",background:"var(--line)",borderRadius:"3px"}}><div style={{height:"100%",width:e.pct+"%",background:"var(--sky)",borderRadius:"3px"}}/></div></div>
      </div>)}
     </div>
    </div>
    <div className="rv-section">
     <div className="rv-section-title">Prompt results ({report.answers.length})</div>
     <div className="table-wrap"><table><thead><tr><th>Prompt</th><th>Engine</th><th>Status</th><th>Position</th><th>Sentiment</th></tr></thead><tbody>{report.answers.map(a=><tr key={a.id}><td><b>{a.prompt}</b></td><td>{engineByKey[a.engine]?.name||a.engine}</td><td><span className={a.brand_mentioned?"status yes":"status no"}>{a.brand_mentioned?"Mentioned":"Not mentioned"}</span></td><td>{a.position?`#${a.position}`:"—"}</td><td>{a.sentiment==="not-mentioned"?"—":a.sentiment}</td></tr>)}</tbody></table></div>
    </div>
    {report.fixes.length>0&&<div className="rv-section">
     <div className="rv-section-title">AI-recommended fixes ({report.fixes.length})</div>
     <div style={{display:"grid",gap:"10px"}}>
      {report.fixes.slice(0,6).map(f=><div key={f.id} style={{border:"1px solid var(--line)",borderRadius:"8px",padding:"14px 16px"}}>
       <div style={{display:"flex",gap:"10px",alignItems:"flex-start"}}>
        <span style={{fontSize:"10px",fontWeight:700,padding:"3px 8px",borderRadius:"4px",background:"var(--sky-d,#E0F2FE)",color:"var(--sky)",flexShrink:0,marginTop:"1px"}}>{f.category.toUpperCase()}</span>
        <div><div style={{fontWeight:700,fontSize:"13px",color:"var(--ink)",marginBottom:"4px"}}>{f.title}</div>{f.rationale&&<div style={{fontSize:"12px",color:"var(--muted)"}}>{f.rationale}</div>}{f.impact_low!=null&&f.impact_high!=null&&<div style={{marginTop:"6px",fontSize:"11px",color:"var(--em)",fontWeight:600}}>Estimated lift: +{f.impact_low}–{f.impact_high}%</div>}</div>
       </div>
      </div>)}
     </div>
    </div>}
    <div className="rv-footer"><span style={{fontWeight:700,color:"var(--muted)"}}>a<span style={{color:"var(--sky)"}}>askvisibleai</span></span><span>Generated {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</span></div>
   </>}
  </div>
 </div>
}
const WEEK_DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const FREQ_LABEL:{[k:string]:string}={weekly:"Weekly",monthly:"Monthly",off:"Off (manual only)"};

function SettingsPage({demo,brand,ctx,onBrandUpdated}:{demo:boolean;brand?:Brand;ctx:WorkspaceContext|null;onBrandUpdated:(updated:{id:string;name:string;domain:string;description:string})=>void}){
 const [tab,setTab]=useState<string>("schedule");
 const [frequency,setFrequency]=useState<"weekly"|"monthly"|"off">("weekly");
 const [scanDay,setScanDay]=useState(1);
 const [saving,setSaving]=useState(false);
 const [saved,setSaved]=useState(false);
 const [brandName,setBrandName]=useState("");
 const [brandDomain,setBrandDomain]=useState("");
 const [brandDescription,setBrandDescription]=useState("");
 const [brandSaving,setBrandSaving]=useState(false);
 const [brandSaved,setBrandSaved]=useState(false);
 const [brandError,setBrandError]=useState("");
 useEffect(()=>{if(brand){setFrequency(brand.scan_frequency||"weekly");setScanDay(brand.scan_day??1);setBrandName(brand.name||"");setBrandDomain(brand.domain||"");setBrandDescription(brand.description||"")}},[brand]);
 async function saveSchedule(){if(!brand)return;setSaving(true);await fetch("/api/brands/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({brandId:brand.id,scan_frequency:frequency,scan_day:scanDay})});setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2500)}
 async function saveBrandProfile(){
  if(!brand)return;
  if(!brandName.trim()||!brandDomain.trim()){setBrandError("Brand name and website are required");return}
  setBrandSaving(true);setBrandError("");
  const r=await fetch("/api/brands/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({brandId:brand.id,name:brandName.trim(),domain:brandDomain.trim(),description:brandDescription})});
  const j=await r.json().catch(()=>({}));
  setBrandSaving(false);
  if(!r.ok){setBrandError(j.error||"Failed to save changes");return}
  setBrandSaved(true);setTimeout(()=>setBrandSaved(false),2500);
  onBrandUpdated({id:brand.id,name:brandName.trim(),domain:brandDomain.trim(),description:brandDescription});
 }
 const nextScanLabel=frequency==="weekly"?`Every ${WEEK_DAYS[scanDay]} at 06:00 UTC`:frequency==="monthly"?`Day ${scanDay} of each month at 06:00 UTC`:"Disabled — use Run scan button";
 return <><div className="page-title"><div><span className="overline">SETTINGS</span><h1>Workspace settings</h1><p>Manage scan schedule, brand profile, and team.</p></div></div>
  <div className="settings-grid">
   <article className="panel settings-nav">
    <button className={tab==="schedule"?"active":""} onClick={()=>setTab("schedule")}><Radar/>Scan schedule</button>
    <button className={tab==="brand"?"active":""} onClick={()=>setTab("brand")}><Target/>Brand profile</button>
    <button className={tab==="integrations"?"active":""} onClick={()=>setTab("integrations")}><Link2/>Integrations</button>
    <button><Bell/>Notifications</button>
    <button className={tab==="team"?"active":""} onClick={()=>setTab("team")}><Users/>Team members</button>
    <button><BarChart3/>Billing &amp; usage</button>
   </article>
   <article className="panel settings-form">
    {tab==="schedule"&&<>
     <h3>Automated scan schedule</h3>
     <p style={{marginBottom:"20px"}}>Set how often your brand is scanned automatically. The <b>Run scan</b> button always triggers an immediate scan regardless of this setting.</p>
     <label style={{display:"block",fontWeight:600,fontSize:"13px",marginBottom:"8px"}}>Frequency</label>
     <div style={{display:"flex",gap:"8px",marginBottom:"22px"}}>
      {(["weekly","monthly","off"] as const).map(f=><button key={f} onClick={()=>setFrequency(f)} style={{flex:1,padding:"10px 6px",borderRadius:"8px",border:`2px solid ${frequency===f?"var(--sky,#0EA5E9)":"var(--line)"}`,background:frequency===f?"color-mix(in srgb,var(--sky,#0EA5E9) 12%,transparent)":"transparent",color:frequency===f?"var(--sky,#0EA5E9)":"var(--text)",fontWeight:frequency===f?700:400,fontSize:"13px",cursor:"pointer",transition:"all .15s"}}>{FREQ_LABEL[f]}</button>)}
     </div>
     {frequency!=="off"&&<>
      <label style={{display:"block",fontWeight:600,fontSize:"13px",marginBottom:"8px"}}>{frequency==="weekly"?"Day of week":"Day of month"}</label>
      {frequency==="weekly"
       ?<div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"18px"}}>{WEEK_DAYS.map((d,i)=><button key={d} onClick={()=>setScanDay(i)} style={{padding:"7px 11px",borderRadius:"7px",border:`2px solid ${scanDay===i?"var(--sky,#0EA5E9)":"var(--line)"}`,background:scanDay===i?"color-mix(in srgb,var(--sky,#0EA5E9) 12%,transparent)":"transparent",color:scanDay===i?"var(--sky,#0EA5E9)":"var(--text)",fontWeight:scanDay===i?700:400,fontSize:"12px",cursor:"pointer",transition:"all .15s"}}>{d.slice(0,3)}</button>)}</div>
       :<div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"18px"}}>{Array.from({length:28},(_,i)=>i+1).map(d=><button key={d} onClick={()=>setScanDay(d)} style={{width:"36px",height:"36px",borderRadius:"7px",border:`2px solid ${scanDay===d?"var(--sky,#0EA5E9)":"var(--line)"}`,background:scanDay===d?"color-mix(in srgb,var(--sky,#0EA5E9) 12%,transparent)":"transparent",color:scanDay===d?"var(--sky,#0EA5E9)":"var(--text)",fontWeight:scanDay===d?700:400,fontSize:"12px",cursor:"pointer",transition:"all .15s"}}>{d}</button>)}</div>}
     </>}
     <div style={{background:"var(--bg)",border:"1px solid var(--line)",borderRadius:"8px",padding:"10px 14px",fontSize:"12px",color:"var(--muted)",marginBottom:"20px"}}>
      {frequency==="off"?<span>Automated scans are off. Use the <b>Run scan</b> button whenever you want a fresh report.</span>:<span>Next scheduled scan: <b style={{color:"var(--sky,#0EA5E9)"}}>{nextScanLabel}</b></span>}
     </div>
     {!demo&&brand?<button className="button" onClick={saveSchedule} disabled={saving} style={{minWidth:"140px"}}>{saving?"Saving…":saved?"Saved ✓":"Save schedule"}</button>:<button className="button" disabled>Save schedule</button>}
    </>}
    {tab==="brand"&&<>
     <h3>Brand profile</h3>
     <p>Used to identify mentions and compare your market position.</p>
     <label>Brand name<input value={demo?"Acme Software":brandName} onChange={e=>setBrandName(e.target.value)} readOnly={demo}/></label>
     <label>Website<input value={demo?"acme.co":brandDomain} onChange={e=>setBrandDomain(e.target.value)} readOnly={demo}/></label>
     <label>Brand description<textarea value={demo?"AI-powered workflow software for growing SaaS teams.":brandDescription} onChange={e=>setBrandDescription(e.target.value)} rows={3} readOnly={demo}/></label>
     {brandError&&<p style={{color:"var(--cr)",fontSize:"12px",margin:"-8px 0 16px"}}>{brandError}</p>}
     {!demo&&brand?<button className="button" onClick={saveBrandProfile} disabled={brandSaving} style={{minWidth:"140px"}}>{brandSaving?"Saving…":brandSaved?"Saved ✓":"Save changes"}</button>:<button className="button" disabled>Save changes</button>}
    </>}
    {tab==="integrations"&&<>
     <h3>Integrations</h3>
     <p style={{marginBottom:"24px"}}>Connect external tools to enrich your dashboard with real data.</p>
     <div style={{border:"1px solid var(--line)",borderRadius:"10px",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 20px"}}>
       <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
        <div style={{width:"40px",height:"40px",borderRadius:"10px",background:"#4285F4",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
         <TrendingUp size={20} color="#fff"/>
        </div>
        <div>
         <div style={{fontWeight:700,fontSize:"14px"}}>Google Search Console</div>
         <div style={{fontSize:"12px",color:"var(--muted)",marginTop:"2px"}}>Real impressions, clicks, CTR and rankings from Google Search</div>
        </div>
       </div>
       <GscSettingsStatus demo={demo} brandId={brand?.id}/>
      </div>
     </div>
    </>}
    {tab==="team"&&<TeamSettings demo={demo}/>}
   </article>
  </div></>;
}

type TeamMember={userId:string;name:string|null;email:string|null;role:string;isYou:boolean};
type TeamInvite={id:string;email:string;role:string;expires_at:string};

function TeamSettings({demo}:{demo:boolean}){
 const [role,setRole]=useState<string|null>(null);
 const [members,setMembers]=useState<TeamMember[]>([]);
 const [invites,setInvites]=useState<TeamInvite[]>([]);
 const [loading,setLoading]=useState(!demo);
 const [email,setEmail]=useState(""),[inviteRole,setInviteRole]=useState("member");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");

 async function load(){
  const r=await fetch("/api/team");const d=await r.json().catch(()=>({}));
  if(r.ok){setRole(d.role);setMembers(d.members||[]);setInvites(d.invitations||[])}
  else setError(d.error||"Couldn't load the team.");
  setLoading(false);
 }
 useEffect(()=>{if(demo){setLoading(false);return}load()},[demo]);

 const canManage=role==="owner"||role==="admin";

 async function invite(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError("");setNotice("");
  const r=await fetch("/api/team",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,role:inviteRole})});
  const d=await r.json().catch(()=>({}));
  setBusy(false);
  if(!r.ok){setError(d.error||"Couldn't send that invitation.");return}
  setEmail("");
  // The link is always returned, so a failed send is recoverable by pasting it manually
  // rather than leaving an invite the inviter can't see.
  setNotice(d.warning?`${d.warning} ${d.url}`:`Invitation sent to ${d.invitation.email}.`);
  load();
 }

 async function remove(body:Record<string,string>,confirmText:string){
  if(!window.confirm(confirmText))return;
  setError("");setNotice("");
  const r=await fetch("/api/team",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){setError(d.error||"That didn't work.");return}
  load();
 }

 if(demo)return <><h3>Team members</h3><p style={{marginBottom:"20px"}}>Invite the rest of your agency. Owners and admins can add people; everyone else has read access.</p><p className="muted-note">Team management is disabled in demo mode.</p></>;
 if(loading)return <><h3>Team members</h3><p>Loading team…</p></>;

 return <>
  <h3>Team members</h3>
  <p style={{marginBottom:"20px"}}>Owners and admins can invite and remove people. Members and viewers have read access to everything the workspace tracks.</p>
  {error&&<div className="checker-error"><AlertCircle/><div><b>Something went wrong</b><p>{error}</p></div></div>}
  {notice&&<p className="muted-note">{notice}</p>}

  <div className="team-list">
   {members.map(m=><div key={m.userId}>
    <span>{(m.name||m.email||"?").slice(0,2).toUpperCase()}</span>
    <div><b>{m.name||m.email||"Unknown"}{m.isYou?" (you)":""}</b><small>{m.email||"No email on file"}</small></div>
    <em>{m.role}</em>
    {(canManage||m.isYou)&&m.role!=="owner"&&<button onClick={()=>remove({userId:m.userId},m.isYou?"Leave this workspace?":`Remove ${m.name||m.email} from the team?`)}>{m.isYou?"Leave":"Remove"}</button>}
   </div>)}
   {invites.map(i=><div key={i.id} className="pending">
    <span><Mail size={15}/></span>
    <div><b>{i.email}</b><small>Invited · expires {new Date(i.expires_at).toLocaleDateString()}</small></div>
    <em>{i.role}</em>
    {canManage&&<button onClick={()=>remove({invitationId:i.id},`Revoke the invitation for ${i.email}?`)}>Revoke</button>}
   </div>)}
  </div>

  {canManage&&<form onSubmit={invite} style={{marginTop:"22px"}}>
   <label>Invite by email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="colleague@youragency.com"/></label>
   <label>Role<select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}>
    <option value="admin">Admin — can invite and remove people</option>
    <option value="member">Member — full access, no team management</option>
    <option value="viewer">Viewer — read only</option>
   </select></label>
   <button className="button" disabled={busy}>{busy?"Sending…":"Send invitation"}</button>
  </form>}
 </>;
}

function GscSettingsStatus({demo,brandId}:{demo:boolean;brandId?:string}){
 const [status,setStatus]=useState<"loading"|"connected"|"disconnected">("loading");
 const [propertyUrl,setPropertyUrl]=useState("");
 const [disconnecting,setDisconnecting]=useState(false);
 useEffect(()=>{
  if(demo||!brandId){setStatus("disconnected");return}
  fetch(`/api/gsc/metrics?brandId=${brandId}`)
   .then(r=>r.json())
   .then((d:{connected:boolean;propertyUrl?:string})=>{if(d.connected){setPropertyUrl(d.propertyUrl||"");setStatus("connected")}else setStatus("disconnected")})
   .catch(()=>setStatus("disconnected"));
 },[demo,brandId]);
 async function disconnect(){
  if(!brandId)return;
  setDisconnecting(true);
  await fetch(`/api/gsc/disconnect?brandId=${brandId}`,{method:"DELETE"});
  setDisconnecting(false);
  setStatus("disconnected");
  setPropertyUrl("");
 }
 if(status==="loading")return <span style={{fontSize:"12px",color:"var(--muted)"}}>Checking…</span>;
 if(status==="connected")return(
  <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
   <span style={{fontSize:"12px",color:"var(--em)",fontWeight:600,display:"flex",alignItems:"center",gap:"5px"}}><Check size={13}/>Connected{propertyUrl?` · ${propertyUrl.replace(/^(https?:\/\/|sc-domain:)/,"").replace(/\/$/,"")}`:""}
   </span>
   <button onClick={disconnect} disabled={disconnecting} style={{fontSize:"12px",color:"var(--cr)",background:"none",border:"1px solid var(--line)",borderRadius:"6px",padding:"5px 10px",cursor:"pointer"}}>{disconnecting?"Disconnecting…":"Disconnect"}</button>
  </div>
 );
 return(
  !demo&&brandId
   ?<a href={`/api/gsc/auth?brandId=${brandId}`} className="button" style={{fontSize:"13px",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:"6px",padding:"8px 16px"}}><Link2 size={13}/>Connect</a>
   :<button className="button" disabled style={{fontSize:"13px",padding:"8px 16px"}}>Connect</button>
 );
}
