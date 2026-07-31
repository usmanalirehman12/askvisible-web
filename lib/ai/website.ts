import { safePublicUrl } from "@/lib/security/url";
import { metaTag as meta, pageTitle as title } from "./html-meta";
import type { BrandProfile } from "./types";

export async function discoverBrand(input: string): Promise<BrandProfile> {
  let url = await safePublicUrl(input);
  let response: Response | undefined;
  for (let redirects = 0; redirects < 4; redirects++) {
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "AskVisibleBot/1.0 (+https://askvisible.app)", Accept: "text/html,application/xhtml+xml" } });
    if (![301,302,303,307,308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) break;
    url = await safePublicUrl(new URL(location, url).toString());
  }
  if (!response?.ok) throw new Error(`Website returned ${response?.status || "no response"}.`);
  if (!(response.headers.get("content-type") || "").includes("text/html")) throw new Error("The URL must point to an HTML website.");
  const html = (await response.text()).slice(0, 250_000);
  const pageTitle = meta(html, "og:title") || title(html);
  const siteName = meta(html, "og:site_name");
  const description = meta(html, "description") || meta(html, "og:description");
  const domainName = url.hostname.replace(/^www\./, "");
  const inferred = (siteName || pageTitle.split(/[|—–-]/)[0] || domainName.split(".")[0]).trim();
  return { name: inferred.slice(0, 80), domain: domainName, url: url.origin, title: pageTitle.slice(0, 160), description: description.slice(0, 500) };
}

export { generateBuyerPrompts } from "./buyer-prompts";
