import { NextResponse } from "next/server";
import { configuredProviders } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 10;

const globalState = globalThis as typeof globalThis & { publicScanRate?: Map<string, number> };
const rate: Map<string, number> = (globalState.publicScanRate ||= new Map());

function clientIp(req: Request) {
  return req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
function allowed(ip: string) {
  const last = rate.get(ip);
  if (last && Date.now() - last < 10 * 60_000) return false;
  rate.set(ip, Date.now());
  return true;
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    if (!allowed(ip)) return NextResponse.json({ error: "Free scan limit reached. Try again in 10 minutes." }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const { brand, domain, category } = body;
    if (!brand || !domain) return NextResponse.json({ error: "Brand name and domain are required." }, { status: 400 });

    const providers = configuredProviders().filter(p => p.name !== "ai_overviews").slice(0, 3);
    if (!providers.length) return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });

    const cat = (category || "tools and solutions").toLowerCase().trim();
    const tasks = providers.flatMap(p => [
      { provider: p.name, prompt: `What are the best ${cat}? Give your top recommendations with reasons.` },
      { provider: p.name, prompt: `I need a ${cat} solution. Who are the leading providers you'd recommend and why?` }
    ]);

    return NextResponse.json({ brand, domain, tasks });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 500 });
  }
}
