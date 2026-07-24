import { NextResponse } from "next/server";
import { runVisibilityCheck } from "@/lib/ai/orchestrator";
import type { VisibilityResult } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;
const globalState = globalThis as typeof globalThis & { askvisibleRate?: Map<string, number[]>; askvisibleCache?: Map<string, { expires:number; result:VisibilityResult }> };
const rate:Map<string,number[]>=globalState.askvisibleRate ||= new Map<string,number[]>();
const cache:Map<string,{expires:number;result:VisibilityResult}>=globalState.askvisibleCache ||= new Map<string,{expires:number;result:VisibilityResult}>();
function clientIp(request:Request){return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local"}
function allowed(ip:string){const now=Date.now(),start=now-60*60_000,recent=(rate.get(ip)||[]).filter(t=>t>start);if(recent.length>=5)return false;recent.push(now);rate.set(ip,recent);return true}
function errorStatus(message:string){if(/No AI providers/.test(message))return 503;if(/valid|public|HTTP|Local|HTML|website|URL|ports/i.test(message))return 400;return 502}
export async function POST(request:Request){
 const ip=clientIp(request);if(!allowed(ip))return NextResponse.json({error:"Free checker limit reached. Try again in an hour."},{status:429,headers:{"Retry-After":"3600"}});
 const body=await request.json().catch(()=>({}));if(typeof body.url!=="string"||!body.url.trim())return NextResponse.json({error:"A website URL is required."},{status:400});
 const key=body.url.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");const saved=cache.get(key);if(saved&&saved.expires>Date.now())return NextResponse.json({...saved.result,cached:true});
 try{const result=await runVisibilityCheck(body.url);cache.set(key,{expires:Date.now()+15*60_000,result});return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}})}catch(error){const message=error instanceof Error?error.message:"Visibility check failed.";console.error("[visibility-check]",{message,ip});return NextResponse.json({error:message},{status:errorStatus(message)})}
}
