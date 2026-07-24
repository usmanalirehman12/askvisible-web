import { NextResponse } from "next/server";
import { configuredProviders } from "@/lib/ai/providers";
import { placesConfigured } from "@/lib/audit/places";
export const runtime="nodejs";
export async function GET(){const configured=configuredProviders().map(({name,model})=>({name,model}));return NextResponse.json({ready:configured.length>0,configured,required:["OPENAI_API_KEY","GEMINI_API_KEY","PERPLEXITY_API_KEY","ANTHROPIC_API_KEY"],localAudit:{ready:placesConfigured(),required:["GOOGLE_PLACES_API_KEY"]}})}
