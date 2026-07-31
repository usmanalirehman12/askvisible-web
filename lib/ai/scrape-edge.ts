import { metaTag, pageTitle } from "./html-meta";

const PRIVATE_HOST_PREFIXES = ["127.", "10.", "192.168.", "169.254.", "0."];
export function isObviouslyPrivateHost(hostname: string) {
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  if (PRIVATE_HOST_PREFIXES.some(p => hostname.startsWith(p))) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

// Best-effort homepage scrape for Edge routes, which can't use the Node-only DNS-based
// SSRF check in lib/security/url.ts (safePublicUrl uses node:dns/node:net — unavailable
// on Edge). This only blocks obvious IP-literal/localhost targets by string match, so it
// doesn't catch DNS-rebinding attacks the way safePublicUrl does. Acceptable trade-off
// here: the caller only reads title/meta text to enrich a Claude prompt, never returns
// page content to the requester, and silently falls back to name-only generation on any
// failure (including a `null` return from a blocked/failed fetch).
export async function scrapeHomepageMeta(domain: string): Promise<{ title: string; description: string } | null> {
  try {
    const raw = domain.trim();
    if (!raw) return null;
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (isObviouslyPrivateHost(url.hostname)) return null;

    const response = await fetch(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "AskVisibleBot/1.0 (+https://askvisible.app)", Accept: "text/html,application/xhtml+xml" }
    });
    if (!response.ok) return null;
    if (!(response.headers.get("content-type") || "").includes("text/html")) return null;

    const html = (await response.text()).slice(0, 250_000);
    const description = metaTag(html, "description") || metaTag(html, "og:description");
    const scrapedTitle = metaTag(html, "og:title") || pageTitle(html);
    return { title: scrapedTitle.slice(0, 160), description: description.slice(0, 500) };
  } catch {
    return null;
  }
}
