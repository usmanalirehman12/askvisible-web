// Pure string parsing, no Node/Edge-specific APIs — safe to import from any runtime
// (client, Edge, or Node). Split out of website.ts so Edge routes can reuse the same
// meta-tag extraction without pulling in website.ts's Node-only dns/net dependency.
export function decodeHtml(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function metaTag(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const prop = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (prop === key.toLowerCase()) return decodeHtml(tag.match(/content=["']([^"']*)["']/i)?.[1] || "");
  }
  return "";
}

export function pageTitle(html: string) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}
