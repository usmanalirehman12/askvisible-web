import { configuredProviders } from "./providers";
import { discoverBrand, generateBuyerPrompts } from "./website";
import { score } from "./scoring";
import type { AnalyzedAnswer, ProviderFailure, VisibilityResult } from "./types";

function escaped(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function analyze(text:string, brand:string, domain:string): Pick<AnalyzedAnswer,"mentioned"|"position"|"sentiment"> {
  const aliases=[brand,domain,domain.split(".")[0]].filter(x=>x.length>2);
  const matcher=new RegExp(`\\b(?:${aliases.map(escaped).join("|")})\\b`,"i");
  const mentioned=matcher.test(text);
  if(!mentioned)return{mentioned:false,position:null,sentiment:"not-mentioned"};
  const before=text.slice(0,text.search(matcher));
  const numbered=[...text.matchAll(/(?:^|\n)\s*(?:#{1,4}\s*)?(\d+)[.)]\s+/g)];
  const position=numbered.filter(m=>m.index!<before.length).at(-1)?.[1];
  const hit=text.slice(Math.max(0,text.search(matcher)-120),text.search(matcher)+brand.length+180).toLowerCase();
  const negative=/\b(drawback|weak|limited|expensive|poor|avoid|however|but)\b/.test(hit);
  const positive=/\b(best|leading|strong|excellent|recommend|powerful|ideal|top)\b/.test(hit);
  return{mentioned:true,position:position?Number(position):null,sentiment:negative&&!positive?"negative":positive?"positive":"neutral"};
}
// Confidence blends two signals: completeness (did every configured provider answer every
// prompt, or did some calls fail/get skipped) and cross-provider agreement (when multiple
// engines check the same prompt, do they agree on whether the brand was mentioned). A score
// built from 1 surviving provider that disagrees with itself is less trustworthy than one
// built from 4 providers that all agree — this number communicates that distinction to the
// user instead of presenting every score with the same implied certainty.
function confidence(answers:AnalyzedAnswer[],prompts:string[],providerCount:number){
  if(!answers.length)return 0;
  const expectedCalls=Math.max(1,prompts.length*providerCount);
  const completeness=Math.min(1,answers.length/expectedCalls);
  const byPrompt=new Map<string,AnalyzedAnswer[]>();
  for(const a of answers){const list=byPrompt.get(a.prompt)??[];list.push(a);byPrompt.set(a.prompt,list)}
  let agreementSum=0;
  for(const list of byPrompt.values()){const mentionedCount=list.filter(a=>a.mentioned).length;agreementSum+=Math.max(mentionedCount,list.length-mentionedCount)/list.length}
  const agreement=byPrompt.size?agreementSum/byPrompt.size:0;
  return Math.round((completeness*0.5+agreement*0.5)*100)
}

// Shared by the public checker (fresh brand discovery + freshly generated prompts, every
// time, ephemeral) and the authenticated dashboard's scan (a brand + prompts that already
// exist as persisted, user-editable rows — regenerating them on every scan would silently
// discard edits and make week-over-week comparison meaningless, since the questions being
// asked would drift each time). Both paths need the exact same fan-out/scoring logic; only
// where the brand and prompts come from differs.
export async function runScanForPrompts(brand:{name:string;domain:string},prompts:string[]):Promise<Omit<VisibilityResult,"brand">&{brand:typeof brand}>{
  const providers=configuredProviders();
  if(!providers.length)throw new Error("No AI providers are configured. Add at least one provider API key to .env.local.");
  // Providers run concurrently with each other, but prompts run sequentially within each
  // provider — this prevents bursting 3 simultaneous requests at APIs (like Gemini) that
  // enforce per-key concurrency limits even on paid tiers.
  const settled=(await Promise.all(providers.map(async provider=>{const results=[];for(const prompt of prompts){try{results.push({ok:true as const,value:await provider.run(prompt)})}catch(error){results.push({ok:false as const,failure:{provider:provider.name,prompt,error:error instanceof Error?error.message:"Provider request failed"} satisfies ProviderFailure})}}return results;}))).flat();
  const failures=settled.filter(x=>!x.ok).map(x=>x.failure); const raw=settled.filter(x=>x.ok).map(x=>x.value);
  const answers=raw.map(a=>({...a,...analyze(a.text,brand.name,brand.domain)}));
  if(!answers.length)throw new Error(`All configured providers failed: ${failures.map(f=>`${f.provider}: ${f.error}`).join("; ")}`);
  const mentions=answers.filter(a=>a.mentioned).length; const visibilityScore=score(answers); const opportunities=new Set(answers.filter(a=>!a.mentioned).map(a=>a.prompt)).size;
  const confidenceScore=confidence(answers,prompts,providers.length);
  const summary=visibilityScore>=70?`${brand.name} has strong AI visibility across the engines checked.`:visibilityScore>=40?`${brand.name} is visible, but competitors may appear more consistently.`:`${brand.name} has substantial room to improve its presence in AI answers.`;
  return{mode:"live",brand,score:visibilityScore,confidence:confidenceScore,mentions,total:answers.length,opportunities,prompts,answers,failures,providers:providers.map(p=>p.name),scannedAt:new Date().toISOString(),summary};
}

export async function runVisibilityCheck(url:string):Promise<VisibilityResult>{
  const brand=await discoverBrand(url); const prompts=generateBuyerPrompts(brand);
  const result=await runScanForPrompts(brand,prompts);
  return {...result,brand};
}
