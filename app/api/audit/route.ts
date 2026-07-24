import { NextResponse } from "next/server";
import { runLocalAudit } from "@/lib/audit/run-audit";
import { placesConfigured } from "@/lib/audit/places";
import type { LocalAuditResult } from "@/lib/audit/types";

export const runtime = "nodejs";
export const maxDuration = 30;
const globalState = globalThis as typeof globalThis & { askvisibleAuditRate?: Map<string, number[]>; askvisibleAuditCache?: Map<string, { expires:number; result:LocalAuditResult }> };
const rate:Map<string,number[]>=globalState.askvisibleAuditRate ||= new Map<string,number[]>();
const cache:Map<string,{expires:number;result:LocalAuditResult}>=globalState.askvisibleAuditCache ||= new Map<string,{expires:number;result:LocalAuditResult}>();
function clientIp(request:Request){return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local"}
function allowed(ip:string){const now=Date.now(),start=now-60*60_000,recent=(rate.get(ip)||[]).filter(t=>t>start);if(recent.length>=5)return false;recent.push(now);rate.set(ip,recent);return true}
function errorStatus(message:string){if(/Google Places API is not configured/.test(message))return 503;if(/valid|public|HTTP|Local|HTML|website|URL|ports/i.test(message))return 400;return 502}
export async function POST(request:Request){
 if(!placesConfigured())return NextResponse.json({error:"Google Places API is not configured. Add GOOGLE_PLACES_API_KEY to .env.local."},{status:503});
 const ip=clientIp(request);if(!allowed(ip))return NextResponse.json({error:"Free audit limit reached. Try again in an hour."},{status:429,headers:{"Retry-After":"3600"}});
 const body=await request.json().catch(()=>({}));if(typeof body.url!=="string"||!body.url.trim())return NextResponse.json({error:"A website URL is required."},{status:400});
 const key=body.url.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");const saved=cache.get(key);if(saved&&saved.expires>Date.now())return NextResponse.json({...saved.result,cached:true});
 try{const result=await runLocalAudit(body.url);cache.set(key,{expires:Date.now()+15*60_000,result});return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}})}catch(error){const message=error instanceof Error?error.message:"Local audit failed.";console.error("[local-audit]",{message,ip});return NextResponse.json({error:message},{status:errorStatus(message)})}
}
