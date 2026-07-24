import type { BrandProfile } from "./types";

// Split out of website.ts on purpose: this is a pure string-templating function with no
// network I/O, but website.ts also exports discoverBrand, which imports safePublicUrl
// (lib/security/url.ts, Node-only dns/net for SSRF checks). Any importer of that module —
// even one that only wants this function — pulls the whole module in, and webpack fails
// trying to bundle Node built-ins for a client component. Callers that only need prompt
// generation (like lib/data/workspace.ts, called from a "use client" component) must import
// from here, not from website.ts, or the client bundle breaks.
export function generateBuyerPrompts(brand: Pick<BrandProfile, "name" | "description" | "title">) {
  const context = brand.description || brand.title;
  const category = context ? ` in the category described as: ${context.slice(0, 180)}` : "";
  return [
    `What are the best products${category}? Recommend and compare the strongest options.`,
    `Which tools are the leading alternatives for customers considering ${brand.name}?`,
    `What product should a growing business choose${category}? Include reasons and trade-offs.`
  ];
}
