import { NextResponse } from "next/server";
import { runVisibilityCheck } from "@/lib/ai/orchestrator";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import type { VisibilityResult } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;
const WINDOW_SECONDS = 3600, MAX_PER_WINDOW = 5;
// The cache stays per-instance on purpose — a cache miss costs a slower response, not
// money, so it isn't worth a database round trip. The rate limit is the opposite: a miss
// there costs real provider spend, so it lives in Postgres (lib/security/rate-limit.ts).
const globalState = globalThis as typeof globalThis & { askvisibleCache?: Map<string, { expires:number; result:VisibilityResult }> };
const cache:Map<string,{expires:number;result:VisibilityResult}>=globalState.askvisibleCache ||= new Map<string,{expires:number;result:VisibilityResult}>();
function clientIp(request:Request){return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local"}
function errorStatus(message:string){if(/No AI providers/.test(message))return 503;if(/valid|public|HTTP|Local|HTML|website|URL|ports/i.test(message))return 400;return 502}
export async function POST(request:Request){
 const ip=clientIp(request);
 const verdict=await consumeRateLimit(`check:${ip}`,MAX_PER_WINDOW,WINDOW_SECONDS);
 if(!verdict.allowed)return verdict.reason==="unavailable"
  ?NextResponse.json({error:"The visibility checker is temporarily unavailable. Try again shortly."},{status:503,headers:{"Retry-After":String(verdict.retryAfter)}})
  :NextResponse.json({error:"Free checker limit reached. Try again in an hour."},{status:429,headers:{"Retry-After":String(verdict.retryAfter)}});
 const body=await request.json().catch(()=>({}));if(typeof body.url!=="string"||!body.url.trim())return NextResponse.json({error:"A website URL is required."},{status:400});
 const key=body.url.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");const saved=cache.get(key);if(saved&&saved.expires>Date.now())return NextResponse.json({...saved.result,cached:true});
 try{const result=await runVisibilityCheck(body.url);cache.set(key,{expires:Date.now()+15*60_000,result});return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}})}catch(error){const message=error instanceof Error?error.message:"Visibility check failed.";console.error("[visibility-check]",{message,ip});return NextResponse.json({error:message},{status:errorStatus(message)})}
}
