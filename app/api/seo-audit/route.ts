import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

type CheckResult = {
  id: string;
  label: string;
  category: "technical" | "meta" | "content" | "social" | "schema";
  status: "pass" | "warning" | "fail";
  message: string;
  recommendation?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = domain.startsWith("http") ? domain : `https://${domain}`;

  let html = "";
  let fetchError = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AskVisibleAI/1.0 (+https://askvisibleai.com/bot)" },
      signal: AbortSignal.timeout(9000),
    });
    html = await res.text();
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "Failed to fetch";
  }

  const checks: CheckResult[] = [];

  // HTTPS
  checks.push({
    id: "https",
    label: "HTTPS enabled",
    category: "technical",
    status: url.startsWith("https://") ? "pass" : "fail",
    message: url.startsWith("https://") ? "Site uses HTTPS encryption" : "Site is not using HTTPS",
    recommendation: url.startsWith("https://") ? undefined : "Enable SSL/TLS — required for security, SEO, and AI crawler access",
  });

  if (html) {
    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    const titleLen = title?.length ?? 0;
    checks.push({
      id: "title",
      label: "Page title",
      category: "meta",
      status: title ? (titleLen >= 30 && titleLen <= 65 ? "pass" : "warning") : "fail",
      message: title ? `"${title.slice(0, 60)}${title.length > 60 ? "…" : ""}" (${titleLen} chars)` : "No <title> tag found",
      recommendation: !title
        ? "Add a descriptive <title> tag (30–65 characters) with your brand name and primary keyword"
        : titleLen < 30 ? "Title too short — expand to 30–65 characters with target keywords"
        : titleLen > 65 ? "Title too long — trim to under 65 characters to avoid truncation in search results"
        : undefined,
    });

    // Meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{1,500})["']/i)
      ?? html.match(/<meta[^>]*content=["']([^"']{1,500})["'][^>]*name=["']description["']/i);
    const desc = descMatch ? descMatch[1].trim() : null;
    const descLen = desc?.length ?? 0;
    checks.push({
      id: "meta_description",
      label: "Meta description",
      category: "meta",
      status: desc ? (descLen >= 100 && descLen <= 160 ? "pass" : "warning") : "fail",
      message: desc ? `Found (${descLen} chars): "${desc.slice(0, 80)}${desc.length > 80 ? "…" : ""}"` : "No meta description found",
      recommendation: !desc
        ? "Add a compelling meta description (100–160 chars) summarising the page for search results and AI snippets"
        : descLen < 100 ? "Description too short — aim for 100–160 characters"
        : descLen > 160 ? "Description too long — trim to 160 characters to avoid truncation"
        : undefined,
    });

    // H1
    const h1Matches = [...html.matchAll(/<h1[^>]*>/gi)];
    checks.push({
      id: "h1",
      label: "H1 heading",
      category: "content",
      status: h1Matches.length === 1 ? "pass" : h1Matches.length === 0 ? "fail" : "warning",
      message: h1Matches.length === 0 ? "No H1 tag found" : h1Matches.length === 1 ? "Single H1 tag found ✓" : `${h1Matches.length} H1 tags — should have exactly one`,
      recommendation: h1Matches.length === 0
        ? "Add one H1 tag containing your primary keyword — critical for both SEO and AI entity recognition"
        : h1Matches.length > 1 ? "Remove duplicate H1 tags — use H2/H3 for subsections"
        : undefined,
    });

    // H2 headings
    const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
    checks.push({
      id: "h2",
      label: "H2 subheadings",
      category: "content",
      status: h2Count >= 2 ? "pass" : h2Count === 1 ? "warning" : "warning",
      message: h2Count === 0 ? "No H2 headings found" : `${h2Count} H2 heading${h2Count !== 1 ? "s" : ""} found`,
      recommendation: h2Count < 2 ? "Add H2 headings to structure content into clear sections — helps AI engines extract answers" : undefined,
    });

    // Open Graph
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const ogScore = (ogTitle ? 1 : 0) + (ogDesc ? 1 : 0) + (ogImage ? 1 : 0);
    checks.push({
      id: "og_tags",
      label: "Open Graph tags",
      category: "social",
      status: ogScore === 3 ? "pass" : ogScore >= 1 ? "warning" : "fail",
      message: `og:title ${ogTitle ? "✓" : "✗"}  og:description ${ogDesc ? "✓" : "✗"}  og:image ${ogImage ? "✓" : "✗"}`,
      recommendation: ogScore === 0
        ? "Add og:title, og:description, og:image — used by social media and increasingly by AI engines for brand understanding"
        : !ogImage ? "Add og:image to enable rich previews on social platforms"
        : undefined,
    });

    // Twitter Card
    const twitterCard = html.match(/<meta[^>]*name=["']twitter:card["']/i);
    checks.push({
      id: "twitter_card",
      label: "Twitter/X Card",
      category: "social",
      status: twitterCard ? "pass" : "warning",
      message: twitterCard ? "Twitter Card meta tag found" : "No Twitter Card meta tag",
      recommendation: twitterCard ? undefined : "Add <meta name=\"twitter:card\" content=\"summary_large_image\"> for rich Twitter previews",
    });

    // Canonical URL
    const canonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
      ?? html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
    checks.push({
      id: "canonical",
      label: "Canonical URL",
      category: "technical",
      status: canonical ? "pass" : "warning",
      message: canonical ? `Canonical: ${canonical[1].replace(/^https?:\/\//, "").slice(0, 60)}` : "No canonical tag found",
      recommendation: canonical ? undefined : "Add <link rel=\"canonical\" href=\"...\"> to prevent duplicate content and consolidate link equity",
    });

    // Schema / Structured Data
    const schemaMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/gi) || [];
    checks.push({
      id: "schema",
      label: "Structured data (Schema.org)",
      category: "schema",
      status: schemaMatches.length > 0 ? "pass" : "fail",
      message: schemaMatches.length > 0 ? `${schemaMatches.length} JSON-LD script${schemaMatches.length !== 1 ? "s" : ""} found` : "No structured data found",
      recommendation: schemaMatches.length === 0
        ? "Add Schema.org markup (Organization, Product, LocalBusiness, or FAQPage) — AI engines use structured data to understand and cite your brand"
        : undefined,
    });

    // Viewport (mobile)
    const viewport = html.match(/<meta[^>]*name=["']viewport["']/i);
    checks.push({
      id: "viewport",
      label: "Mobile viewport",
      category: "technical",
      status: viewport ? "pass" : "fail",
      message: viewport ? "Viewport meta tag present — mobile-friendly" : "No viewport meta tag",
      recommendation: viewport ? undefined : "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> for mobile compatibility",
    });

    // Robots meta
    const robotsMeta = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']robots["']/i);
    if (robotsMeta) {
      const val = robotsMeta[1].toLowerCase();
      const blocked = val.includes("noindex");
      checks.push({
        id: "robots",
        label: "Robots directive",
        category: "technical",
        status: blocked ? "warning" : "pass",
        message: `robots: ${robotsMeta[1]}`,
        recommendation: blocked ? "noindex detected — verify this is intentional, as it blocks this page from all search engines and AI crawlers" : undefined,
      });
    }

    // Image alt texts
    const imgTags = [...html.matchAll(/<img[^>]*>/gi)];
    if (imgTags.length > 0) {
      const withAlt = imgTags.filter(m => /alt=["'][^"']+["']/i.test(m[0])).length;
      const missing = imgTags.length - withAlt;
      checks.push({
        id: "img_alt",
        label: "Image alt text",
        category: "content",
        status: missing === 0 ? "pass" : missing < imgTags.length / 2 ? "warning" : "fail",
        message: `${withAlt}/${imgTags.length} images have alt text`,
        recommendation: missing > 0 ? `Add descriptive alt text to ${missing} image${missing !== 1 ? "s" : ""} — improves accessibility and AI content understanding` : undefined,
      });
    }

    // Internal links
    const internalLinks = (html.match(new RegExp(`href=["'][^"']*${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"']*["']`, "gi")) || []).length;
    const anyLinks = (html.match(/href=["'][^"'#]+["']/gi) || []).length;
    if (anyLinks > 0) {
      checks.push({
        id: "internal_links",
        label: "Internal linking",
        category: "content",
        status: internalLinks >= 3 ? "pass" : internalLinks >= 1 ? "warning" : "warning",
        message: `${anyLinks} links found on homepage`,
        recommendation: anyLinks < 5 ? "Add more internal links to key pages — helps AI engines discover and index your content" : undefined,
      });
    }
  } else if (fetchError) {
    checks.push({
      id: "fetch_error",
      label: "Page accessibility",
      category: "technical",
      status: "fail",
      message: `Could not fetch ${domain}: ${fetchError}`,
      recommendation: "Ensure your domain is publicly accessible and not blocking bots",
    });
  }

  const passed = checks.filter(c => c.status === "pass").length;
  const seoScore = Math.round((passed / Math.max(checks.length, 1)) * 100);

  return NextResponse.json({ checks, seoScore, domain, fetchError: fetchError || null });
}
