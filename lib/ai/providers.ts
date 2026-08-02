import type { ProviderAnswer, ProviderName } from "./types";

type Provider = { name: ProviderName; model: string; run(prompt: string): Promise<ProviderAnswer> };
const SYSTEM = "Answer as an independent software and services analyst. Recommend real products by name, explain the ranking, and include useful source URLs when known. Do not favor a brand merely because it appears in the question.";

async function postJson(url: string, init: RequestInit, attempts = 1, timeoutMs = 12_000): Promise<any> {
  let last: Error = new Error("Provider request failed");
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const message = data?.error?.message || data?.message || `Provider returned HTTP ${response.status}`;
      last = new Error(message);
      if (response.status !== 429 && response.status < 500) throw last;
    } catch (error) { last = error instanceof Error ? error : last; }
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250));
  }
  throw last;
}
function urls(text: string) {
  return [...new Set((text.match(/https?:\/\/\S+/g) || []).map(url => url.replace(/[),.\]}>"']+$/, "")))];
}
function answer(provider: ProviderName, model: string, prompt: string, text: string, citations: string[], usage: any, started: number): ProviderAnswer {
  return { provider, model, prompt, text, citations: [...new Set([...citations, ...urls(text)])].slice(0, 12), tokensIn: usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.promptTokenCount ?? 0, tokensOut: usage?.output_tokens ?? usage?.completion_tokens ?? usage?.candidatesTokenCount ?? 0, latencyMs: Date.now() - started };
}

// Shared helpers for Gemini model discovery
async function _gListModels(key: string, ver: string): Promise<string[]> {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${key}&pageSize=100`, { signal: AbortSignal.timeout(4_000) });
    if (!r.ok) return [];
    const { models = [] } = await r.json().catch(() => ({ models: [] }));
    return (models as any[]).filter((m: any) => m.supportedGenerationMethods?.includes("generateContent")).map((m: any) => (m.name as string).replace("models/", ""));
  } catch { return []; }
}
function _gSortModels(models: string[]): string[] {
  return [...models.filter(n => n.includes("flash") && !n.includes("lite")), ...models.filter(n => n.includes("pro") && !n.includes("flash")), ...models.filter(n => n.includes("flash")), ...models].filter((n, i, a) => a.indexOf(n) === i).slice(0, 5);
}
async function _gProbe(key: string, model: string, ver: string, tools?: any[]): Promise<boolean> {
  try {
    const body: any = { contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } };
    if (tools) body.tools = tools;
    const r = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent`,
      { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
    return r.ok;
  } catch { return false; }
}

// Discovers working Gemini model+version for regular generateContent. Cached per cold start.
let _gEndpoint: Promise<{ model: string; ver: string }> | null = null;
function geminiEndpoint(key: string, preferred: string): Promise<{ model: string; ver: string }> {
  if (_gEndpoint) return _gEndpoint;
  return (_gEndpoint = (async () => {
    let models: string[] = []; let listVer = "v1";
    for (const ver of ["v1", "v1beta"]) { const m = await _gListModels(key, ver); if (m.length) { models = m; listVer = ver; break; } }
    const altVer = listVer === "v1" ? "v1beta" : "v1";
    for (const model of _gSortModels(models)) { for (const ver of [listVer, altVer]) { if (await _gProbe(key, model, ver)) return { model, ver }; } }
    return { model: preferred, ver: "v1" };
  })());
}

// Discovers working Gemini model+version+tools for Google Search grounding (AI Overviews). Cached per cold start.
let _gGrounding: Promise<{ model: string; ver: string; tools: any[] }> | null = null;
function geminiGroundingEndpoint(key: string, preferred: string): Promise<{ model: string; ver: string; tools: any[] }> {
  if (_gGrounding) return _gGrounding;
  return (_gGrounding = (async () => {
    let models: string[] = []; let listVer = "v1";
    for (const ver of ["v1", "v1beta"]) { const m = await _gListModels(key, ver); if (m.length) { models = m; listVer = ver; break; } }
    const altVer = listVer === "v1" ? "v1beta" : "v1";
    // google_search is the current REST field (per ai.google.dev); googleSearchRetrieval is the
    // pre-Gemini-2.0 name, kept as a fallback for older models. Tried in that order so current
    // models resolve on the first probe instead of burning a request on a form they'll reject.
    const groundingFmts = [[{ google_search: {} }], [{ googleSearchRetrieval: {} }]];
    for (const model of _gSortModels(models)) {
      for (const ver of [listVer, altVer]) {
        for (const tools of groundingFmts) { if (await _gProbe(key, model, ver, tools)) return { model, ver, tools }; }
      }
    }
    return { model: preferred, ver: "v1beta", tools: [{ google_search: {} }] };
  })());
}

export async function runNamedProvider(name: ProviderName, prompt: string) {
  const provider = configuredProviders().find(p => p.name === name);
  if (!provider) throw new Error(`Provider "${name}" is not configured.`);
  return provider.run(prompt);
}

export function configuredProviders(): Provider[] {
  const providers: Provider[] = [];
  if (process.env.OPENAI_API_KEY) {
    const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
    providers.push({ name: "openai", model, async run(prompt) {
      const started=Date.now();
      const d=await postJson("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,instructions:SYSTEM,input:prompt,max_output_tokens:800})});
      const text=d.output_text || d.output?.flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==="output_text").map((c:any)=>c.text).join("\n") || "";
      // Reasoning-capable models can spend the whole max_output_tokens budget on internal
      // reasoning and return status "incomplete" with zero visible text -- still a 200, so
      // postJson treats it as success. Left unchecked this silently stores an empty answer as
      // "brand not mentioned" instead of surfacing as a provider failure (seen in prod: two
      // prompts in one scan came back with raw_answer "" and brand_mentioned false).
      if (!text && d.status === "incomplete") throw new Error(`OpenAI returned no text (${d.incomplete_details?.reason || "incomplete"}).`);
      return answer("openai",model,prompt,text,[],d.usage,started);
    } });
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const key=process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY; const preferred=process.env.GEMINI_MODEL || "gemini-3.6-flash";
    providers.push({ name:"gemini",model:preferred,async run(prompt){const started=Date.now();const {model,ver}=await geminiEndpoint(key!,preferred);const d=await postJson(`https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"x-goog-api-key":key!,"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:SYSTEM+"\n\n"+prompt}]}],generationConfig:{maxOutputTokens:400}})});const text=d.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("\n")||"";return answer("gemini",model,prompt,text,[],d.usageMetadata,started)}});
  }
  if (process.env.PERPLEXITY_API_KEY) {
    const model=process.env.PERPLEXITY_MODEL || "sonar";
    providers.push({name:"perplexity",model,async run(prompt){const started=Date.now();const d=await postJson("https://api.perplexity.ai/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${process.env.PERPLEXITY_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:SYSTEM},{role:"user",content:prompt}],max_tokens:400})});return answer("perplexity",model,prompt,d.choices?.[0]?.message?.content||"",d.citations||[],d.usage,started)}});
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const model=process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
    providers.push({name:"anthropic",model,async run(prompt){const started=Date.now();const d=await postJson("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":process.env.ANTHROPIC_API_KEY!,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model,system:SYSTEM,max_tokens:400,messages:[{role:"user",content:prompt}]})});const text=d.content?.filter((c:any)=>c.type==="text").map((c:any)=>c.text).join("\n")||"";return answer("anthropic",model,prompt,text,[],d.usage,started)}});
  }
  if (process.env.DEEPSEEK_API_KEY) {
    const model=process.env.DEEPSEEK_MODEL||"deepseek-chat";
    providers.push({name:"deepseek",model,async run(prompt){const started=Date.now();const d=await postJson("https://api.deepseek.com/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${process.env.DEEPSEEK_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:SYSTEM},{role:"user",content:prompt}],max_tokens:400})},2);return answer("deepseek",model,prompt,d.choices?.[0]?.message?.content||"",[], d.usage,started)}});
  }
  // Google AI Overviews — uses Gemini with Google Search grounding, which is the underlying
  // technology that powers AI Overviews. Requires the same Gemini API key but must be
  // explicitly opted in (GOOGLE_AI_OVERVIEWS=true) since it runs a second Gemini call per
  // prompt and search grounding incurs additional billing on Google's paid tiers.
  if ((process.env.GEMINI_API_KEY||process.env.GOOGLE_GENERATIVE_AI_API_KEY) && process.env.GOOGLE_AI_OVERVIEWS?.trim() === "true") {
    const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_GENERATIVE_AI_API_KEY; const preferred="gemini-3.6-flash";
    providers.push({name:"ai_overviews",model:preferred,async run(prompt){const started=Date.now();const {model,ver,tools}=await geminiGroundingEndpoint(key!,preferred);const d=await postJson(`https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"x-goog-api-key":key!,"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:SYSTEM+"\n\n"+prompt}]}],tools,generationConfig:{maxOutputTokens:400}})},1,20_000);const text=d.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("\n")||"";return answer("ai_overviews",model,prompt,text,[],d.usageMetadata,started)}});
  }
  return providers;
}
