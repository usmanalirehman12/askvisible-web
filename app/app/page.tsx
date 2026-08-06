"use client";
import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, ArrowDownRight, ArrowLeft, ArrowUpRight, BarChart3, Bell, Building2, Check, ChevronDown, CircleHelp, Edit2, FileText, Gauge, Globe, LayoutDashboard, Link2, LoaderCircle, LogOut, Mail, Menu, MessageSquare, Moon, MoreHorizontal, Play, Plus, Radar, Search, Settings, Sparkles, Sun, Target, Trash2, TrendingUp, Users, WandSparkles, X } from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase/config";
import type { Brand, Competitor, Fix, Prompt, WorkspaceContext } from "@/lib/data/types";
import type { CompetitiveGapRow, ScanAnswerRow, ShareOfVoiceRow } from "@/lib/data/stats";
import { summarizeScan } from "@/lib/data/stats";
import { formatTimestamp, isWithinDays } from "@/lib/format/datetime";
import { compareToPrevious } from "@/lib/data/reportComparison";
import Tabs, { TabPanel } from "@/app/components/Tabs";
import ScoreTrendChart from "@/app/components/ScoreTrendChart";
import EmptyState from "@/app/components/EmptyState";
import OnboardingChecklist from "@/app/components/OnboardingChecklist";
import CoachMarkTour from "@/app/components/CoachMarkTour";
import TabTip from "@/app/components/TabTip";
import { isNewAccount } from "@/lib/onboarding/checklistState";

const engines=[{name:"ChatGPT",short:"G",color:"green"},{name:"Gemini",short:"◆",color:"blue"},{name:"Perplexity",short:"P",color:"teal"},{name:"Claude",short:"C",color:"orange"},{name:"DeepSeek",short:"D",color:"crimson"},{name:"AI Overviews",short:"◈",color:"cobalt"}];
const engineByKey:Record<string,{name:string;short:string;color:string}>={openai:engines[0],gemini:engines[1],perplexity:engines[2],anthropic:engines[3],deepseek:engines[4],ai_overviews:engines[5]};
const nav=[{id:"overview",label:"Overview",icon:LayoutDashboard},{id:"prompts",label:"Prompts",icon:Search},{id:"answers",label:"Answers",icon:MessageSquare},{id:"competitors",label:"Competitors",icon:Users},{id:"fixes",label:"AI Fixes",icon:WandSparkles},{id:"seo-audit",label:"SEO Audit",icon:Globe},{id:"reports",label:"Reports",icon:FileText}];
const demoEngines=[{name:"ChatGPT",short:"G",score:74,color:"green"},{name:"Gemini",short:"◆",score:68,color:"blue"},{name:"Perplexity",short:"P",score:61,color:"teal"},{name:"Claude",short:"C",score:54,color:"orange"},{name:"DeepSeek",short:"D",score:48,color:"crimson"},{name:"AI Overviews",short:"◈",score:55,color:"cobalt"}];
// Relative to page-load time (not hardcoded past dates) so the 7/15/30-day range picker on
// Overview always has something real to filter regardless of when the demo is viewed —
// spaced unevenly so each window shows a visibly different point count (7d: 3, 15d: 5, 30d: 8).
const daysAgoIso=(n:number)=>new Date(Date.now()-n*24*60*60*1000).toISOString();
const demoSparkData=[27,21,16,12,8,5,2,0].map((d,i)=>({score:[52,55,58,60,63,65,67,67][i],date:daysAgoIso(d)}));
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
 const [confirmScanOpen,setConfirmScanOpen]=useState(false);
 const [reportsTab,setReportsTab]=useState<"scans"|"fixes"|"seo">("scans");
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

 const [workspaceId,setWorkspaceId]=useState<string|null>(()=>typeof window!=="undefined"?localStorage.getItem("av-active-workspace"):null);

 useEffect(()=>{
  if(demo)return;
  let cancelled=false;
  (async()=>{
   try{
    const [{createClient},{getWorkspaceContext}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/workspace")]);
    const supabase=createClient();
    const result=await getWorkspaceContext(supabase,workspaceId);
    if(cancelled)return;
    if(!result){router.push("/login");return}
    // Write back what was actually resolved, not what was asked for. A stale id — from
    // being removed from a team, say — gets corrected here instead of being retried on
    // every load.
    localStorage.setItem("av-active-workspace",result.workspaceId);
    setCtx(result);
   }catch(err){if(!cancelled)setCtxError(err instanceof Error?err.message:"Couldn't load your workspace.")}
   finally{if(!cancelled)setCtxLoading(false)}
  })();
  return ()=>{cancelled=true};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[workspaceId]);

 const [activeBrandId,setActiveBrandId]=useState<string|null>(()=>typeof window!=="undefined"?localStorage.getItem("av-active-brand"):null);
 const activeBrand=ctx?.brands.find(b=>b.id===activeBrandId)||ctx?.brands[0];
 function selectBrand(id:string){setActiveBrandId(id);localStorage.setItem("av-active-brand",id)}
 function selectWorkspace(id:string){
  if(id===ctx?.workspaceId)return;
  // The remembered brand belongs to the old workspace, so clear it or the new workspace
  // opens on a brand that isn't in it.
  localStorage.removeItem("av-active-brand");setActiveBrandId(null);
  localStorage.setItem("av-active-workspace",id);
  setCtxLoading(true);setWorkspaceId(id);
 }

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
 // A real account-age signal for per-tab first-visit tips, not just "first time this
 // browser visited" — see lib/onboarding/checklistState.ts's isNewAccount for why.
 const isNewUser=!demo&&!!ctx&&isNewAccount(ctx.workspaceCreatedAt);

 return <main className="app-shell">{toast&&<div className="toast"><Check/>{toast}</div>}
  <aside className={`sidebar ${open?"open":""}`}>
   <div className="side-brand"><Link className="brand" href="/"><span className="brand-mark">a</span>askvisibleai</Link><button className="mobile-close" onClick={()=>setOpen(false)}><X/></button></div>
   <WorkspaceSwitcher ctx={ctx} onSelectWorkspace={selectWorkspace}/>
   <BrandSwitcher demo={demo} ctx={ctx} activeBrandId={activeBrand?.id} onSelectBrand={selectBrand} onBrandAdded={b=>{setCtx(c=>c?{...c,brands:[...c.brands,b]}:c);selectBrand(b.id)}}/>
   <nav>{nav.map(n=><button key={n.id} className={section===n.id?"active":""} onClick={()=>{setSection(n.id);setOpen(false)}}><n.icon/>{n.label}</button>)}</nav>
   <div className="side-bottom">
    <button><CircleHelp/>Help & resources</button>
    <button onClick={()=>setSection("settings")}><Settings/>Settings</button>
    <div className="usage-mini"><div><span>Monthly usage</span><b>183 / 250</b></div><i><span/></i><small>67 prompts remaining</small></div>
    <div className="profile"><span>{displayName.slice(0,2).toUpperCase()||"?"}</span><div><b>{displayName||"…"}</b><small>{displayEmail}</small></div>{demo?<MoreHorizontal/>:<form action="/logout" method="POST"><button className="icon-btn" title="Log out" aria-label="Log out"><LogOut/></button></form>}</div>
   </div>
  </aside>
  <section className="app-content"><header className="app-header"><button className="menu-btn" onClick={()=>setOpen(true)}><Menu/></button><div className="header-search"><Search/><input placeholder="Search prompts, reports, fixes…"/><kbd>⌘ K</kbd></div><div className="header-actions"><button className="icon-btn"><Bell/><i/></button><button className="icon-btn theme-toggle" onClick={toggleTheme} title={theme==='light'?'Switch to dark mode':'Switch to light mode'} aria-label="Toggle theme">{theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button><button className="scan-btn" onClick={()=>demo?scan():setConfirmScanOpen(true)} disabled={scanning}>{scanning?<LoaderCircle className="spin"/>:<Play/>}{scanning?(scanProgress?`${scanProgress.done}/${scanProgress.total} prompts…`:"Starting…"):"Run scan"}</button></div></header>
    <div className="app-page">{section==="overview"?<Overview demo={demo} brand={activeBrand} refreshKey={refreshKey} scan={scan} scanning={scanning} setSection={setSection} firstName={firstName}/>:section==="prompts"?<Prompts demo={demo} brand={activeBrand} refreshKey={refreshKey} newUser={isNewUser}/>:section==="answers"?<Answers demo={demo} brand={activeBrand} refreshKey={refreshKey} scan={scan} scanning={scanning} newUser={isNewUser}/>:section==="fixes"?<Fixes demo={demo} brand={activeBrand} refreshKey={refreshKey} newUser={isNewUser} onViewProgressReport={()=>{setReportsTab("fixes");setSection("reports")}}/>:section==="seo-audit"?<SeoAuditPage demo={demo} brand={activeBrand} onViewProgressReport={()=>{setReportsTab("seo");setSection("reports")}}/>:section==="competitors"?<Competitors demo={demo} brand={activeBrand} newUser={isNewUser}/>:section==="reports"?<Reports demo={demo} brand={activeBrand} refreshKey={refreshKey} newUser={isNewUser} reportsTab={reportsTab} setReportsTab={setReportsTab}/>:<SettingsPage demo={demo} brand={activeBrand} ctx={ctx} newUser={isNewUser} onBrandUpdated={updated=>setCtx(c=>c?{...c,brands:c.brands.map(b=>b.id===updated.id?{...b,...updated}:b)}:c)}/>}</div>
  </section>
  <CoachMarkTour demo={demo} active={section==="overview"}/>
  {confirmScanOpen&&typeof document!=="undefined"&&createPortal(<div className="modal-back"><div className="modal">
   <button className="modal-x" onClick={()=>setConfirmScanOpen(false)}><X/></button>
   <span className="feature-icon"><Play/></span><h2>Before you scan</h2>
   <p>A scan checks every tracked prompt against all 6 engines — it&apos;s worth reviewing your prompts first if you want to add, edit or remove any. Otherwise, run the scan now.</p>
   <div style={{display:"flex",gap:"8px",marginTop:"4px"}}>
    <button className="button outline" style={{flex:1}} onClick={()=>{setConfirmScanOpen(false);setSection("prompts")}}>Review prompts</button>
    <button className="button" style={{flex:1}} onClick={()=>{setConfirmScanOpen(false);scan()}}>Run scan</button>
   </div>
  </div></div>,document.body)}
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
 const [loading,setLoading]=useState(!demo);
 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  setLoading(true);
  (async()=>{const r=await fetch(`/api/scan-history?brandId=${encodeURIComponent(brand.id)}`);const j=await r.json().catch(()=>({}));if(!cancelled){setHistory(j.history||[]);setLoading(false)}})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);
 return {history,loading};
}

// Bar chart living inside ScoreHero, in its own zone to the right of a vertical
// separator -- the score card has the width for it, so bars stretch to fill that
// zone (flex-based, not fixed-size SVG) rather than sitting as a squeezed sparkline.
// Scaled to the data's own min/max range (not a fixed 0-100), so low or tightly-
// clustered scores (e.g. a brand sitting at 15-20) still show visible bar height
// instead of flattening out near zero against the full scale.
function MiniBarChart({data}:{data:{score:number;date:string}[]}){
 if(data.length<2)return null;
 const scores=data.map(d=>d.score);
 const lo=Math.max(0,Math.min(...scores)-6);
 const hi=Math.min(100,Math.max(...scores)+6);
 const range=hi-lo||1;
 return <div style={{display:"flex",alignItems:"flex-end",gap:"7px",width:"100%"}}>
  {data.map((d,i)=>{
   const isLast=i===data.length-1;
   const pct=((d.score-lo)/range)*100;
   const dateLabel=d.date?new Date(d.date).toLocaleDateString(undefined,{month:"short",day:"numeric"}):"";
   const barPct=Math.max(6,pct);
   return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",minWidth:0}}>
    <div style={{width:"100%",height:"140px",position:"relative"}}>
     <span style={{position:"absolute",left:"50%",bottom:`calc(${barPct}% + 3px)`,transform:"translateX(-50%)",fontSize:"10px",fontWeight:700,color:isLast?"var(--ink,#0F172A)":"var(--muted,#64748B)",whiteSpace:"nowrap"}}>{d.score}</span>
     <div style={{position:"absolute",bottom:0,left:0,width:"100%",height:`${barPct}%`,borderRadius:"3px 3px 0 0",background:isLast?"var(--sky,#0EA5E9)":"color-mix(in srgb,var(--sky,#0EA5E9) 40%,transparent)"}}/>
    </div>
    <span style={{fontSize:"8.5px",color:"var(--faint,#94A3B8)",marginTop:"3px",whiteSpace:"nowrap"}}>{dateLabel}</span>
   </div>;
  })}
 </div>;
}

function Overview({demo,brand,refreshKey,scan,scanning,setSection,firstName}:{demo:boolean;brand?:Brand;refreshKey:number;scan:()=>void;scanning:boolean;setSection:(s:string)=>void;firstName:string}){
 const {scan:latest,loading}=useLatestScan(demo,brand,refreshKey);
 const fixes=useFixes(demo,brand,refreshKey);
 const {history,loading:historyLoading}=useScanHistory(demo,brand,refreshKey);
 const [overviewTab,setOverviewTab]=useState<"summary"|"traffic"|"rankings">("summary");
 const [promptCount,setPromptCount]=useState<number|null>(null);
 const [promptCountLoading,setPromptCountLoading]=useState(!demo);
 const [trendRange,setTrendRange]=useState<"3d"|"7d"|"10d">("10d");
 useEffect(()=>{
  if(demo||!brand){setPromptCountLoading(false);return}
  let cancelled=false;
  setPromptCountLoading(true);
  (async()=>{const [{createClient},{getPrompts}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/prompts")]);const supabase=createClient();const rows=await getPrompts(supabase,brand.id);if(!cancelled){setPromptCount(rows.length);setPromptCountLoading(false)}})();
  return ()=>{cancelled=true};
 },[demo,brand,refreshKey]);
 // Onboarding checklist reads promptCount and scan history -- both load via separate
 // fetches from the scan data itself, so render it only once both have resolved. Otherwise
 // it flashes "run your first scan" for accounts that already have scans, for the split
 // second before the real counts arrive.
 const checklistReady=!promptCountLoading&&!historyLoading;

 const header=<div className="page-title"><div><span className="overline">OVERVIEW</span><h1>Good morning, {firstName} <span>👋</span></h1><p>Here&apos;s how your brand is showing up in AI answers.</p></div></div>;
 // The visible label+arrow are display-only; the actual <select> is an invisible
 // full-cover overlay so the whole pill (including the arrow) is clickable, not just
 // the text -- a bare inline <select> only claims click area for its own text width.
 const trendRangeLabel={"3d":"Last 3 days","7d":"Last 7 days","10d":"Last 10 days"}[trendRange];
 const dateControl=<div className="date-control" style={{position:"relative"}}>
  <span>{trendRangeLabel}</span><ChevronDown/>
  <select value={trendRange} onChange={e=>setTrendRange(e.target.value as "3d"|"7d"|"10d")} aria-label="Trend chart range" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0,cursor:"pointer",border:0}}>
   <option value="3d">Last 3 days</option>
   <option value="7d">Last 7 days</option>
   <option value="10d">Last 10 days</option>
  </select>
 </div>;
 const tabBar=<div className="overview-tabs"><button className={overviewTab==="summary"?"active":""} onClick={()=>setOverviewTab("summary")}>Summary</button><button className={overviewTab==="rankings"?"active":""} onClick={()=>setOverviewTab("rankings")}>Rankings</button><button className={overviewTab==="traffic"?"active":""} onClick={()=>setOverviewTab("traffic")}>Traffic &amp; Reach</button></div>;

 if(demo){
  const demoRangeDays={"3d":3,"7d":7,"10d":10}[trendRange];
  const demoSpark=demoSparkData.filter(d=>isWithinDays(d.date,demoRangeDays));
  return <>{header}
  {tabBar}
  {overviewTab==="summary"&&<>
   <p style={{fontSize:"12px",color:"var(--muted)",margin:"0 0 8px"}}>Last scanned {formatTimestamp(new Date().toISOString(),"datetime")}</p>
   <div style={{display:"flex",gap:"14px",alignItems:"stretch",flexWrap:"wrap"}}>
    <div style={{flex:"1 1 420px"}}><ScoreHero score={67} confidence="Full scan" delta={demoSpark.length>=2?demoSpark[demoSpark.length-1].score-demoSpark[demoSpark.length-2].score:null} sparkData={demoSpark} dateControl={dateControl}/></div>
    <div className="stats-grid" style={{flex:"1 1 320px",gridTemplateColumns:"repeat(2,1fr)"}}><Stat label="Total mentions" value="142" trend="12.4%" icon={Activity}/><Stat label="Average position" value="#2.4" sub="when mentioned" icon={Target}/><Stat label="Prompts tracked" value="183" sub="of 250 monthly" icon={Search}/><Stat label="AI engines" value="6" sub="ChatGPT · Gemini · Perplexity · Claude · DeepSeek · AI Overviews" icon={BarChart3}/></div>
   </div>
   <div className="dashboard-grid" style={{gridTemplateColumns:"1fr"}}>
   <article className="panel engine-panel"><PanelHead title="Visibility by engine" sub="Last 30 days"/>{demoEngines.map(e=><div className="engine-row" key={e.name}><span className={`engine-logo ${e.color}`}>{e.short}</span><div><b>{e.name}</b><i><span style={{width:e.score+"%"}}/></i></div><strong>{e.score}%</strong></div>)}<button className="panel-link" onClick={()=>setSection("prompts")}>View prompt details <ArrowUpRight/></button></article>
   <article className="panel prompt-panel"><PanelHead title="Recent prompt performance" sub="Latest results across all engines" action={<button className="view-all" onClick={()=>setSection("prompts")}>View all <ArrowUpRight/></button>}/><DemoPromptTable short/></article>
   <article className="panel opportunities"><PanelHead title="Top opportunities" sub="AI-recommended actions ranked by impact" action={<button className="view-all" onClick={()=>setSection("fixes")}>View all</button>}/>{[{t:"Add direct comparison content",p:"Your competitors win 14 prompts with comparison pages.",impact:"High",lift:"+12–18%"},{t:"Strengthen third-party citations",p:"AI engines cite 3 sources that don't mention your brand.",impact:"High",lift:"+8–14%"},{t:"Add SoftwareApplication schema",p:"Help engines understand your product entity and pricing.",impact:"Med",lift:"+4–7%"}].map(o=><div className="opportunity" key={o.t}><span className="opp-icon"><Sparkles/></span><div><b>{o.t}</b><p>{o.p}</p><small><em className={o.impact==="High"?"high":"medium"}>{o.impact} impact</em>Estimated lift <strong>{o.lift}</strong></small></div><button onClick={()=>setSection("fixes")}>Fix this <ArrowUpRight/></button></div>)}</article>
   </div>
  </>}
  {overviewTab==="traffic"&&<GscTrafficTab demo brandId={undefined}/>}
  {overviewTab==="rankings"&&<RankingsDetail demo answers={[]}/>}
 </>;
 }

 if(!brand)return <>{header}{tabBar}<EmptyState icon={LayoutDashboard} headline="Your AI visibility score lands here" subtext="Add a client to start tracking how AI engines talk about your brand." primaryLabel="Add a client" onPrimary={()=>setSection("settings")}/></>;
 if(loading)return <>{header}{tabBar}<p>Loading…</p></>;
 if(!latest)return <>{header}{tabBar}
  {checklistReady&&<OnboardingChecklist input={{hasBrand:true,promptCount:promptCount??0,scanCount:history.length}} onNavigate={setSection} onRunScan={scan} brandId={brand.id}/>}
  <EmptyState icon={LayoutDashboard} headline="Your AI visibility score lands here" subtext={`Run your first scan and we'll show how 6 AI engines talk about ${brand.name} — and where competitors win instead.`} primaryLabel={scanning?"Scanning…":"Run first scan"} onPrimary={scan}/>
 </>;

 const summary=summarizeScan(latest);
 const byEngine=groupByEngine(latest.answers);
 const cmp=compareToPrevious(history,latest.runId);
 const delta=cmp.absoluteDelta;
 const trendRangeDays={"3d":3,"7d":7,"10d":10}[trendRange];
 const sparkData=history.filter(h=>isWithinDays(h.completedAt,trendRangeDays)).map(h=>({score:h.score,date:h.completedAt||""}));

 return <>{header}
  {tabBar}
  {checklistReady&&<OnboardingChecklist input={{hasBrand:true,promptCount:promptCount??0,scanCount:history.length}} onNavigate={setSection} onRunScan={scan} brandId={brand.id}/>}
  {overviewTab==="summary"&&<>
   <p style={{fontSize:"12px",color:"var(--muted)",margin:"0 0 8px"}}>Last scanned {formatTimestamp(latest.completedAt,"datetime")}</p>
   <div style={{display:"flex",gap:"14px",alignItems:"stretch",flexWrap:"wrap"}}>
    <div style={{flex:"1 1 420px"}}><ScoreHero score={summary.score} confidence={coverageLabel(latest.confidence??0)} delta={delta} sparkData={sparkData} dateControl={dateControl}/></div>
    <div className="stats-grid" style={{flex:"1 1 320px",gridTemplateColumns:"repeat(2,1fr)"}}>
     <Stat label="Total mentions" value={String(summary.mentions)} sub={`of ${summary.total} answers checked`} icon={Activity}/>
     <Stat label="Average position" value={summary.avgPosition!=null?`#${summary.avgPosition}`:"—"} sub="when mentioned" icon={Target}/>
     <Stat label="Scans run" value={String(history.length||1)} sub={history.length>1?`first scan ${formatTimestamp(history[0]?.completedAt)}`:"baseline scan"} icon={Search}/>
     <Stat label="AI engines" value="6" sub="ChatGPT · Gemini · Perplexity · Claude · DeepSeek · AI Overviews" icon={BarChart3}/>
    </div>
   </div>
   <div className="dashboard-grid" style={{gridTemplateColumns:"1fr"}}>
    <article className="panel engine-panel"><PanelHead title="Visibility by engine" sub="Most recent scan"/>{byEngine.map(e=><div className="engine-row" key={e.key}><span className={`engine-logo ${e.color}`}>{e.short}</span><div><b>{e.name}</b><i><span style={{width:e.pct+"%"}}/></i></div><strong>{e.pct}%</strong></div>)}<button className="panel-link" onClick={()=>setSection("prompts")}>View prompt details <ArrowUpRight/></button></article>
    <article className="panel prompt-panel"><PanelHead title="Recent prompt performance" sub="Latest results across all engines" action={<button className="view-all" onClick={()=>setSection("prompts")}>View all <ArrowUpRight/></button>}/><RealPromptTable answers={latest.answers.slice(0,4)}/></article>
   </div>
   {fixes.length>0&&<article className="panel opportunities" style={{marginTop:"14px"}}><PanelHead title="Top AI-generated fixes" sub="Claude&apos;s recommendations from your most recent scan" action={<button className="view-all" onClick={()=>setSection("fixes")}>View all <ArrowUpRight/></button>}/>{fixes.slice(0,3).map(f=><div className="opportunity" key={f.id}><span className="opp-icon"><Sparkles/></span><div><b>{f.title}</b><p>{f.rationale}</p><small><em className={(f.impact_high||0)>=12?"high":"medium"}>{(f.impact_high||0)>=12?"High":"Med"} impact</em>Estimated lift <strong>+{f.impact_low}–{f.impact_high}%</strong></small></div><button onClick={()=>setSection("fixes")}>View fix <ArrowUpRight/></button></div>)}</article>}
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

type GscData={connected:boolean;propertyUrl?:string;error?:string;overview?:{impressions:number;clicks:number;ctr:number;position:number};queries?:{query:string;impressions:number;clicks:number;ctr:number;position:number}[];trend?:{date:string;impressions:number;clicks:number}[];range?:{start:string;end:string};fetchedAt?:string};
type GscRange="7d"|"30d"|"90d"|"custom";
const GSC_RANGES:{id:GscRange;label:string}[]=[{id:"7d",label:"7 days"},{id:"30d",label:"30 days"},{id:"90d",label:"90 days"},{id:"custom",label:"Custom"}];

function GscTrafficTab({demo,brandId}:{demo:boolean;brandId?:string}){
 const [status,setStatus]=useState<"idle"|"loading"|"connected"|"disconnected"|"error">("idle");
 const [range,setRange]=useState<GscRange>("30d");
 const [customStart,setCustomStart]=useState("");
 const [customEnd,setCustomEnd]=useState("");
 // Session-level cache, one entry per distinct range: switching between 7d/30d/90d (or
 // back to a custom range already fetched) re-renders from memory instead of re-hitting
 // Search Console. Clears on disconnect and on brand switch (fresh brandId -> fresh Map).
 const [cache,setCache]=useState<Map<string,GscData>>(new Map());
 const [disconnecting,setDisconnecting]=useState(false);
 const [retryKey,setRetryKey]=useState(0);
 const [gscError,setGscError]=useState<string|null>(null);

 const cacheKey=range==="custom"?`custom:${customStart}:${customEnd}`:range;
 const data=cache.get(cacheKey)||null;
 const customIncomplete=range==="custom"&&(!customStart||!customEnd);

 useEffect(()=>{setCache(new Map())},[demo,brandId]);

 useEffect(()=>{
  if(demo||!brandId){setStatus("disconnected");return}
  if(customIncomplete)return;
  if(cache.has(cacheKey)){setStatus("connected");return}
  setStatus("loading");
  setGscError(null);
  const params=new URLSearchParams({brandId,range});
  if(range==="custom"){params.set("start",customStart);params.set("end",customEnd)}
  fetch(`/api/gsc/metrics?${params.toString()}`)
   .then(r=>r.json())
   .then((d:GscData)=>{
    if(d.connected&&d.error){setGscError(d.error);setStatus("error");return}
    if(d.connected){setCache(prev=>new Map(prev).set(cacheKey,d));setStatus("connected")}else setStatus("disconnected")
   })
   .catch(()=>setStatus("error"));
 // cache intentionally excluded: it's read (cache.has) to skip a redundant fetch, but
 // only ever written as a RESULT of this effect running, so including it would re-run
 // the effect it just finished.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[demo,brandId,range,customStart,customEnd,retryKey,cacheKey,customIncomplete]);

 async function disconnect(){
  if(!brandId)return;
  setDisconnecting(true);
  try{await fetch(`/api/gsc/disconnect?brandId=${brandId}`,{method:"DELETE"});setStatus("disconnected");setCache(new Map())}
  finally{setDisconnecting(false)}
 }

 const rangePicker=!demo&&brandId&&status!=="disconnected"?<div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap",marginBottom:"14px"}}>
  {GSC_RANGES.map(r=><button key={r.id} className={range===r.id?"button":"button outline"} style={{fontSize:"12px",padding:"6px 12px"}} onClick={()=>setRange(r.id)}>{r.label}</button>)}
  {range==="custom"&&<span style={{display:"flex",gap:"6px",alignItems:"center",marginLeft:"4px"}}>
   <input type="date" value={customStart} max={customEnd||undefined} onChange={e=>setCustomStart(e.target.value)} style={{fontSize:"12px",padding:"5px 8px",borderRadius:"6px",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink)"}}/>
   <span style={{fontSize:"12px",color:"var(--muted)"}}>to</span>
   <input type="date" value={customEnd} min={customStart||undefined} max={new Date().toISOString().split("T")[0]} onChange={e=>setCustomEnd(e.target.value)} style={{fontSize:"12px",padding:"5px 8px",borderRadius:"6px",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink)"}}/>
  </span>}
 </div>:null;

 if(customIncomplete)return <>{rangePicker}<p style={{fontSize:"12px",color:"var(--muted)",padding:"8px 2px"}}>Pick a start and end date to see custom-range traffic.</p></>;
 if(status==="loading")return <>{rangePicker}<div style={{padding:"48px",textAlign:"center",color:"var(--muted)"}}><LoaderCircle size={24} className="spin" style={{display:"inline-block"}}/><p style={{marginTop:"12px",fontSize:"13px"}}>Loading Search Console data…</p></div></>;
 if(status==="error")return <>{rangePicker}<article className="panel" style={{padding:"40px",textAlign:"center"}}><AlertCircle size={28} color="var(--cr)"/><p style={{marginTop:"12px",fontSize:"14px",color:"var(--ink)"}}>Failed to load Search Console data</p>{gscError&&<p style={{marginTop:"6px",fontSize:"12px",color:"var(--muted)",maxWidth:"480px",margin:"6px auto 0"}}>{gscError}</p>}<button className="button outline" style={{marginTop:"16px"}} onClick={()=>setRetryKey(k=>k+1)}>Retry</button></article></>;
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
 if(status==="connected"&&data&&data.overview){
  const overview=data.overview,queries=data.queries||[],trend=data.trend||[];
  const maxImp=Math.max(1,...trend.map(t=>t.impressions));
  const rangeLabel=GSC_RANGES.find(r=>r.id===range)?.label||"selected range";
  return <div>
   {rangePicker}
   <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px",marginBottom:"14px"}}>
    <article className="panel" style={{padding:"18px 20px",borderLeft:"4px solid var(--sky)"}}>
     <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"4px"}}>Impressions</div>
     <div style={{fontSize:"38px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--sky)",letterSpacing:"-1.5px",lineHeight:1}}>{fmtNum(overview.impressions)}</div>
     <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"4px"}}>last {rangeLabel}</div>
    </article>
    <article className="panel" style={{padding:"18px 20px",borderLeft:"4px solid var(--em)"}}>
     <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"4px"}}>Clicks</div>
     <div style={{fontSize:"38px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--em)",letterSpacing:"-1.5px",lineHeight:1}}>{fmtNum(overview.clicks)}</div>
     <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"4px"}}>last {rangeLabel}</div>
    </article>
    <article className="panel" style={{padding:"18px 20px"}}>
     <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"4px"}}>Avg CTR</div>
     <div style={{fontSize:"38px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--ink)",letterSpacing:"-1.5px",lineHeight:1}}>{overview.ctr}%</div>
     <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"4px"}}>click-through rate</div>
    </article>
    <article className="panel" style={{padding:"18px 20px"}}>
     <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"4px"}}>Avg Position</div>
     <div style={{fontSize:"38px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--ink)",letterSpacing:"-1.5px",lineHeight:1}}>#{overview.position}</div>
     <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"4px"}}>in Google Search</div>
    </article>
   </div>
   {trend.length>0&&<article className="panel" style={{padding:"20px 24px",marginBottom:"14px"}}>
    <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"12px"}}>Daily impressions — last {rangeLabel}</div>
    <div style={{display:"flex",gap:"3px",alignItems:"flex-end",height:"54px"}}>
     {trend.map((t,i)=><div key={i} title={`${t.date}: ${fmtNum(t.impressions)}`}
      style={{flex:1,background:"var(--sky)",borderRadius:"2px 2px 0 0",opacity:.5+(t.impressions/maxImp)*.5,height:`${Math.max(4,(t.impressions/maxImp)*54)}px`,transition:"height .2s"}}/>)}
    </div>
   </article>}
   {queries.length>0&&<article className="panel" style={{marginBottom:"14px"}}>
    <div className="panel-head"><div><h3>Top queries</h3><p>Search terms driving the most impressions in the selected range</p></div></div>
    <div className="table-wrap"><table><thead><tr><th>Query</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Avg position</th></tr></thead>
    <tbody>{queries.map((q,i)=><tr key={i}>
     <td style={{maxWidth:"320px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.query}</td>
     <td style={{fontVariantNumeric:"tabular-nums"}}>{fmtNum(q.impressions)}</td>
     <td style={{fontVariantNumeric:"tabular-nums"}}>{fmtNum(q.clicks)}</td>
     <td>{q.ctr}%</td>
     <td>#{q.position}</td>
    </tr>)}</tbody></table></div>
   </article>}
   <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:"11px",color:"var(--muted)",padding:"0 2px",flexWrap:"wrap",gap:"6px"}}>
    <span>Connected: {data.propertyUrl}{data.range&&` · ${data.range.start} to ${data.range.end}`}{data.fetchedAt&&` · fetched ${formatTimestamp(data.fetchedAt,"datetime")}`}</span>
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
function ScoreHero({score,trend,confidence,delta,sparkData,dateControl}:{score:number|string;trend?:string;confidence?:string;delta?:number|null;sparkData?:{score:number;date:string}[];dateControl?:React.ReactNode}){
 const numScore=typeof score==="number"?score:parseInt(String(score))||0;
 const rating=scoreRating(numScore);
 const showDelta=delta!=null&&delta!==0;
 const deltaColor=delta!=null&&delta>=0?"var(--em,#10B981)":"#ef4444";
 const deltaSign=delta!=null&&delta>0?"+":"";
 return <div data-tour="score-hero" style={{background:"var(--surface,#fff)",border:"1px solid var(--line)",borderRadius:"10px",padding:"24px 28px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"32px",borderLeft:`4px solid ${rating.color}`}}>
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
  {sparkData&&<div style={{marginLeft:"auto",display:"flex",alignItems:"stretch",gap:"24px"}}>
   <div style={{width:"1px",alignSelf:"stretch",background:"var(--line)",opacity:.6}}/>
   {sparkData.length>=2
    ?<div style={{display:"flex",flexDirection:"column",gap:"6px",width:"260px"}}>{dateControl&&<div style={{alignSelf:"flex-end"}}>{dateControl}</div>}<MiniBarChart data={sparkData}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>{showDelta&&<span style={{fontSize:"15px",fontWeight:700,fontFamily:"Outfit,system-ui",color:deltaColor,letterSpacing:"-0.3px"}}>{deltaSign}{delta} pts vs last scan</span>}<span style={{fontSize:"11px",color:"var(--muted,#64748B)",marginLeft:"auto"}}>{sparkData.length} scan{sparkData.length!==1?"s":""} tracked</span></div></div>
    :<div style={{textAlign:"right",maxWidth:"160px"}}>{dateControl}<span style={{fontSize:"11px",color:"var(--muted,#64748B)",lineHeight:1.5,display:"block",marginTop:"8px"}}>{sparkData.length===0?"No scans in this range":"Only 1 scan in this range"} — try a wider window to see a trend</span></div>}
  </div>}
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

function Prompts({demo,brand,refreshKey,newUser}:{demo:boolean;brand?:Brand;refreshKey:number;newUser:boolean}){
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
  <TabTip tabId="prompts" newUser={newUser} text="These are the buyer-intent questions we'll ask every AI engine. Edit or add your own — changes take effect on your next scan."/>
  {loading?<p>Loading…</p>:!prompts.length?<EmptyState icon={Search} headline="No prompts tracked yet" subtext={`Add the buyer-intent questions real customers ask AI about ${brand.name}'s category — each one is checked against every engine on your next scan.`} primaryLabel="+ Add your own prompt" onPrimary={()=>setModal(true)}/>:<>
   {latest&&<article className="panel prompt-full" style={{marginBottom:"14px"}}><PromptMatrix prompts={prompts} answers={latest.answers}/></article>}
   <article className="panel prompt-full">
    <div className="panel-head"><div><h3>Prompt list</h3><p>Click any prompt to edit. Changes take effect on the next scan.</p></div></div>
    <div style={{padding:"0 0 8px"}}>
     {prompts.map(p=><div key={p.id} style={{display:"flex",alignItems:"flex-start",gap:"10px",padding:"10px 16px",borderBottom:"1px solid var(--line)"}}>
      {editId===p.id
       ?<><textarea autoFocus value={editText} onChange={e=>setEditText(e.target.value)} rows={2} style={{flex:1,resize:"vertical",fontSize:"13px",padding:"6px 8px",borderRadius:"6px",border:"1px solid var(--sky,#0EA5E9)",fontFamily:"inherit"}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();saveEdit(p.id)}if(e.key==="Escape")setEditId(null)}}/><button className="button" style={{padding:"5px 12px",fontSize:"12px"}} onClick={()=>saveEdit(p.id)} disabled={saving}>{saving?"…":"Save"}</button><button className="icon-btn" onClick={()=>setEditId(null)} title="Cancel"><X/></button></>
       :<><span style={{flex:1,fontSize:"13px",lineHeight:1.5,cursor:"pointer",color:"var(--text)"}} onClick={()=>{setEditId(p.id);setEditText(p.query)}}>{p.query}</span><button className="icon-btn" title="Edit" onClick={()=>{setEditId(p.id);setEditText(p.query)}}><Edit2 size={13}/></button><button className="icon-btn" title="Remove" onClick={()=>deletePrompt(p.id)}><Trash2 size={13}/></button></>}
     </div>)}
    </div>
   </article>
  </>}
  {modal&&<div className="modal-back"><div className="modal"><button className="modal-x" onClick={()=>setModal(false)}><X/></button><span className="feature-icon"><Search/></span><h2>Add a prompt</h2><p>Write a question a buyer would ask when researching your category.</p><form onSubmit={addPrompt}><label>Prompt<input autoFocus required value={newQuery} onChange={e=>setNewQuery(e.target.value)} placeholder="e.g. Best greeting cards to send for birthdays"/></label><button className="button" disabled={saving}>{saving?"Adding…":"Add prompt"}</button></form></div></div>}
 </>;
}

// Wraps every case-insensitive occurrence of `needle` in <mark>. Plain substring match is
// enough here — this is a transparency aid ("see the data behind the score"), not search.
function highlightMentions(text:string,needle:string):React.ReactNode{
 if(!needle.trim())return text;
 const re=new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`,"gi");
 const parts=text.split(re);
 if(parts.length===1)return text;
 return parts.map((part,i)=>re.test(part)&&part.toLowerCase()===needle.toLowerCase()?<mark key={i} style={{background:"var(--am-d,#FEF3C7)",color:"var(--ink)",borderRadius:"3px",padding:"0 2px"}}>{part}</mark>:<Fragment key={i}>{part}</Fragment>);
}

const demoAnswerText:Record<string,string>={
 "ChatGPT":"For SaaS teams that need to track how they're represented across AI search, tools like Acme Software stand out for combining multi-engine monitoring with actionable fixes. It's worth a look if visibility into ChatGPT and Gemini results matters to your team.",
 "Gemini":"A few platforms in this space are worth comparing, including Acme Software, which focuses on tracking brand mentions across AI answer engines and suggesting content changes to improve visibility.",
 "Perplexity":"Most teams handle this with a mix of SEO monitoring and manual prompt testing — I don't have a specific tool to point to for this exact use case.",
 "Claude":"Acme Software is one option here — it runs prompts across several AI engines concurrently and scores how a brand is mentioned, positioned, and framed in the responses.",
 "DeepSeek":"There isn't a single dominant tool for this yet. Teams often build internal tracking or use general SEO platforms until something purpose-built emerges."
};

// Latest scan only, mirroring the Reports card pattern (one report = one scan's answers) —
// no scan picker. Reuses GET /api/reports/[runId] (already returns raw_answer as `text`,
// added 2026-08-02 per session_notes.md #10) rather than duplicating that query client-side.
function Answers({demo,brand,refreshKey,scan,scanning,newUser}:{demo:boolean;brand?:Brand;refreshKey:number;scan:()=>void;scanning:boolean;newUser:boolean}){
 const {scan:latest,loading:latestLoading}=useLatestScan(demo,brand,refreshKey);
 const [report,setReport]=useState<ReportDetail|null>(null);
 const [loading,setLoading]=useState(false);
 const [engineFilter,setEngineFilter]=useState("all");
 const [statusFilter,setStatusFilter]=useState<"all"|"mentioned"|"missed">("all");
 const [expandedId,setExpandedId]=useState<string|null>(null);
 const [retryKey,setRetryKey]=useState(0);

 useEffect(()=>{
  if(demo||!latest)return;
  let cancelled=false;
  (async()=>{setLoading(true);const r=await fetch(`/api/reports/${latest.runId}`);const j=await r.json().catch(()=>({}));if(!cancelled){setReport(j.run?j:null);setLoading(false)}})();
  return ()=>{cancelled=true};
 },[demo,latest?.runId,retryKey]);

 const header=<><div className="page-title"><div><span className="overline">TRANSPARENCY</span><h1>Answers</h1><p>Every engine&apos;s raw response from your latest scan, in full.</p></div></div><TabTip tabId="answers" newUser={newUser} text="Every engine's raw response lands here after a scan — your brand's mention is highlighted so you can check exactly what each AI said."/></>;

 if(demo){
  const brandName="Acme Software";
  const rows=demoPrompts.map((p,i)=>({id:String(i),engine:p.engine,prompt:p.q,brand_mentioned:p.status==="Mentioned",position:p.position,sentiment:p.sentiment,text:demoAnswerText[p.engine]||""}));
  return <>{header}<div className="table-wrap"><table><thead><tr><th style={{width:"24px"}}></th><th>Prompt</th><th>Engine</th><th>Status</th><th>Position</th><th>Sentiment</th></tr></thead><tbody>{rows.map(a=>{const open=expandedId===a.id;return <Fragment key={a.id}>
   <tr onClick={()=>setExpandedId(open?null:a.id)} style={{cursor:"pointer"}}>
    <td><ChevronDown style={{width:"14px",color:"var(--faint)",transition:"transform .15s",transform:open?"rotate(0deg)":"rotate(-90deg)"}}/></td>
    <td><b>{a.prompt}</b></td><td>{a.engine}</td>
    <td><span className={a.brand_mentioned?"status yes":"status no"}>{a.brand_mentioned?"Mentioned":"Not mentioned"}</span></td>
    <td>{a.position?`#${a.position}`:"—"}</td><td>{a.sentiment}</td>
   </tr>
   {open&&<tr><td></td><td colSpan={5} style={{background:"var(--soft)",padding:"14px 16px",fontSize:"12px",lineHeight:1.6,color:"var(--ink)",whiteSpace:"pre-wrap"}}>{highlightMentions(a.text,brandName)}</td></tr>}
  </Fragment>})}</tbody></table></div></>;
 }

 if(!brand)return <>{header}<EmptyState icon={MessageSquare} headline="Every engine's answer, in full" subtext="Add a client first — you'll see each engine's raw response here after your first scan."/></>;
 if(latestLoading||loading)return <>{header}<p>Loading…</p></>;
 if(!latest)return <>{header}<EmptyState icon={MessageSquare} headline="Every engine's answer, in full" subtext={`After your first scan, you'll see each engine's raw response with ${brand.name}'s mention highlighted, its position, and the sentiment we scored.`} primaryLabel={scanning?"Scanning…":"Run first scan"} onPrimary={scan}/></>;
 if(!report)return <>{header}<EmptyState icon={AlertCircle} headline="Couldn't load this scan's answers" subtext="Something went wrong loading the raw responses for your latest scan. Try again." primaryLabel="Retry" onPrimary={()=>setRetryKey(k=>k+1)}/></>;

 const engineKeys=[...new Set(report.answers.map(a=>a.engine))];
 const filtered=report.answers.filter(a=>(engineFilter==="all"||a.engine===engineFilter)&&(statusFilter==="all"||(statusFilter==="mentioned")===a.brand_mentioned));

 return <>{header}
  <div className="filterbar" style={{marginBottom:"14px"}}>
   <select value={engineFilter} onChange={e=>setEngineFilter(e.target.value)} style={{fontSize:"12px",padding:"7px 10px",borderRadius:"7px",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink)"}}>
    <option value="all">All engines</option>
    {engineKeys.map(k=><option key={k} value={k}>{engineByKey[k]?.name||k}</option>)}
   </select>
   <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)} style={{fontSize:"12px",padding:"7px 10px",borderRadius:"7px",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink)"}}>
    <option value="all">All statuses</option>
    <option value="mentioned">Mentioned</option>
    <option value="missed">Not mentioned</option>
   </select>
  </div>
  {filtered.length===0
   ?<EmptyState icon={MessageSquare} headline="No answers match these filters" subtext="Try a different engine or status filter." primaryLabel="Clear filters" onPrimary={()=>{setEngineFilter("all");setStatusFilter("all")}}/>
   :<article className="panel" style={{padding:0}}>
    <div className="table-wrap"><table><thead><tr><th style={{width:"24px"}}></th><th>Prompt</th><th>Engine</th><th>Status</th><th>Position</th><th>Sentiment</th></tr></thead><tbody>{filtered.map(a=>{const open=expandedId===a.id;return <Fragment key={a.id}>
     <tr onClick={()=>setExpandedId(open?null:a.id)} style={{cursor:"pointer"}}>
      <td><ChevronDown style={{width:"14px",color:"var(--faint)",transition:"transform .15s",transform:open?"rotate(0deg)":"rotate(-90deg)"}}/></td>
      <td><b>{a.prompt}</b></td>
      <td>{engineByKey[a.engine]?.name||a.engine}</td>
      <td><span className={a.brand_mentioned?"status yes":"status no"}>{a.brand_mentioned?"Mentioned":"Not mentioned"}</span></td>
      <td>{a.position?`#${a.position}`:"—"}</td>
      <td>{a.sentiment==="not-mentioned"?"—":a.sentiment}</td>
     </tr>
     {open&&<tr><td></td><td colSpan={5} style={{background:"var(--soft)",padding:"14px 16px",fontSize:"12px",lineHeight:1.6,color:"var(--ink)",whiteSpace:"pre-wrap"}}>
      {a.text?highlightMentions(a.text,report.brand.name):<span style={{color:"var(--muted)",fontStyle:"italic"}}>No response text recorded for this answer — this can happen when a provider returned an empty or incomplete response.</span>}
      {a.createdAt&&<div style={{marginTop:"10px",fontSize:"11px",color:"var(--muted)"}}>Answered {formatTimestamp(a.createdAt,"datetime")}</div>}
     </td></tr>}
    </Fragment>})}</tbody></table></div>
   </article>}
 </>;
}

const FIX_CATEGORY_ORDER=["content","authority","schema","reviews","gbp"] as const;
const FIX_CATEGORY_LABEL:Record<string,string>={content:"Content",authority:"Authority",schema:"Schema",reviews:"Reviews",gbp:"Business profile"};
const fixCategoryClass=(category:string)=>({schema:"blue",content:"purple",authority:"green",reviews:"orange",gbp:"orange"} as Record<string,string>)[category]||"purple";
const FIX_CATEGORY_DOT:Record<string,string>={content:"var(--sky)",authority:"var(--em)",schema:"#1D4ED8",reviews:"var(--am)",gbp:"var(--am)"};
const fixStatusColor:Record<string,string>={pending:"var(--muted,#64748B)",implementing:"var(--sky,#0EA5E9)",done:"var(--em,#10B981)"};
const fixStatusLabel:Record<string,string>={pending:"Pending",implementing:"Implementing",done:"Done ✓"};

// Shared by real and demo fix lists so both get the same categorized layout. Only shows a
// pill for categories actually present in the data — an empty "Reviews (0)" pill would be
// clutter, not guidance, mirroring how SeoAuditTab hides empty category panels.
function FixCategoryTabs({items,active,onChange}:{items:{category:string}[];active:string;onChange:(c:string)=>void}){
 const present=FIX_CATEGORY_ORDER.filter(c=>items.some(i=>i.category===c));
 return <div className="fix-cat-tabs">
  <button className={active==="all"?"fix-cat-tab active":"fix-cat-tab"} onClick={()=>onChange("all")}><span className="dot" style={{background:"var(--muted)"}}/>All fixes<span className="cnt">{items.length}</span></button>
  {present.map(c=><button key={c} className={active===c?"fix-cat-tab active":"fix-cat-tab"} onClick={()=>onChange(c)}><span className="dot" style={{background:FIX_CATEGORY_DOT[c]}}/>{FIX_CATEGORY_LABEL[c]}<span className="cnt">{items.filter(i=>i.category===c).length}</span></button>)}
 </div>;
}

function FixStatusControl({status,busy,onSet}:{status:string;busy:boolean;onSet:(s:string)=>void}){
 return <div className="fix-status-row"><div className="fix-status-label">Status — track across scans</div><div className="fix-status">{(["pending","implementing","done"] as const).map(s=>{const on=status===s;return <button key={s} className={on?"on":""} style={on?{background:fixStatusColor[s]}:undefined} disabled={busy||on} onClick={()=>onSet(s)}>{busy&&!on?"…":fixStatusLabel[s]}</button>})}</div></div>;
}

const DEMO_FIXES=[
 {id:"d1",category:"content",title:"Create an alternatives comparison page",desc:"You're absent from 8 high-intent prompts where direct competitors have detailed comparison pages.",lift:"12–18%",effort:"~25 min",status:"pending"},
 {id:"d2",category:"content",title:"Publish a buyer's guide for your category",desc:"AI engines cite structured guides more often than product pages alone.",lift:"6–10%",effort:"~40 min",status:"implementing"},
 {id:"d3",category:"authority",title:"Earn mentions from 3 cited sources",desc:"These publications appear in 41% of winning answers but don't currently mention Acme.",lift:"8–14%",effort:"~2 hrs",status:"pending"},
 {id:"d4",category:"authority",title:"Get listed on G2 and Capterra",desc:"AI engines pull comparison data from review aggregators when answering.",lift:"5–9%",effort:"~30 min",status:"done"},
 {id:"d5",category:"schema",title:"Add SoftwareApplication schema",desc:"Clarify your product category, pricing, features, and reviews for answer engines.",lift:"4–7%",effort:"~10 min",status:"pending"},
 {id:"d6",category:"reviews",title:"Respond to your 2 most recent reviews",desc:"Engines weigh recency and responsiveness when framing sentiment.",lift:"3–6%",effort:"~15 min",status:"pending"},
 {id:"d7",category:"gbp",title:"Complete your Google Business Profile",desc:"Missing hours and category fields reduce confidence in local answers.",lift:"4–8%",effort:"~10 min",status:"implementing"}
];

function Fixes({demo,brand,refreshKey,newUser,onViewProgressReport}:{demo:boolean;brand?:Brand;refreshKey:number;newUser:boolean;onViewProgressReport:()=>void}){
 const [fixes,setFixes]=useState<Fix[]>([]);
 const [loading,setLoading]=useState(!demo);
 const [updatingId,setUpdatingId]=useState<string|null>(null);
 const [catTab,setCatTab]=useState("all");
 const [demoStatus,setDemoStatus]=useState<Record<string,string>>(()=>Object.fromEntries(DEMO_FIXES.map(f=>[f.id,f.status])));

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

 const pageHeader=<><div className="page-title"><div><span className="overline">AI FIX GENERATOR</span><h1>Turn gaps into growth</h1><p>{demo?"Actionable recommendations based on where competitors beat you.":brand?`Recommendations for ${brand.name} from your most recent scan.`:"Add a client and run a scan to generate recommendations."}</p></div><button className="button outline" onClick={onViewProgressReport}>View progress report</button></div><TabTip tabId="fixes" newUser={newUser} text="After a scan, Claude suggests specific fixes to improve your score — track each one from pending to done."/></>;

 if(demo){
  const shown=catTab==="all"?DEMO_FIXES:DEMO_FIXES.filter(f=>f.category===catTab);
  return <>{pageHeader}
   <FixCategoryTabs items={DEMO_FIXES} active={catTab} onChange={setCatTab}/>
   <div className="fix-grid">{shown.map(f=><article className="fix-card" key={f.id}><div><span className={`fix-type ${fixCategoryClass(f.category)}`}>{FIX_CATEGORY_LABEL[f.category]}</span></div><span className="big-fix-icon"><WandSparkles/></span><h3>{f.title}</h3><p>{f.desc}</p><div className="lift"><span>Estimated lift<b>{f.lift}</b></span><span>Time to implement<b>{f.effort}</b></span></div><FixStatusControl status={demoStatus[f.id]} busy={false} onSet={s=>setDemoStatus(prev=>({...prev,[f.id]:s}))}/></article>)}</div>
  </>;
 }

 if(!brand)return <>{pageHeader}<p style={{color:"var(--muted)",fontSize:"13px"}}>Add a client first to generate AI fixes.</p></>;
 if(loading)return <>{pageHeader}</>;
 if(!fixes.length)return <>{pageHeader}<div className="panel" style={{padding:"32px",textAlign:"center"}}><WandSparkles style={{width:"32px",color:"var(--faint)",marginBottom:"12px"}}/><p style={{margin:"0 0 6px",fontWeight:600}}>No fixes yet for {brand.name}</p><p style={{margin:0,fontSize:"13px",color:"var(--muted)"}}>Click <b>Run scan</b> — Claude generates fix suggestions automatically from the results.</p></div></>;

 const shown=catTab==="all"?fixes:fixes.filter(f=>f.category===catTab);

 return <>{pageHeader}
  <FixCategoryTabs items={fixes} active={catTab} onChange={setCatTab}/>
  <div className="fix-grid">{shown.map(f=>{const busy=updatingId===f.id;const st=f.status||"pending";return <article className="fix-card" key={f.id}><div><span className={`fix-type ${fixCategoryClass(f.category)}`}>{FIX_CATEGORY_LABEL[f.category]||f.category}</span></div><span className="big-fix-icon"><WandSparkles/></span><h3>{f.title}</h3><p>{f.rationale}</p>{f.generated_content&&<FixContent content={f.generated_content}/>}<div className="lift"><span>Estimated lift<b>+{f.impact_low}–{f.impact_high}%</b></span><span>Added<b>{formatTimestamp(f.created_at,"date")}</b></span></div><FixStatusControl status={st} busy={busy} onSet={s=>setStatus(f.id,s)}/></article>})}</div>
 </>;
}

function SeoAuditPage({demo,brand,onViewProgressReport}:{demo:boolean;brand?:Brand;onViewProgressReport:()=>void}){
 return <>
  <div className="page-title"><div><span className="overline">SEO AUDIT</span><h1>Technical SEO health</h1><p>{demo?"Technical SEO, on-page metadata, content, links, and structured data.":brand?`Audit results for ${brand.name}.`:"Add a client to run an SEO audit."}</p></div><button className="button outline" onClick={onViewProgressReport}>View SEO report</button></div>
  <SeoAuditTab demo={demo} brand={brand}/>
 </>;
}

type SeoCheckCategory="technical"|"meta"|"content"|"links"|"schema"|"mobile"|"performance"|"accessibility";
type IssueTrend="fixed"|"broken"|"unchanged"|null;
type SeoCheck={id:string;label:string;category:SeoCheckCategory;status:"pass"|"warning"|"fail";message:string;recommendation?:string;trend?:IssueTrend};
type SeoAuditData={id:string;domain:string;overallScore:number;createdAt:string;checks:SeoCheck[]};

// Tab ids double as check categories (see lib/seo/checks.ts) except "overview" and
// "recommendations", which are computed views over the same check list rather than a
// stored category. This is the 10-tab layout from the spec, mapped onto what this app
// can actually measure: the last two (performance/accessibility) only have data once
// PAGESPEED_API_KEY is configured — otherwise their panels say so honestly instead of
// showing fabricated scores.
const SEO_TABS:{id:string;label:string}[]=[
 {id:"overview",label:"Overview"},{id:"technical",label:"Technical SEO"},{id:"meta",label:"On-page SEO"},{id:"content",label:"Content"},
 {id:"performance",label:"Performance"},{id:"mobile",label:"Mobile"},{id:"accessibility",label:"Accessibility"},{id:"links",label:"Links"},
 {id:"schema",label:"Structured Data"},{id:"recommendations",label:"Recommendations"},
];
const seoStatusIcon=(s:string)=>s==="pass"?"✓":s==="warning"?"!":"✗";
const seoStatusBg=(s:string)=>s==="pass"?"var(--em-d,#DCFCE7)":s==="warning"?"var(--am-d,#FEF3C7)":"#FEE2E2";
const seoStatusColor=(s:string)=>s==="pass"?"var(--em)":s==="warning"?"var(--am)":"var(--cr)";

function SeoTrendPill({trend}:{trend?:IssueTrend}){
 if(!trend||trend==="unchanged")return null;
 const fixed=trend==="fixed";
 return <span style={{fontSize:"9px",fontWeight:700,padding:"2px 6px",borderRadius:"4px",background:fixed?"var(--em-d,#DCFCE7)":"#FEE2E2",color:fixed?"var(--em)":"var(--cr)",marginLeft:"7px",textTransform:"uppercase",letterSpacing:".3px"}}>{fixed?"Fixed":"New"}</span>;
}
function SeoCheckRow({c}:{c:SeoCheck}){
 return <div style={{display:"flex",gap:"12px",alignItems:"flex-start",padding:"12px 16px",borderBottom:"1px solid var(--line)",maxWidth:"100%"}}>
  <span style={{fontSize:"10px",fontWeight:800,width:"20px",height:"20px",minWidth:"20px",borderRadius:"50%",background:seoStatusBg(c.status),color:seoStatusColor(c.status),display:"flex",alignItems:"center",justifyContent:"center",marginTop:"1px"}}>{seoStatusIcon(c.status)}</span>
  <div style={{flex:1,minWidth:0}}>
   <div style={{fontWeight:600,fontSize:"12px",color:"var(--ink)",display:"flex",alignItems:"center",flexWrap:"wrap"}}>{c.label}<SeoTrendPill trend={c.trend}/></div>
   <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px",overflowWrap:"break-word",wordBreak:"break-word"}}>{c.message}</div>
   {c.recommendation&&<div style={{fontSize:"10.5px",color:"var(--sky)",marginTop:"5px",fontWeight:600,overflowWrap:"break-word",wordBreak:"break-word"}}>→ {c.recommendation}</div>}
  </div>
  <span style={{fontSize:"10px",fontWeight:700,padding:"2px 7px",borderRadius:"4px",background:seoStatusBg(c.status),color:seoStatusColor(c.status),flexShrink:0,textTransform:"uppercase"}}>{c.status}</span>
 </div>;
}

const DEMO_SEO_AUDIT:SeoAuditData={id:"demo",domain:"acme.co",overallScore:72,createdAt:new Date().toISOString(),checks:[
 {id:"https",label:"HTTPS enabled",category:"technical",status:"pass",message:"Site uses HTTPS encryption"},
 {id:"title",label:"Page title",category:"meta",status:"pass",message:'Title: "Acme Software - AI Workflow Tools" (38 chars)'},
 {id:"meta_description",label:"Meta description",category:"meta",status:"warning",message:"Found (95 chars)",recommendation:"Description too short — aim for 100–160 characters"},
 {id:"h1",label:"H1 heading",category:"content",status:"pass",message:"Single H1 tag found ✓"},
 {id:"h2",label:"H2 subheadings",category:"content",status:"pass",message:"4 H2 headings found"},
 {id:"internal_links",label:"Internal linking",category:"links",status:"warning",message:"3 links found on homepage",recommendation:"Add more internal links to key pages"},
 {id:"canonical",label:"Canonical URL",category:"technical",status:"pass",message:"Canonical tag present"},
 {id:"schema",label:"Structured data (Schema.org)",category:"schema",status:"fail",message:"No structured data found",recommendation:"Add Schema.org markup (Organization or SoftwareApplication) — AI engines use structured data to cite and understand your brand"},
 {id:"viewport",label:"Mobile viewport",category:"mobile",status:"pass",message:"Viewport meta tag present — mobile-friendly"},
 {id:"img_alt",label:"Image alt text",category:"content",status:"warning",message:"8/12 images have alt text",recommendation:"Add descriptive alt text to 4 images"},
 {id:"pagespeed_performance",label:"Performance score",category:"performance",status:"warning",message:"68/100 (Google PageSpeed, mobile)",recommendation:"Reduce render-blocking resources and image sizes"},
 {id:"pagespeed_accessibility",label:"Accessibility score",category:"accessibility",status:"pass",message:"94/100 (Google PageSpeed, mobile)"},
]};

type SeoAuditHistoryEntry={id:string;overallScore:number;createdAt:string;checksCount:number};
// Newest first, matching the real /api/seo-audit/history endpoint's ordering (order by
// created_at desc) -- callers .reverse() this when they need oldest-first for a trend chart.
const DEMO_SEO_HISTORY:SeoAuditHistoryEntry[]=[
 {id:"d4",overallScore:72,createdAt:new Date().toISOString(),checksCount:12},
 {id:"d3",overallScore:67,createdAt:daysAgoIso(7),checksCount:12},
 {id:"d2",overallScore:63,createdAt:daysAgoIso(14),checksCount:12},
 {id:"d1",overallScore:58,createdAt:daysAgoIso(21),checksCount:12},
];

function SeoAuditTab({demo,brand}:{demo:boolean;brand?:Brand}){
 const [tab,setTab]=useState("overview");
 const [audit,setAudit]=useState<SeoAuditData|null>(null);
 const [loading,setLoading]=useState(!demo);
 const [running,setRunning]=useState(false);
 const [error,setError]=useState("");
 const [history,setHistory]=useState<SeoAuditHistoryEntry[]>([]);

 async function loadLatest(){
  if(!brand)return;
  const r=await fetch(`/api/seo-audit/latest?brandId=${encodeURIComponent(brand.id)}`);
  const j=await r.json().catch(()=>({}));
  setAudit(j.audit||null);
  const hr=await fetch(`/api/seo-audit/history?brandId=${encodeURIComponent(brand.id)}`);
  const hj=await hr.json().catch(()=>({}));
  setHistory(hj.audits||[]);
 }

 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{
   setLoading(true);
   const [r,hr]=await Promise.all([
    fetch(`/api/seo-audit/latest?brandId=${encodeURIComponent(brand.id)}`),
    fetch(`/api/seo-audit/history?brandId=${encodeURIComponent(brand.id)}`),
   ]);
   const [j,hj]=await Promise.all([r.json().catch(()=>({})),hr.json().catch(()=>({}))]);
   if(!cancelled){setAudit(j.audit||null);setHistory(hj.audits||[]);setLoading(false)}
  })();
  return ()=>{cancelled=true};
 },[demo,brand]);

 async function runAudit(){
  if(!brand)return;
  setRunning(true);setError("");
  try{
   const r=await fetch("/api/seo-audit/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({brandId:brand.id})});
   const j=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(j.error||"Audit failed.");
   await loadLatest();
  }catch(err){setError(err instanceof Error?err.message:"Audit failed.")}
  finally{setRunning(false)}
 }

 const data=demo?DEMO_SEO_AUDIT:audit;

 if(!demo&&!brand)return <div style={{textAlign:"center",padding:"60px 40px"}}><p style={{color:"var(--muted)",fontSize:"13px"}}>Add a client first to run an SEO audit.</p></div>;
 if(!demo&&loading)return <div style={{textAlign:"center",padding:"60px 40px"}}><LoaderCircle className="spin" style={{width:"32px",color:"var(--sky)"}}/></div>;

 if(!data)return <div style={{textAlign:"center",padding:"60px 40px"}}>
  <Globe style={{width:"40px",color:"var(--faint)",marginBottom:"16px"}}/>
  <h3 style={{margin:"0 0 8px",font:"700 18px 'Outfit',system-ui",color:"var(--ink)"}}>Technical SEO Audit</h3>
  <p style={{color:"var(--muted)",fontSize:"13px",maxWidth:"420px",margin:"0 auto 24px",lineHeight:1.6}}>Checks technical SEO, on-page metadata, content, links, and structured data — plus real Performance and Accessibility scores from Google PageSpeed Insights where configured.</p>
  {error&&<div className="checker-error" style={{maxWidth:"420px",margin:"0 auto 16px",textAlign:"left"}}><AlertCircle/><div><b>Audit failed</b><p>{error}</p></div></div>}
  {!brand?.domain?<p style={{color:"var(--cr)",fontSize:"12px"}}>No domain configured for this brand.</p>:<button className="button" onClick={runAudit} disabled={running}>{running?<LoaderCircle className="spin" size={14}/>:<Globe size={14}/>}{running?"Auditing…":`Audit ${brand.domain}`}</button>}
 </div>;

 const passed=data.checks.filter(c=>c.status==="pass").length;
 const warnings=data.checks.filter(c=>c.status==="warning").length;
 const failed=data.checks.filter(c=>c.status==="fail").length;
 const scoreColor=data.overallScore>=70?"var(--em)":data.overallScore>=50?"var(--am)":"var(--cr)";
 const issues=[...data.checks].filter(c=>c.status!=="pass").sort((a,b)=>(a.status==="fail"?0:1)-(b.status==="fail"?0:1));
 const checksFor=(cat:string)=>data.checks.filter(c=>c.category===cat);

 const trendData=(demo?DEMO_SEO_HISTORY:history).slice().reverse().map(h=>({label:formatTimestamp(h.createdAt,"date"),value:h.overallScore}));

 return <div style={{maxWidth:"100%",overflowX:"hidden"}}>
  <div data-tour="score-hero" style={{background:"var(--surface,#fff)",border:"1px solid var(--line)",borderRadius:"10px",padding:"24px 28px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"32px",borderLeft:`4px solid ${scoreColor}`,flexWrap:"wrap"}}>
   <div>
    <span style={{display:"block",fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted,#64748B)",marginBottom:"4px"}}>SEO Score</span>
    <div style={{display:"flex",alignItems:"baseline",gap:"14px"}}>
     <span style={{fontSize:"76px",fontWeight:800,lineHeight:1,fontFamily:"Outfit,system-ui,sans-serif",color:scoreColor,letterSpacing:"-4px"}}>{data.overallScore}</span>
    </div>
    <div style={{marginTop:"10px",display:"flex",gap:"20px",alignItems:"center"}}>
     <div style={{textAlign:"center"}}><div style={{fontSize:"20px",fontWeight:800,fontFamily:"Outfit",color:"var(--em)",letterSpacing:"-1px"}}>{passed}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>Passed</div></div>
     <div style={{textAlign:"center"}}><div style={{fontSize:"20px",fontWeight:800,fontFamily:"Outfit",color:"var(--am)",letterSpacing:"-1px"}}>{warnings}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>Warnings</div></div>
     <div style={{textAlign:"center"}}><div style={{fontSize:"20px",fontWeight:800,fontFamily:"Outfit",color:"var(--cr)",letterSpacing:"-1px"}}>{failed}</div><div style={{fontSize:"11px",color:"var(--muted)"}}>Failed</div></div>
    </div>
   </div>
   <div style={{marginLeft:"auto",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"6px"}}>
    <span style={{fontSize:"12px",color:"var(--muted)"}}>Audited: <b style={{color:"var(--ink)"}}>{data.domain}</b></span>
    <span style={{fontSize:"11px",color:"var(--muted)"}}>{formatTimestamp(data.createdAt,"datetime")}</span>
    {!demo&&<button className="button outline" onClick={runAudit} disabled={running} style={{fontSize:"12px",padding:"6px 12px"}}>{running?"Auditing…":"Re-audit"}</button>}
   </div>
  </div>
  {error&&<div className="checker-error" style={{marginBottom:"14px"}}><AlertCircle/><div><b>Audit failed</b><p>{error}</p></div></div>}
  <Tabs tabs={SEO_TABS} active={tab} onChange={setTab}/>
  <div style={{marginTop:"14px"}}>
   <TabPanel id="overview" active={tab}>
    <p style={{fontSize:"13px",color:"var(--muted)",margin:"0 0 14px",lineHeight:1.6}}>{failed>0?`${failed} check${failed!==1?"s":""} need attention, ${warnings} warning${warnings!==1?"s":""} to review.`:warnings>0?`No critical issues — ${warnings} warning${warnings!==1?"s":""} to review.`:"No issues found in this audit."}</p>
    {trendData.length>=2&&<article className="panel" style={{padding:"20px 24px",marginBottom:"14px"}}>
     <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"12px"}}>SEO score trend</div>
     <ScoreTrendChart data={trendData} yMax={100} color="var(--sky)"/>
    </article>}
    <article className="panel">{data.checks.map(c=><SeoCheckRow key={c.id} c={c}/>)}</article>
   </TabPanel>
   {(["technical","meta","content","performance","mobile","accessibility","links","schema"] as const).map(cat=>
    <TabPanel key={cat} id={cat} active={tab}>
     {checksFor(cat).length===0
      ?<div style={{padding:"32px",textAlign:"center",color:"var(--muted)",fontSize:"13px"}}>No {SEO_TABS.find(t=>t.id===cat)?.label.toLowerCase()} data in this audit{(cat==="performance"||cat==="accessibility")?" — set PAGESPEED_API_KEY in Vercel to enable this.":"."}</div>
      :<article className="panel">{checksFor(cat).map(c=><SeoCheckRow key={c.id} c={c}/>)}</article>}
    </TabPanel>
   )}
   <TabPanel id="recommendations" active={tab}>
    {issues.length===0
     ?<div style={{padding:"32px",textAlign:"center",color:"var(--muted)",fontSize:"13px"}}>Nothing to fix — every check passed.</div>
     :<article className="panel">{issues.map(c=><SeoCheckRow key={c.id} c={c}/>)}</article>}
   </TabPanel>
  </div>
  {!demo&&<p style={{fontSize:"11px",color:"var(--faint)",marginTop:"14px"}}>Status is compared automatically against your previous audit for this brand — fixed and newly-broken checks are flagged above, no manual tracking needed.</p>}
 </div>;
}

// Real mode (demo=false) diverges deliberately from the static demo below: the "Share of AI
// voice" percentage-bars panel is demo-only, because those percentages come from scan_runs/
// answers, which aren't wired yet — showing real competitor names next to fabricated scores
// would be worse than not showing the panel at all. It comes back once scan data is real.
const DEMO_SOV_SENTIMENT:Record<string,{positive:number;neutral:number;negative:number}>={
 "Acme Software":{positive:14,neutral:5,negative:1},"SearchPilot":{positive:11,neutral:4,negative:3},"Riverside Rivals":{positive:6,neutral:7,negative:2},"PromptWatch":{positive:3,neutral:4,negative:1}
};
const DEMO_GAPS:CompetitiveGapRow[]=[
 {promptQuery:"Best AI visibility tools for SaaS companies",engine:"perplexity",competitors:["SearchPilot"]},
 {promptQuery:"Top generative engine optimization platforms",engine:"perplexity",competitors:["SearchPilot","Riverside Rivals"]},
 {promptQuery:"Tools to improve brand visibility in ChatGPT",engine:"openai",competitors:["SearchPilot"]},
];
function SentimentBreakdown({counts}:{counts:{positive:number;neutral:number;negative:number}}){
 const total=counts.positive+counts.neutral+counts.negative;
 if(!total)return <span style={{fontSize:"11px",color:"var(--faint)"}}>No sentiment data</span>;
 return <span style={{display:"inline-flex",gap:"8px",alignItems:"center",fontSize:"11px"}}>
  {counts.positive>0&&<span style={{color:"var(--em)"}}>●&nbsp;{counts.positive} positive</span>}
  {counts.neutral>0&&<span style={{color:"var(--muted)"}}>●&nbsp;{counts.neutral} neutral</span>}
  {counts.negative>0&&<span style={{color:"var(--cr)"}}>●&nbsp;{counts.negative} negative</span>}
 </span>;
}
// Groups gap rows by which competitor(s) won the prompt, so the panel reads as "here's who
// to displace and where" rather than a flat list of missed prompts (that's already the
// Overview "Missed prompts" count -- this is the competitive-relative version of it).
function GapAnalysisPanel({gaps,brandName}:{gaps:CompetitiveGapRow[];brandName:string}){
 if(!gaps.length)return null;
 const byCompetitor=new Map<string,CompetitiveGapRow[]>();
 for(const g of gaps)for(const c of g.competitors){if(!byCompetitor.has(c))byCompetitor.set(c,[]);byCompetitor.get(c)!.push(g)}
 const sorted=[...byCompetitor.entries()].sort((a,b)=>b[1].length-a[1].length);
 return <article className="panel" style={{marginTop:"14px"}}>
  <PanelHead title="Gap analysis & opportunities" sub={`Prompts where ${brandName} wasn't named but a tracked competitor was`}/>
  <div style={{display:"grid",gap:"14px"}}>
   {sorted.map(([competitor,rows])=><div key={competitor}>
    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
     <span style={{fontSize:"13px",fontWeight:700,color:"var(--ink)"}}>{competitor}</span>
     <span style={{fontSize:"10px",fontWeight:700,padding:"2px 8px",borderRadius:"99px",background:"var(--sky-d)",color:"var(--sky)"}}>{rows.length} prompt{rows.length!==1?"s":""}</span>
    </div>
    <div style={{display:"grid",gap:"6px"}}>
     {rows.map((g,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px",padding:"9px 12px",border:"1px solid var(--line)",borderRadius:"7px",fontSize:"12px"}}>
      <span style={{color:"var(--ink)"}}>{g.promptQuery}</span>
      <span style={{color:"var(--muted)",flexShrink:0,fontSize:"11px"}}>{engineByKey[g.engine]?.name||g.engine}</span>
     </div>)}
    </div>
   </div>)}
  </div>
 </article>;
}
function Competitors({demo,brand,newUser}:{demo:boolean;brand?:Brand;newUser:boolean}){
 const [items,setItems]=useState<Competitor[]>([]);
 const [sov,setSov]=useState<ShareOfVoiceRow[]>([]);
 const [gaps,setGaps]=useState<CompetitiveGapRow[]>([]);
 const [scanned,setScanned]=useState(false);
 const [loading,setLoading]=useState(!demo);
 const [modal,setModal]=useState(false),[name,setName]=useState(""),[domain,setDomain]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState("");

 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{
   setLoading(true);
   const [{createClient},{getCompetitors},{getLatestScan,shareOfVoice,competitiveGaps}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/competitors"),import("@/lib/data/stats")]);
   const supabase=createClient();
   const [rows,scan]=await Promise.all([getCompetitors(supabase,brand.id),getLatestScan(supabase,brand.id)]);
   if(cancelled)return;
   setItems(rows);setScanned(!!scan);
   // Competitors added after the last scan have no data yet, so they're filtered out of
   // the chart rather than shown at a misleading 0%.
   setSov(scan?shareOfVoice(scan,brand.name).filter(r=>r.isBrand||rows.some(c=>c.name===r.name)):[]);
   setGaps(scan?competitiveGaps(scan):[]);
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

 if(demo)return <><div className="page-title"><div><span className="overline">LOCAL COMPETITIVE INTELLIGENCE</span><h1>Competitors near you</h1><p>See which nearby businesses in your category AI recommends instead of you—and what makes them win.</p></div><button className="scan-btn"><Plus/>Add a local competitor</button></div><div className="competitor-grid">{[{n:"SearchPilot",s:72,c:"SP",d:5},{n:"Riverside Rivals",s:64,c:"RR",d:-2},{n:"PromptWatch",s:49,c:"PW",d:8}].map(x=><article className="panel competitor-card" key={x.n}><span>{x.c}</span><div><h3>{x.n}</h3><p>Visibility score</p></div><b>{x.s}%</b><small className={x.d>0?"up":"down"}>{x.d>0?<ArrowUpRight/>:<ArrowDownRight/>}{Math.abs(x.d)}%</small><button><MoreHorizontal/></button></article>)}</div><article className="panel"><PanelHead title="Share of AI voice" sub="Mention frequency across tracked prompts, vs. competitors in your area"/><div className="share-bars">{[{n:"Acme Software",v:67},{n:"SearchPilot",v:72},{n:"Riverside Rivals",v:64},{n:"PromptWatch",v:49}].map(x=><div key={x.n}><span>{x.n}</span><i><b style={{width:x.v+"%"}}/></i><strong>{x.v}%</strong></div>)}</div><div style={{display:"grid",gap:"8px",marginTop:"14px",paddingTop:"14px",borderTop:"1px solid var(--line)"}}>{Object.entries(DEMO_SOV_SENTIMENT).map(([n,c])=><div key={n} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:"12px"}}><span style={{color:"var(--ink)",fontWeight:600}}>{n}</span><SentimentBreakdown counts={c}/></div>)}</div></article>
  <GapAnalysisPanel gaps={DEMO_GAPS} brandName="Acme Software"/></>;

 if(!brand)return <div className="page-title"><div><span className="overline">LOCAL COMPETITIVE INTELLIGENCE</span><h1>Competitors near you</h1><p>Add a client brand first, then track the local competitors AI recommends instead of them.</p></div></div>;

 return <><div className="page-title"><div><span className="overline">LOCAL COMPETITIVE INTELLIGENCE</span><h1>Competitors near you</h1><p>See which nearby businesses in {brand.name}&apos;s category AI recommends instead of them.</p></div><button className="scan-btn" onClick={()=>setModal(true)}><Plus/>Add a local competitor</button></div>
  <TabTip tabId="competitors" newUser={newUser} text="Add the brands you compete with to see who wins the AI answer when you don't."/>
  {loading?<p>Loading competitors…</p>:items.length===0?<EmptyState icon={Users} headline="See who wins the answer when you don't" subtext="Add the brands you compete with and we'll track share-of-voice across the same prompts once you scan." primaryLabel="Add a competitor" onPrimary={()=>setModal(true)}/>:<><div className="competitor-grid">{items.map(c=>{const row=sov.find(r=>r.name===c.name);return <article className="panel competitor-card" key={c.id}><span>{c.name.slice(0,2).toUpperCase()}</span><div><h3>{c.name}</h3><p>{c.domain||"No domain set"}</p></div>{row&&<b>{row.share}%</b>}<button><MoreHorizontal/></button></article>})}</div>
  <article className="panel"><PanelHead title="Share of AI voice" sub={sov.length?`How often each brand is named across the ${sov[0].total} answers in the latest scan`:"Run a scan to see who AI names for your prompts"}/>
   {sov.length===0?<p className="muted-note">{scanned?"The latest scan ran before competitor tracking was added. Run a new scan to compare.":`No scan yet for ${brand.name}.`}</p>
   :<><div className="share-bars">{sov.map(r=><div key={r.name}><span>{r.name}{r.isBrand?" (you)":""}</span><i><b style={{width:r.share+"%"}}/></i><strong>{r.share}%</strong></div>)}</div>
   <p className="muted-note">Shares don&apos;t total 100% — one answer can name several brands, and being listed alongside a rival is the normal case. {sov.filter(r=>r.avgPosition!=null).length>0&&`Average position when named: ${sov.filter(r=>r.avgPosition!=null).map(r=>`${r.name} ${r.avgPosition}`).join(", ")}.`}</p>
   <div style={{display:"grid",gap:"8px",marginTop:"14px",paddingTop:"14px",borderTop:"1px solid var(--line)"}}>{sov.map(r=><div key={r.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:"12px",flexWrap:"wrap",gap:"6px"}}><span style={{color:"var(--ink)",fontWeight:600}}>{r.name}{r.isBrand?" (you)":""}</span><SentimentBreakdown counts={r.sentimentCounts}/></div>)}</div></>}
  </article>
  <GapAnalysisPanel gaps={gaps} brandName={brand.name}/></>}
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

type ReportDetail={
 run:{id:string;completedAt:string|null;confidence:number|null;score:number;mentions:number;total:number};
 brand:{name:string;domain:string};
 answers:{id:string;engine:string;text:string;brand_mentioned:boolean;position:number|null;sentiment:string;createdAt:string|null;prompt:string}[];
 fixes:{id:string;category:string;title:string;rationale:string|null;impact_low:number|null;impact_high:number|null;status:string;created_at?:string}[];
 seoAudit:{audit:SeoAuditData|null;previousAudit:{id:string;overallScore:number;createdAt:string}|null};
 traffic:GscData;
};
function groupByEngineRaw(answers:{engine:string;brand_mentioned:boolean}[]){const byKey=new Map<string,{mentioned:number;total:number}>();for(const a of answers){const e=byKey.get(a.engine)||{mentioned:0,total:0};e.total++;if(a.brand_mentioned)e.mentioned++;byKey.set(a.engine,e)}return Array.from(byKey.entries()).map(([key,{mentioned,total}])=>{const meta=engineByKey[key]||{name:key,short:key[0]?.toUpperCase()||"?",color:"green"};const pct=total?Math.round(mentioned/total*100):0;return{key,name:meta.name,short:meta.short,color:meta.color,pct}})}
function Reports({demo,brand,refreshKey,newUser,reportsTab,setReportsTab}:{demo:boolean;brand?:Brand;refreshKey:number;newUser:boolean;reportsTab:"scans"|"fixes"|"seo";setReportsTab:(t:"scans"|"fixes"|"seo")=>void}){
 const {history}=useScanHistory(demo,brand,refreshKey);
 const [viewRunId,setViewRunId]=useState<string|null>(null);
 const [report,setReport]=useState<ReportDetail|null>(null);
 const [reportLoading,setReportLoading]=useState(false);
 async function openReport(runId:string){setViewRunId(runId);setReportLoading(true);const r=await fetch(`/api/reports/${runId}`);const j=await r.json().catch(()=>({}));setReport(j.run?j:null);setReportLoading(false)}
 function closeReport(){setViewRunId(null);setReport(null)}
 const header=<><div className="page-title"><div><span className="overline">REPORTS</span><h1>Visibility reports</h1><p>Every scan auto-generates a full report. Click any entry to view or export.</p></div></div><TabTip tabId="reports" newUser={newUser} text="Every scan generates a shareable report here, exportable to PDF for your team or clients."/></>;
 const subTabBar=<div className="overview-tabs" style={{marginBottom:"14px"}}><button className={reportsTab==="scans"?"active":""} onClick={()=>setReportsTab("scans")}><FileText size={14}/>Complete scan reports</button><button className={reportsTab==="fixes"?"active":""} onClick={()=>setReportsTab("fixes")}><WandSparkles size={14}/>AI Fixes progress</button><button className={reportsTab==="seo"?"active":""} onClick={()=>setReportsTab("seo")}><Globe size={14}/>SEO Audit reports</button></div>;

 if(reportsTab==="fixes") return <>{header}{subTabBar}<FixesProgressReport demo={demo} brand={brand}/></>;
 if(reportsTab==="seo") return <>{header}{subTabBar}<SeoAuditReport demo={demo} brand={brand}/></>;

 if(demo)return <>{header}{subTabBar}<div className="report-grid">{["June 2026","Q2 summary","May 2026"].map((r,i)=><article className="panel report-card" key={r}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}><span style={{fontSize:"10px",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--muted)"}}>SCAN #{3-i}</span><span style={{fontSize:"10px",fontWeight:700,padding:"3px 8px",borderRadius:"99px",background:"var(--sky-d)",color:"var(--sky)"}}>Demo</span></div><div style={{display:"flex",alignItems:"flex-end",gap:"14px",marginBottom:"16px"}}><span style={{fontSize:"52px",fontWeight:800,lineHeight:1,fontFamily:"Outfit,system-ui",color:"var(--em)",letterSpacing:"-2px"}}>{67-i*4}</span><div style={{paddingBottom:"5px"}}><div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"2px"}}>AI Visibility Score</div><div style={{fontSize:"12px",fontWeight:600,color:"var(--ink)"}}>{14-i*2}/25 mentions</div></div></div><button className="button" style={{fontSize:"12px",padding:"7px 14px"}}>View report <ArrowUpRight style={{width:"13px"}}/></button></article>)}</div></>;
 if(!brand)return <>{header}{subTabBar}<p style={{color:"var(--muted)",fontSize:"13px"}}>Add a client brand to start generating reports.</p></>;
 if(history.length===0)return <>{header}{subTabBar}<div className="panel" style={{padding:"40px 32px",textAlign:"center"}}><FileText style={{width:"32px",color:"var(--faint)",marginBottom:"12px"}}/><p style={{margin:"0 0 8px",fontWeight:600,color:"var(--ink)"}}>No reports yet for {brand.name}</p><p style={{margin:0,fontSize:"13px",color:"var(--muted)"}}>Click <b>Run scan</b> above to generate your first AI visibility report.</p></div></>;
 const reversed=[...history].reverse();
 return <>{header}{subTabBar}
  <div className="report-grid">
   {reversed.map((h,ri)=>{const cmp=compareToPrevious(history,h.runId);const isFirst=cmp.isBaseline;const delta=cmp.absoluteDelta;const dateStr=formatTimestamp(h.completedAt,"datetime");const scoreColor=h.score>=70?"var(--em)":h.score>=45?"var(--am)":"var(--cr)";
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

const DEMO_FIX_TIMELINE:Record<string,{fromStatus:string|null;toStatus:string;createdAt:string}[]>={
 d1:[{fromStatus:null,toStatus:"pending",createdAt:"2026-08-04T09:12:00Z"}],
 d2:[{fromStatus:null,toStatus:"pending",createdAt:"2026-08-04T09:12:00Z"},{fromStatus:"pending",toStatus:"implementing",createdAt:"2026-08-05T14:02:00Z"}],
 d3:[{fromStatus:null,toStatus:"pending",createdAt:"2026-08-04T09:12:00Z"}],
 d4:[{fromStatus:null,toStatus:"pending",createdAt:"2026-07-29T08:40:00Z"},{fromStatus:"pending",toStatus:"implementing",createdAt:"2026-07-30T11:15:00Z"},{fromStatus:"implementing",toStatus:"done",createdAt:"2026-08-01T16:47:00Z"}],
 d5:[{fromStatus:null,toStatus:"pending",createdAt:"2026-08-04T09:12:00Z"}],
 d6:[{fromStatus:null,toStatus:"pending",createdAt:"2026-08-04T09:12:00Z"}],
 d7:[{fromStatus:null,toStatus:"pending",createdAt:"2026-08-04T09:12:00Z"},{fromStatus:"pending",toStatus:"implementing",createdAt:"2026-08-05T10:20:00Z"}]
};
const FIX_STATUS_ORDER=["all","pending","implementing","done"] as const;
const FIX_STATUS_LABEL:Record<string,string>={all:"All fixes",pending:"Pending",implementing:"In progress",done:"Done"};

// Status-change history comes from the audit log (#3 in session_notes), not the fixes table
// itself -- fixes only ever store their current status, so without the log there'd be no way
// to show "moved from pending to implementing on [date]", only the end state.
type FprItem={id:string;category:string;title:string;status:string;generated:string;scanRunId:string|null;rationale:string|null;generatedContent:string|null;impactLabel:string|null};
function FixProgressRow({f,timeline,scanDate}:{f:{id:string;category:string;title:string;status:string;generated:string};timeline:{fromStatus:string|null;toStatus:string;createdAt:string}[];scanDate:string|null}){
 return <article className="panel" style={{padding:"18px 20px"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"12px",marginBottom:"8px"}}>
   <div><span className={`fix-type ${fixCategoryClass(f.category)}`}>{FIX_CATEGORY_LABEL[f.category]||f.category}</span><h3 style={{margin:"6px 0 0",font:"700 14px 'Outfit',system-ui",color:"var(--ink)"}}>{f.title}</h3></div>
   <span style={{fontSize:"10.5px",fontWeight:700,padding:"4px 10px",borderRadius:"99px",flexShrink:0,background:f.status==="done"?"var(--em-d)":f.status==="implementing"?"var(--sky-d)":"var(--soft)",color:f.status==="done"?"var(--em)":f.status==="implementing"?"var(--sky)":"var(--muted)"}}>{fixStatusLabel[f.status]||f.status}</span>
  </div>
  <div style={{display:"flex",gap:"18px",fontSize:"11.5px",color:"var(--muted)",marginBottom:"12px"}}>
   <span>Generated <b style={{color:"var(--ink)"}}>{formatTimestamp(f.generated,"datetime")}</b></span>
   <span>From scan <b style={{color:"var(--ink)"}}>{scanDate?formatTimestamp(scanDate,"datetime"):"Not linked to a scan"}</b></span>
  </div>
  <div style={{borderTop:"1px solid var(--line)",paddingTop:"10px",display:"grid",gap:"6px"}}>
   {timeline.length===0
    ?<div style={{fontSize:"11.5px",color:"var(--muted)"}}>No status changes recorded yet.</div>
    :timeline.map((t,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"11.5px",color:"var(--muted)"}}><span style={{width:"6px",height:"6px",borderRadius:"50%",background:t.toStatus==="done"?"var(--em)":t.toStatus==="implementing"?"var(--sky)":"var(--faint)",flexShrink:0}}/>{t.fromStatus?`${fixStatusLabel[t.fromStatus]||t.fromStatus} → ${fixStatusLabel[t.toStatus]||t.toStatus}`:`Generated as ${fixStatusLabel[t.toStatus]||t.toStatus}`} on {formatTimestamp(t.createdAt,"datetime")}</div>)}
  </div>
  {f.status!=="done"&&<p style={{fontSize:"11px",color:"var(--sky)",marginTop:"10px",paddingTop:"10px",borderTop:"1px dashed var(--line)"}}>Check back after your next scheduled scan to see if this moves forward.</p>}
 </article>;
}
// Summary export: one compact line per selected fix -- category, title, status, impact.
// No timeline, no rationale, no generated content -- that's what Detailed is for.
function FixSummaryRow({f}:{f:FprItem}){
 return <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",border:"1px solid var(--line)",borderRadius:"7px"}}>
  <span className={`fix-type ${fixCategoryClass(f.category)}`} style={{flexShrink:0}}>{FIX_CATEGORY_LABEL[f.category]||f.category}</span>
  <span style={{flex:1,fontSize:"12.5px",fontWeight:600,color:"var(--ink)"}}>{f.title}</span>
  {f.impactLabel&&<span style={{fontSize:"11px",color:"var(--em)",fontWeight:600,flexShrink:0}}>{f.impactLabel}</span>}
  <span style={{fontSize:"10.5px",fontWeight:700,padding:"3px 9px",borderRadius:"99px",flexShrink:0,background:f.status==="done"?"var(--em-d)":f.status==="implementing"?"var(--sky-d)":"var(--soft)",color:f.status==="done"?"var(--em)":f.status==="implementing"?"var(--sky)":"var(--muted)"}}>{fixStatusLabel[f.status]||f.status}</span>
 </div>;
}
// Detailed export: everything -- rationale, the generated fix content itself, impact,
// and the full status-change timeline. This is the "complete AI fix details" view.
function FixDetailRow({f,timeline,scanDate}:{f:FprItem;timeline:{fromStatus:string|null;toStatus:string;createdAt:string}[];scanDate:string|null}){
 return <article className="panel" style={{padding:"18px 20px"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"12px",marginBottom:"8px"}}>
   <div><span className={`fix-type ${fixCategoryClass(f.category)}`}>{FIX_CATEGORY_LABEL[f.category]||f.category}</span><h3 style={{margin:"6px 0 0",font:"700 14px 'Outfit',system-ui",color:"var(--ink)"}}>{f.title}</h3></div>
   <span style={{fontSize:"10.5px",fontWeight:700,padding:"4px 10px",borderRadius:"99px",flexShrink:0,background:f.status==="done"?"var(--em-d)":f.status==="implementing"?"var(--sky-d)":"var(--soft)",color:f.status==="done"?"var(--em)":f.status==="implementing"?"var(--sky)":"var(--muted)"}}>{fixStatusLabel[f.status]||f.status}</span>
  </div>
  <div style={{display:"flex",gap:"18px",fontSize:"11.5px",color:"var(--muted)",marginBottom:"12px",flexWrap:"wrap"}}>
   <span>Generated <b style={{color:"var(--ink)"}}>{formatTimestamp(f.generated,"datetime")}</b></span>
   <span>From scan <b style={{color:"var(--ink)"}}>{scanDate?formatTimestamp(scanDate,"datetime"):"Not linked to a scan"}</b></span>
   {f.impactLabel&&<span>Estimated lift <b style={{color:"var(--em)"}}>{f.impactLabel}</b></span>}
  </div>
  {f.rationale&&<p style={{fontSize:"12.5px",color:"var(--ink)",lineHeight:1.6,margin:"0 0 12px"}}>{f.rationale}</p>}
  {f.generatedContent&&<pre style={{whiteSpace:"pre-wrap",fontSize:"11px",background:"var(--soft,#f7f6fb)",padding:"12px",borderRadius:"8px",margin:"0 0 12px",lineHeight:1.6,color:"var(--ink)",fontFamily:"inherit"}}>{f.generatedContent}</pre>}
  <div style={{borderTop:"1px solid var(--line)",paddingTop:"10px",display:"grid",gap:"6px"}}>
   {timeline.length===0
    ?<div style={{fontSize:"11.5px",color:"var(--muted)"}}>No status changes recorded yet.</div>
    :timeline.map((t,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"11.5px",color:"var(--muted)"}}><span style={{width:"6px",height:"6px",borderRadius:"50%",background:t.toStatus==="done"?"var(--em)":t.toStatus==="implementing"?"var(--sky)":"var(--faint)",flexShrink:0}}/>{t.fromStatus?`${fixStatusLabel[t.fromStatus]||t.fromStatus} → ${fixStatusLabel[t.toStatus]||t.toStatus}`:`Generated as ${fixStatusLabel[t.toStatus]||t.toStatus}`} on {formatTimestamp(t.createdAt,"datetime")}</div>)}
  </div>
 </article>;
}

function FixesProgressReport({demo,brand}:{demo:boolean;brand?:Brand}){
 const [statusTab,setStatusTab]=useState<string>("all");
 const [exportMode,setExportMode]=useState<"summary"|"detailed">("detailed");
 function exportPdf(mode:"summary"|"detailed"){setExportMode(mode);setTimeout(()=>window.print(),0)}
 const [fixes,setFixes]=useState<Fix[]>([]);
 const [history,setHistory]=useState<Record<string,{fromStatus:string|null;toStatus:string;createdAt:string}[]>>({});
 const [scanDates,setScanDates]=useState<Record<string,string|null>>({});
 const [loading,setLoading]=useState(!demo);
 // Per-fix export selection. Unset === selected -- so every fix is included by default
 // ("export all") until the user unchecks specific ones.
 const [checked,setChecked]=useState<Record<string,boolean>>({});
 function isChecked(id:string){return checked[id]!==false}
 function toggleChecked(id:string){setChecked(c=>({...c,[id]:!isChecked(id)}))}

 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{
   setLoading(true);
   const [{createClient},{getFixes,getScanDates},{getFixStatusHistory}]=await Promise.all([import("@/lib/supabase/client"),import("@/lib/data/fixes"),import("@/lib/data/auditLog")]);
   const supabase=createClient();
   const [fixRows,statusHistory]=await Promise.all([getFixes(supabase,brand.id),getFixStatusHistory(supabase,brand.id)]);
   const scanRunIds=[...new Set(fixRows.map(f=>f.scan_run_id).filter((id):id is string=>!!id))];
   const dates=await getScanDates(supabase,scanRunIds);
   if(!cancelled){setFixes(fixRows);setHistory(statusHistory);setScanDates(dates);setLoading(false)}
  })();
  return ()=>{cancelled=true};
 },[demo,brand]);

 const items:FprItem[]=demo
  ?DEMO_FIXES.map(f=>({id:f.id,category:f.category,title:f.title,status:f.status,generated:"2026-08-04T09:12:00Z",scanRunId:null,rationale:f.desc,generatedContent:null,impactLabel:f.lift?`+${f.lift}`:null}))
  :fixes.map(f=>({id:f.id,category:f.category,title:f.title,status:f.status||"pending",generated:f.created_at,scanRunId:f.scan_run_id,rationale:f.rationale,generatedContent:f.generated_content,impactLabel:f.impact_low!=null&&f.impact_high!=null?`+${f.impact_low}–${f.impact_high}%`:null}));
 const counts=Object.fromEntries(FIX_STATUS_ORDER.map(s=>[s,s==="all"?items.length:items.filter(f=>f.status===s).length]));
 const shown=statusTab==="all"?items:items.filter(f=>f.status===statusTab);
 const exportItems=items.filter(f=>isChecked(f.id));
 const allChecked=items.length>0&&items.every(f=>isChecked(f.id));

 if(!demo&&!brand)return <p style={{color:"var(--muted)",fontSize:"13px"}}>Add a client first to see AI fixes progress.</p>;
 if(!demo&&loading)return <p>Loading…</p>;
 if(!demo&&!items.length)return <EmptyState icon={WandSparkles} headline="No fixes yet for this brand" subtext="Run a scan to generate AI fixes — their progress and status history will show up here." />;

 function timelineFor(id:string){return demo?DEMO_FIX_TIMELINE[id]||[]:history[id]||[]}
 function scanDateFor(f:{scanRunId:string|null}){return demo?"2026-08-04T09:10:00Z":(f.scanRunId?scanDates[f.scanRunId]:null)}
 const exportedAt=new Date().toISOString();
 const brandLabel=demo?"Acme Software":brand?.name||"";
 const domainLabel=demo?"acme.co":brand?.domain||"";
 const exportCounts=Object.fromEntries(FIX_STATUS_ORDER.map(s=>[s,s==="all"?exportItems.length:exportItems.filter(f=>f.status===s).length]));

 return <>
  <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px",marginBottom:"14px",flexWrap:"wrap"}}>
   <div className="fix-cat-tabs" style={{marginBottom:0}}>{FIX_STATUS_ORDER.map(s=><button key={s} className={statusTab===s?"fix-cat-tab active":"fix-cat-tab"} onClick={()=>setStatusTab(s)}><span className="dot" style={{background:s==="all"?"var(--muted)":s==="done"?"var(--em)":s==="implementing"?"var(--sky)":"var(--faint)"}}/>{FIX_STATUS_LABEL[s]}<span className="cnt">{counts[s]}</span></button>)}</div>
   <div className="export-split" style={{display:"flex",gap:"6px"}}>
    <button className="button outline" style={{fontSize:"12px",padding:"9px 14px"}} onClick={()=>exportPdf("summary")}><FileText style={{width:"13px"}}/>Export Summary</button>
    <button className="button" style={{fontSize:"12px",padding:"9px 14px"}} onClick={()=>exportPdf("detailed")}><FileText style={{width:"13px"}}/>Export Detailed</button>
   </div>
  </div>
  <label className="no-print" style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"12px",color:"var(--muted)",marginBottom:"10px",cursor:"pointer"}}>
   <input type="checkbox" checked={allChecked} onChange={e=>{const val=e.target.checked;setChecked(Object.fromEntries(items.map(f=>[f.id,val])))}}/>
   {allChecked?"All fixes selected for export":`${exportItems.length} of ${items.length} fixes selected for export`}
  </label>
  <div className="no-print" style={{display:"grid",gap:"10px"}}>
   {shown.map(f=><div key={f.id} style={{display:"flex",gap:"10px",alignItems:"flex-start"}}>
    <input type="checkbox" checked={isChecked(f.id)} onChange={()=>toggleChecked(f.id)} style={{marginTop:"22px",flexShrink:0}} aria-label={`Include "${f.title}" in export`}/>
    <div style={{flex:1,minWidth:0}}><FixProgressRow f={f} timeline={timelineFor(f.id)} scanDate={scanDateFor(f)}/></div>
   </div>)}
  </div>
  {/* The exported document reflects the checkbox selection above, not the on-screen status
      filter -- an export should hold up as a deliberate, chosen record, not an artifact of
      whichever status tab happened to be active. data-export-mode drives the @media print
      rules in globals.css that swap between the compact .summary-only list and the full
      .detail-only list (rationale, generated content, status timeline). */}
  <div className="fpr-print-doc" data-export-mode={exportMode}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"2px solid var(--ink)",paddingBottom:"16px",marginBottom:"16px"}}>
    <div>
     <div style={{font:"700 14px 'Outfit',system-ui"}}>a<span style={{color:"var(--sky)"}}>askvisibleai</span></div>
     <div style={{font:"700 20px 'Outfit',system-ui",margin:"10px 0 2px"}}>AI Fixes progress report</div>
     <div style={{fontSize:"11.5px",color:"var(--muted)"}}>{brandLabel}{domainLabel&&` · ${domainLabel}`}</div>
    </div>
    <div style={{textAlign:"right",fontSize:"11px",color:"var(--muted)"}}>Exported {formatTimestamp(exportedAt,"datetime")}<br/>{exportMode==="summary"?"Summary":"Detailed"} — {exportItems.length} of {items.length} fixes</div>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderBottom:"1px solid var(--line)",marginBottom:"16px"}}>
    {FIX_STATUS_ORDER.map((s,i)=><div key={s} style={{padding:"12px 16px",textAlign:"center",borderLeft:i>0?"1px solid var(--line)":undefined}}><b style={{display:"block",font:"800 24px 'Outfit',system-ui",color:s==="done"?"var(--em)":s==="implementing"?"var(--sky)":"var(--ink)"}}>{exportCounts[s]}</b><span style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:".4px"}}>{s==="all"?"Total fixes":FIX_STATUS_LABEL[s]}</span></div>)}
   </div>
   <div className="summary-only" style={{display:"grid",gap:"8px"}}>
    {exportItems.map(f=><FixSummaryRow key={f.id} f={f}/>)}
   </div>
   <div className="detail-only" style={{display:"grid",gap:"10px"}}>
    {exportItems.map(f=><FixDetailRow key={f.id} f={f} timeline={timelineFor(f.id)} scanDate={scanDateFor(f)}/>)}
   </div>
  </div>
 </>;
}
const SEO_CATEGORY_LABEL:Record<string,string>={technical:"Technical SEO",meta:"On-page SEO",content:"Content",performance:"Performance",mobile:"Mobile",accessibility:"Accessibility",links:"Links",schema:"Structured Data"};
// Shared by ReportSeoAuditSection (embedded scan report) and SeoAuditReport (the dedicated
// SEO report) so both group checks into the same collapsible-by-category layout. <details>
// is open by default so nothing is hidden, and print CSS (globals.css) forces every one
// open regardless of what the viewer collapsed, so a PDF export always has the full audit.
function SeoChecksByCategory({checks}:{checks:SeoCheck[]}){
 const cats=["technical","meta","content","performance","mobile","accessibility","links","schema"];
 return <div style={{display:"grid",gap:"8px"}}>
  {cats.map(cat=>{const cc=checks.filter(c=>c.category===cat);if(!cc.length)return null;return <details key={cat} open style={{border:"1px solid var(--line)",borderRadius:"8px",overflow:"hidden"}}>
   <summary style={{padding:"10px 14px",fontSize:"12px",fontWeight:700,color:"var(--ink)",cursor:"pointer"}}>{SEO_CATEGORY_LABEL[cat]} ({cc.length})</summary>
   <div>{cc.map(c=><SeoCheckRow key={c.id} c={c}/>)}</div>
  </details>})}
 </div>;
}
function ReportSeoAuditSection({seoAudit}:{seoAudit:ReportDetail["seoAudit"]}){
 const audit=seoAudit?.audit;
 if(!audit)return <div className="rv-section"><div className="rv-section-title">SEO audit</div><p style={{fontSize:"12px",color:"var(--muted)"}}>No SEO audit has been run for this brand yet — run one from the SEO Audit page.</p></div>;
 const scoreColor=audit.overallScore>=70?"var(--em)":audit.overallScore>=50?"var(--am)":"var(--cr)";
 const passed=audit.checks.filter(c=>c.status==="pass").length;
 const warnings=audit.checks.filter(c=>c.status==="warning").length;
 const failed=audit.checks.filter(c=>c.status==="fail").length;
 return <div className="rv-section" style={{pageBreakInside:"avoid"}}>
  <div className="rv-section-title">SEO audit <span style={{fontWeight:400,fontSize:"11px",color:"var(--muted)",textTransform:"none",letterSpacing:0}}>— {formatTimestamp(audit.createdAt,"datetime")}</span></div>
  <div style={{display:"flex",alignItems:"center",gap:"16px",marginBottom:"14px",flexWrap:"wrap"}}>
   <span style={{fontSize:"36px",fontWeight:800,fontFamily:"Outfit,system-ui",color:scoreColor,letterSpacing:"-1.5px"}}>{audit.overallScore}</span>
   <span style={{fontSize:"12px",color:"var(--muted)"}}>SEO score · {passed} passed, {warnings} warning{warnings!==1?"s":""}, {failed} failed</span>
  </div>
  <SeoChecksByCategory checks={audit.checks}/>
 </div>;
}

// Dedicated SEO audit report, browsable under Reports -> SEO Audit reports: score trend
// across every stored audit, cards to open any past audit's full detail, and a print/PDF
// export (window.print(), same pattern as FixesProgressReport) of the latest audit.
function SeoAuditReport({demo,brand}:{demo:boolean;brand?:Brand}){
 const [exportMode,setExportMode]=useState<"summary"|"detailed">("detailed");
 function exportPdf(mode:"summary"|"detailed"){setExportMode(mode);setTimeout(()=>window.print(),0)}
 const [history,setHistory]=useState<SeoAuditHistoryEntry[]>([]);
 const [latest,setLatest]=useState<SeoAuditData|null>(null);
 const [loading,setLoading]=useState(!demo);
 const [viewAuditId,setViewAuditId]=useState<string|null>(null);
 const [viewDetail,setViewDetail]=useState<SeoAuditData|null>(null);
 const [viewLoading,setViewLoading]=useState(false);

 useEffect(()=>{
  if(demo||!brand){setLoading(false);return}
  let cancelled=false;
  (async()=>{
   setLoading(true);
   const [hr,lr]=await Promise.all([
    fetch(`/api/seo-audit/history?brandId=${encodeURIComponent(brand.id)}`),
    fetch(`/api/seo-audit/latest?brandId=${encodeURIComponent(brand.id)}`),
   ]);
   const [hj,lj]=await Promise.all([hr.json().catch(()=>({})),lr.json().catch(()=>({}))]);
   if(!cancelled){setHistory(hj.audits||[]);setLatest(lj.audit||null);setLoading(false)}
  })();
  return ()=>{cancelled=true};
 },[demo,brand]);

 async function openAudit(id:string){
  setViewAuditId(id);setViewLoading(true);
  const r=await fetch(`/api/seo-audit/${id}`);const j=await r.json().catch(()=>({}));
  setViewDetail(j.audit||null);setViewLoading(false);
 }
 function closeAudit(){setViewAuditId(null);setViewDetail(null)}

 const items=demo?DEMO_SEO_HISTORY:history;
 const data=demo?DEMO_SEO_AUDIT:latest;
 const trendData=items.slice().reverse().map(h=>({label:formatTimestamp(h.createdAt,"date"),value:h.overallScore}));
 const exportedAt=new Date().toISOString();
 const brandLabel=demo?"Acme Software":brand?.name||"";
 const domainLabel=demo?"acme.co":brand?.domain||"";
 const passed=data?.checks.filter(c=>c.status==="pass").length||0;
 const warnings=data?.checks.filter(c=>c.status==="warning").length||0;
 const failed=data?.checks.filter(c=>c.status==="fail").length||0;

 if(!demo&&!brand)return <p style={{color:"var(--muted)",fontSize:"13px"}}>Add a client first to see SEO audit reports.</p>;
 if(!demo&&loading)return <p>Loading…</p>;
 if(!demo&&!items.length)return <EmptyState icon={Globe} headline="No SEO audits yet for this brand" subtext="Run an SEO audit from the SEO Audit page — score history and exportable reports will show up here." />;

 return <>
  <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px",marginBottom:"14px",flexWrap:"wrap"}}>
   <p style={{margin:0,fontSize:"12px",color:"var(--muted)"}}>{items.length} audit{items.length!==1?"s":""} recorded{brand?` for ${brand.name}`:""}</p>
   <div className="export-split" style={{display:"flex",gap:"6px"}}>
    <button className="button outline" style={{fontSize:"12px",padding:"9px 14px"}} onClick={()=>exportPdf("summary")}><FileText style={{width:"13px"}}/>Export Summary</button>
    <button className="button" style={{fontSize:"12px",padding:"9px 14px"}} onClick={()=>exportPdf("detailed")}><FileText style={{width:"13px"}}/>Export Detailed</button>
   </div>
  </div>
  <div className="no-print">
   {trendData.length>=2&&<article className="panel" style={{padding:"20px 24px",marginBottom:"14px"}}>
    <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",color:"var(--muted)",marginBottom:"12px"}}>SEO score trend</div>
    <ScoreTrendChart data={trendData} yMax={100} color="var(--sky)"/>
   </article>}
   <div className="report-grid">
    {items.map((h,i)=>{const scoreColor=h.overallScore>=70?"var(--em)":h.overallScore>=50?"var(--am)":"var(--cr)";return <article className="panel report-card" key={h.id} onClick={()=>!demo&&openAudit(h.id)}>
     <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"14px"}}>
      <div><span style={{fontSize:"10px",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--muted)"}}>AUDIT #{items.length-i}</span><p style={{margin:"3px 0 0",fontSize:"12px",color:"var(--muted)"}}>{formatTimestamp(h.createdAt,"datetime")}</p></div>
     </div>
     <div style={{display:"flex",alignItems:"flex-end",gap:"14px",marginBottom:"14px"}}>
      <span style={{fontSize:"56px",fontWeight:800,lineHeight:1,fontFamily:"Outfit,system-ui",color:scoreColor,letterSpacing:"-2px"}}>{h.overallScore}</span>
      <div style={{paddingBottom:"5px"}}><div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"2px"}}>SEO Score</div><div style={{fontSize:"12px",fontWeight:600,color:"var(--ink)"}}>{h.checksCount} checks</div></div>
     </div>
     {!demo&&<button className="button" style={{fontSize:"12px",padding:"7px 14px",marginTop:"auto"}} onClick={e=>{e.stopPropagation();openAudit(h.id)}}>View audit <ArrowUpRight style={{width:"13px"}}/></button>}
    </article>})}
   </div>
  </div>
  {viewAuditId&&typeof document!=="undefined"&&createPortal(<div className="modal-back" onClick={closeAudit}><div className="modal" style={{maxWidth:"720px",width:"100%",textAlign:"left"}} onClick={e=>e.stopPropagation()}>
   <button className="modal-x" onClick={closeAudit}><X/></button>
   {viewLoading||!viewDetail?<div style={{textAlign:"center",padding:"40px"}}><LoaderCircle className="spin"/></div>:<>
    <h2 style={{marginBottom:"4px"}}>SEO audit — {formatTimestamp(viewDetail.createdAt,"datetime")}</h2>
    <p style={{color:"var(--muted)",fontSize:"12px",marginBottom:"16px"}}>{viewDetail.domain}</p>
    <SeoChecksByCategory checks={viewDetail.checks}/>
   </>}
  </div></div>,document.body)}
  {/* Export always reflects the latest audit -- same shape as SeoAuditTab/ReportSeoAuditSection
      so there's one source of truth for what an "SEO report" contains. */}
  <div className="sar-print-doc" data-export-mode={exportMode}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"2px solid var(--ink)",paddingBottom:"16px",marginBottom:"16px"}}>
    <div>
     <div style={{font:"700 14px 'Outfit',system-ui"}}>a<span style={{color:"var(--sky)"}}>askvisibleai</span></div>
     <div style={{font:"700 20px 'Outfit',system-ui",margin:"10px 0 2px"}}>SEO audit report</div>
     <div style={{fontSize:"11.5px",color:"var(--muted)"}}>{brandLabel}{domainLabel&&` · ${domainLabel}`}</div>
    </div>
    <div style={{textAlign:"right",fontSize:"11px",color:"var(--muted)"}}>Exported {formatTimestamp(exportedAt,"datetime")}<br/>{exportMode==="summary"?"Summary":"Detailed"} — latest audit</div>
   </div>
   {data&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderBottom:"1px solid var(--line)",marginBottom:"16px"}}>
    <div style={{padding:"12px 16px",textAlign:"center"}}><b style={{display:"block",font:"800 24px 'Outfit',system-ui",color:"var(--ink)"}}>{data.overallScore}</b><span style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:".4px"}}>SEO score</span></div>
    <div style={{padding:"12px 16px",textAlign:"center",borderLeft:"1px solid var(--line)"}}><b style={{display:"block",font:"800 24px 'Outfit',system-ui",color:"var(--em)"}}>{passed}</b><span style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:".4px"}}>Passed</span></div>
    <div style={{padding:"12px 16px",textAlign:"center",borderLeft:"1px solid var(--line)"}}><b style={{display:"block",font:"800 24px 'Outfit',system-ui",color:"var(--am)"}}>{warnings}</b><span style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:".4px"}}>Warnings</span></div>
    <div style={{padding:"12px 16px",textAlign:"center",borderLeft:"1px solid var(--line)"}}><b style={{display:"block",font:"800 24px 'Outfit',system-ui",color:"var(--cr)"}}>{failed}</b><span style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:".4px"}}>Failed</span></div>
   </div>}
   <div className="summary-only" style={{fontSize:"12px",color:"var(--muted)"}}>{data?`${passed} passed, ${warnings} warning${warnings!==1?"s":""}, ${failed} failed out of ${data.checks.length} checks.`:"No audit data."}</div>
   <div className="detail-only">{data&&<SeoChecksByCategory checks={data.checks}/>}</div>
  </div>
 </>;
}
function ReportTrafficSection({traffic}:{traffic:ReportDetail["traffic"]}){
 if(!traffic?.connected||!traffic.overview)return <div className="rv-section"><div className="rv-section-title">Google Search Console traffic</div><p style={{fontSize:"12px",color:"var(--muted)"}}>Connect Google Search Console (Overview → Traffic &amp; Reach) to include traffic data in reports.</p></div>;
 const o=traffic.overview;
 return <div className="rv-section" style={{pageBreakInside:"avoid"}}>
  <div className="rv-section-title">Google Search Console traffic <span style={{fontWeight:400,fontSize:"11px",color:"var(--muted)",textTransform:"none",letterSpacing:0}}>— {traffic.range?`${traffic.range.start} to ${traffic.range.end}`:"last 30 days"}</span></div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px"}}>
   <div><div style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",fontWeight:700}}>Impressions</div><div style={{fontSize:"22px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--sky)"}}>{fmtNum(o.impressions)}</div></div>
   <div><div style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",fontWeight:700}}>Clicks</div><div style={{fontSize:"22px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--em)"}}>{fmtNum(o.clicks)}</div></div>
   <div><div style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",fontWeight:700}}>Avg CTR</div><div style={{fontSize:"22px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--ink)"}}>{o.ctr}%</div></div>
   <div><div style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",fontWeight:700}}>Avg Position</div><div style={{fontSize:"22px",fontWeight:800,fontFamily:"Outfit,system-ui",color:"var(--ink)"}}>#{o.position}</div></div>
  </div>
  {traffic.fetchedAt&&<p style={{fontSize:"10px",color:"var(--faint)",marginTop:"10px"}}>Fetched {formatTimestamp(traffic.fetchedAt,"datetime")}</p>}
 </div>;
}
function ReportViewer({runId,report,loading,history,onClose}:{runId:string;report:ReportDetail|null;loading:boolean;history:ScanHistoryEntry[];onClose:()=>void}){
 const [exportMode,setExportMode]=useState<"summary"|"detailed">("detailed");
 function printReport(mode:"summary"|"detailed"){setExportMode(mode);setTimeout(()=>window.print(),0)}
 const [expandedId,setExpandedId]=useState<string|null>(null);
 const histIdx=history.findIndex(h=>h.runId===runId);
 const prevEntry=histIdx>0?history[histIdx-1]:null;
 const cmp=report?compareToPrevious(history,runId):null;
 const isBaseline=cmp?.isBaseline??true;
 const delta=cmp?.absoluteDelta??null;
 const dateStr=formatTimestamp(report?.run.completedAt,"datetime");
 const engineBreakdown=report?groupByEngineRaw(report.answers):[];
 const trendData=history.length>=2?history.map(h=>({label:h.completedAt?new Date(h.completedAt).toLocaleDateString(undefined,{month:"short",day:"numeric"}):"—",value:h.score})):[];
 return <div className="rv-overlay" onClick={onClose}>
  <div className="rv-panel" data-export-mode={exportMode} onClick={e=>e.stopPropagation()}>
   <div className="rv-actions no-print">
    <span style={{fontSize:"12px",fontWeight:700,color:"var(--ink)"}}>Scan Report{report?` — ${report.brand.name}`:""}</span>
    <div style={{display:"flex",gap:"8px"}}>
     <button className="button outline" onClick={()=>printReport("summary")} style={{fontSize:"12px",padding:"7px 14px"}}><FileText style={{width:"13px"}}/>Export Summary</button>
     <button className="button" onClick={()=>printReport("detailed")} style={{fontSize:"12px",padding:"7px 14px"}}><FileText style={{width:"13px"}}/>Export Detailed</button>
     <button className="icon-btn" onClick={onClose}><X/></button>
    </div>
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
       {!isBaseline&&delta!=null&&<span style={{display:"block",marginBottom:"10px",fontSize:"14px",fontWeight:700,color:delta>0?"#10B981":delta<0?"#EF4444":"#94A3B8"}}>{delta>0?"↑":delta<0?"↓":"→"}{Math.abs(delta)} pts{cmp?.percentDelta!=null&&` (${cmp.percentDelta>0?"+":""}${cmp.percentDelta}%)`} vs previous scan{cmp?.previous!=null&&` — was ${cmp.previous}${prevEntry?.completedAt?` on ${formatTimestamp(prevEntry.completedAt,"date")}`:""}`}</span>}
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
    {trendData.length>=2&&<div className="rv-section">
     <div className="rv-section-title">Score history ({trendData.length} scans)</div>
     <ScoreTrendChart data={trendData} yMax={100}/>
    </div>}
    <div className="rv-section">
     <div className="rv-section-title">Visibility by engine</div>
     <div style={{display:"grid",gap:"10px"}}>
      {engineBreakdown.map(e=><div key={e.key} style={{display:"flex",alignItems:"center",gap:"12px"}}>
       <span className={`engine-logo ${e.color}`} style={{flexShrink:0}}>{e.short}</span>
       <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}><span style={{fontSize:"13px",fontWeight:600,color:"var(--ink)"}}>{e.name}</span><span style={{fontSize:"13px",fontWeight:700,color:"var(--sky)",fontVariantNumeric:"tabular-nums"}}>{e.pct}%</span></div><div style={{height:"6px",background:"var(--line)",borderRadius:"3px"}}><div style={{height:"100%",width:e.pct+"%",background:"var(--sky)",borderRadius:"3px"}}/></div></div>
      </div>)}
     </div>
    </div>
    <div className="rv-section detail-only">
     <div className="rv-section-title">Prompt results ({report.answers.length}) <span style={{fontWeight:400,fontSize:"11px",color:"var(--muted)",textTransform:"none",letterSpacing:0}}>— click a row to view the full response</span></div>
     <div className="table-wrap"><table><thead><tr><th style={{width:"24px"}}></th><th>Prompt</th><th>Engine</th><th>Status</th><th>Position</th><th>Sentiment</th></tr></thead><tbody>{report.answers.map(a=>{const open=expandedId===a.id;return <Fragment key={a.id}>
      <tr onClick={()=>setExpandedId(open?null:a.id)} style={{cursor:"pointer"}}>
       <td><ChevronDown style={{width:"14px",color:"var(--faint)",transition:"transform .15s",transform:open?"rotate(0deg)":"rotate(-90deg)"}}/></td>
       <td><b>{a.prompt}</b></td>
       <td>{engineByKey[a.engine]?.name||a.engine}</td>
       <td><span className={a.brand_mentioned?"status yes":"status no"}>{a.brand_mentioned?"Mentioned":"Not mentioned"}</span></td>
       <td>{a.position?`#${a.position}`:"—"}</td>
       <td>{a.sentiment==="not-mentioned"?"—":a.sentiment}</td>
      </tr>
      {open&&<tr className="no-print"><td></td><td colSpan={5} style={{background:"var(--soft)",padding:"14px 16px",fontSize:"12px",lineHeight:1.6,color:"var(--ink)",whiteSpace:"pre-wrap"}}>
       {a.text?a.text:<span style={{color:"var(--muted)",fontStyle:"italic"}}>No response text recorded for this answer.</span>}
       {a.createdAt&&<div style={{marginTop:"10px",fontSize:"11px",color:"var(--muted)"}}>Answered {formatTimestamp(a.createdAt,"datetime")}</div>}
      </td></tr>}
     </Fragment>})}</tbody></table></div>
    </div>
    {report.fixes.length>0&&<div className="rv-section">
     <div className="rv-section-title">AI-recommended fixes ({report.fixes.length})</div>
     {/* Summary export: title + category + status + impact only. Detailed: full rationale
         and created-date per fix, matching the AI Fixes progress report's Summary/Detailed
         split. */}
     <div className="summary-only" style={{display:"grid",gap:"8px"}}>
      {report.fixes.slice(0,6).map(f=><FixSummaryRow key={f.id} f={{id:f.id,category:f.category,title:f.title,status:f.status,generated:f.created_at||"",scanRunId:null,rationale:f.rationale,generatedContent:null,impactLabel:f.impact_low!=null&&f.impact_high!=null?`+${f.impact_low}–${f.impact_high}%`:null}}/>)}
     </div>
     <div className="detail-only" style={{display:"grid",gap:"10px"}}>
      {report.fixes.slice(0,6).map(f=><div key={f.id} style={{border:"1px solid var(--line)",borderRadius:"8px",padding:"14px 16px"}}>
       <div style={{display:"flex",gap:"10px",alignItems:"flex-start"}}>
        <span style={{fontSize:"10px",fontWeight:700,padding:"3px 8px",borderRadius:"4px",background:"var(--sky-d,#E0F2FE)",color:"var(--sky)",flexShrink:0,marginTop:"1px"}}>{f.category.toUpperCase()}</span>
        <div><div style={{fontWeight:700,fontSize:"13px",color:"var(--ink)",marginBottom:"4px"}}>{f.title}</div>{f.rationale&&<div style={{fontSize:"12px",color:"var(--muted)"}}>{f.rationale}</div>}{f.impact_low!=null&&f.impact_high!=null&&<div style={{marginTop:"6px",fontSize:"11px",color:"var(--em)",fontWeight:600}}>Estimated lift: +{f.impact_low}–{f.impact_high}%</div>}{f.created_at&&<div style={{marginTop:"4px",fontSize:"10px",color:"var(--faint)"}}>{formatTimestamp(f.created_at,"datetime")}</div>}</div>
       </div>
      </div>)}
     </div>
    </div>}
    <div className="detail-only"><ReportSeoAuditSection seoAudit={report.seoAudit}/></div>
    <div className="detail-only"><ReportTrafficSection traffic={report.traffic}/></div>
    <div className="rv-footer"><span style={{fontWeight:700,color:"var(--muted)"}}>a<span style={{color:"var(--sky)"}}>askvisibleai</span></span><span>Generated {formatTimestamp(new Date().toISOString(),"datetime")}</span></div>
   </>}
  </div>
 </div>
}
const WEEK_DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const FREQ_LABEL:{[k:string]:string}={weekly:"Weekly",monthly:"Monthly",off:"Off (manual only)"};

function SettingsPage({demo,brand,ctx,onBrandUpdated,newUser}:{demo:boolean;brand?:Brand;ctx:WorkspaceContext|null;onBrandUpdated:(updated:{id:string;name:string;domain:string;description:string})=>void;newUser:boolean}){
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
  <TabTip tabId="settings" newUser={newUser} text="Connect Google Search Console, set your scan schedule, and invite teammates here."/>
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
    {tab==="team"&&<TeamSettings demo={demo} workspaceId={ctx?.workspaceId}/>}
   </article>
  </div></>;
}

// Renders nothing for the single-workspace case, which is almost everyone. Only someone
// who has accepted an invite to a second team ever sees this.
function WorkspaceSwitcher({ctx,onSelectWorkspace}:{ctx:WorkspaceContext|null;onSelectWorkspace:(id:string)=>void}){
 const [modal,setModal]=useState(false);
 if(!ctx||ctx.workspaces.length<2)return null;
 return <>
  <button className="workspace-switch" onClick={()=>setModal(true)} title="Switch workspace">
   <Building2/><div><small>Workspace</small><b>{ctx.workspaceName}</b></div><ChevronDown/>
  </button>
  {modal&&typeof document!=="undefined"&&createPortal(<div className="modal-back"><div className="modal">
   <button className="modal-x" onClick={()=>setModal(false)}><X/></button>
   <span className="feature-icon"><Building2/></span><h2>Switch workspace</h2>
   <p>You belong to {ctx.workspaces.length} workspaces. Each has its own clients, prompts and team.</p>
   <ul className="client-list">{ctx.workspaces.map(w=><li key={w.id}>
    <button type="button" className={w.id===ctx.workspaceId?"active":""} aria-current={w.id===ctx.workspaceId||undefined} onClick={()=>{onSelectWorkspace(w.id);setModal(false)}}>
     <div><b>{w.name}</b><small>{w.role} · {w.plan} plan</small></div>{w.id===ctx.workspaceId&&<Check size={15}/>}
    </button></li>)}</ul>
  </div></div>,document.body)}
 </>;
}

type TeamMember={userId:string;name:string|null;email:string|null;role:string;isYou:boolean};
type TeamInvite={id:string;email:string;role:string;expires_at:string};

// workspaceId is passed explicitly rather than letting the route pick: after a switch the
// server's default (newest membership) is the wrong team, and silently managing the wrong
// one is the sort of bug nobody notices until they've removed the wrong person.
function TeamSettings({demo,workspaceId}:{demo:boolean;workspaceId?:string}){
 const [role,setRole]=useState<string|null>(null);
 const [members,setMembers]=useState<TeamMember[]>([]);
 const [invites,setInvites]=useState<TeamInvite[]>([]);
 const [loading,setLoading]=useState(!demo);
 const [email,setEmail]=useState(""),[inviteRole,setInviteRole]=useState("member");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");

 async function load(){
  const r=await fetch(`/api/team${workspaceId?`?workspaceId=${encodeURIComponent(workspaceId)}`:""}`);
  const d=await r.json().catch(()=>({}));
  if(r.ok){setRole(d.role);setMembers(d.members||[]);setInvites(d.invitations||[])}
  else setError(d.error||"Couldn't load the team.");
  setLoading(false);
 }
 useEffect(()=>{if(demo){setLoading(false);return}setLoading(true);load()},[demo,workspaceId]);

 const canManage=role==="owner"||role==="admin";

 async function invite(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError("");setNotice("");
  const r=await fetch("/api/team",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,role:inviteRole,workspaceId})});
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
  const r=await fetch("/api/team",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,workspaceId})});
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
