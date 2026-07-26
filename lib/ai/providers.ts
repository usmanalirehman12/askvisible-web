import type { ProviderAnswer, ProviderName } from "./types";

type Provider = { name: ProviderName; model: string; run(prompt: string): Promise<ProviderAnswer> };
const SYSTEM = "Answer as an independent software and services analyst. Recommend real products by name, explain the ranking, and include useful source URLs when known. Do not favor a brand merely because it appears in the question.";

async function postJson(url: string, init: RequestInit, attempts = 1): Promise<any> {
  let last: Error = new Error("Provider request failed");
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
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

export function configuredProviders(): Provider[] {
  const providers: Provider[] = [];
  if (process.env.OPENAI_API_KEY) {
    const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
    providers.push({ name: "openai", model, async run(prompt) { const started=Date.now(); const d=await postJson("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,instructions:SYSTEM,input:prompt,max_output_tokens:900})}); const text=d.output_text || d.output?.flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==="output_text").map((c:any)=>c.text).join("\n") || ""; return answer("openai",model,prompt,text,[],d.usage,started); } });
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const key=process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY; const model=process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview";
    providers.push({ name:"gemini",model,async run(prompt){const started=Date.now();const d=await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"x-goog-api-key":key!,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:900}})});const text=d.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("\n")||"";return answer("gemini",model,prompt,text,[],d.usageMetadata,started)}});
  }
  if (process.env.PERPLEXITY_API_KEY) {
    const model=process.env.PERPLEXITY_MODEL || "sonar";
    providers.push({name:"perplexity",model,async run(prompt){const started=Date.now();const d=await postJson("https://api.perplexity.ai/v1/sonar",{method:"POST",headers:{Authorization:`Bearer ${process.env.PERPLEXITY_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:SYSTEM},{role:"user",content:prompt}],max_tokens:900})});return answer("perplexity",model,prompt,d.choices?.[0]?.message?.content||"",d.citations||[],d.usage,started)}});
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const model=process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
    providers.push({name:"anthropic",model,async run(prompt){const started=Date.now();const d=await postJson("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":process.env.ANTHROPIC_API_KEY!,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model,system:SYSTEM,max_tokens:900,messages:[{role:"user",content:prompt}]})});const text=d.content?.filter((c:any)=>c.type==="text").map((c:any)=>c.text).join("\n")||"";return answer("anthropic",model,prompt,text,[],d.usage,started)}});
  }
  if (process.env.DEEPSEEK_API_KEY) {
    const model=process.env.DEEPSEEK_MODEL||"deepseek-chat";
    providers.push({name:"deepseek",model,async run(prompt){const started=Date.now();const d=await postJson("https://api.deepseek.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${process.env.DEEPSEEK_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:SYSTEM},{role:"user",content:prompt}],max_tokens:900})},2);return answer("deepseek",model,prompt,d.choices?.[0]?.message?.content||"",[], d.usage,started)}});
  }
  // Google AI Overviews — uses Gemini with Google Search grounding, which is the underlying
  // technology that powers AI Overviews. Requires the same Gemini API key but must be
  // explicitly opted in (GOOGLE_AI_OVERVIEWS=true) since it runs a second Gemini call per
  // prompt and search grounding incurs additional billing on Google's paid tiers.
  if ((process.env.GEMINI_API_KEY||process.env.GOOGLE_GENERATIVE_AI_API_KEY) && process.env.GOOGLE_AI_OVERVIEWS==="true") {
    const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const model="gemini-2.0-flash";
    providers.push({name:"ai_overviews",model,async run(prompt){const started=Date.now();const d=await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"x-goog-api-key":key!,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:"user",parts:[{text:prompt}]}],tools:[{google_search:{}}],generationConfig:{maxOutputTokens:900}})});const text=d.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("\n")||"";return answer("ai_overviews",model,prompt,text,[],d.usageMetadata,started)}});
  }
  return providers;
}
