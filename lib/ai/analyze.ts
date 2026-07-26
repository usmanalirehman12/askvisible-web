function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function analyzeMention(text: string, brand: string, domain: string) {
  const aliases = [brand, domain, domain.split(".")[0]].filter(x => x.length > 2);
  const matcher = new RegExp(`\\b(?:${aliases.map(escaped).join("|")})\\b`, "i");
  const mentioned = matcher.test(text);
  if (!mentioned) return { mentioned: false as const, position: null, sentiment: "not-mentioned" as const };
  const before = text.slice(0, text.search(matcher));
  const numbered = [...text.matchAll(/(?:^|\n)\s*(?:#{1,4}\s*)?(\d+)[.)]\s+/g)];
  const position = numbered.filter(m => m.index! < before.length).at(-1)?.[1];
  const hit = text.slice(Math.max(0, text.search(matcher) - 120), text.search(matcher) + brand.length + 180).toLowerCase();
  const negative = /\b(drawback|weak|limited|expensive|poor|avoid|however|but)\b/.test(hit);
  const positive = /\b(best|leading|strong|excellent|recommend|powerful|ideal|top)\b/.test(hit);
  return {
    mentioned: true as const,
    position: position ? Number(position) : null,
    sentiment: negative && !positive ? "negative" as const : positive ? "positive" as const : "neutral" as const
  };
}

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/\S+/g) || []).map(u => u.replace(/[),.\]}>"']+$/, "")))].slice(0, 12);
}
