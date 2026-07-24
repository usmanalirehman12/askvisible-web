import { discoverBrand } from "@/lib/ai/website";
import { findPlace } from "./places";
import type { AuditFinding, LocalAuditResult, ReviewSnippet } from "./types";

function auditScore(place: any): number {
  let score = 0;
  if (place.rating) score += Math.min(40, (place.rating / 5) * 40);
  if (place.userRatingCount) score += Math.min(25, Math.log10(place.userRatingCount + 1) * 12);
  if (place.websiteUri) score += 15;
  if (place.regularOpeningHours) score += 10;
  if (place.photos?.length) score += Math.min(10, place.photos.length);
  return Math.round(Math.min(100, score));
}

function findings(place: any): AuditFinding[] {
  const items: AuditFinding[] = [];
  if (!place.websiteUri) items.push({ category: "gbp", title: "Add your website to your Google Business Profile", rationale: "AI engines and searchers use this link to verify you're a real, findable business.", impactLow: 5, impactHigh: 10 });
  if (!place.regularOpeningHours) items.push({ category: "gbp", title: "Add business hours to your Google Business Profile", rationale: "Missing hours is a common reason AI answers skip a listing when comparing options.", impactLow: 3, impactHigh: 6 });
  if ((place.userRatingCount ?? 0) < 10) items.push({ category: "reviews", title: "Build up your review count", rationale: "Businesses with fewer than 10 reviews are rarely cited as a confident recommendation.", impactLow: 8, impactHigh: 15 });
  if ((place.rating ?? 5) < 4) items.push({ category: "reviews", title: "Address recent negative reviews", rationale: "A sub-4.0 rating is a common reason AI engines recommend a competitor instead.", impactLow: 6, impactHigh: 12 });
  return items;
}

export async function runLocalAudit(url: string): Promise<LocalAuditResult> {
  const brand = await discoverBrand(url);
  const place = await findPlace(brand.name, brand.domain);
  if (!place) {
    return {
      mode: "live", found: false, name: brand.name, rating: null, reviewCount: 0, reviews: [],
      businessStatus: null, hasWebsite: false, hasHours: false, photoCount: 0, categories: [],
      auditScore: 0,
      findings: [{ category: "gbp", title: "No Google Business Profile found", rationale: "We couldn't find a listing for this business — claim or create one before AI engines can cite it.", impactLow: 15, impactHigh: 30 }],
      scannedAt: new Date().toISOString()
    };
  }
  const reviews: ReviewSnippet[] = (place.reviews || []).slice(0, 5).map((r: any) => ({
    rating: r.rating ?? 0,
    text: r.text?.text || "",
    relativeTime: r.relativePublishTimeDescription || ""
  }));
  return {
    mode: "live",
    found: true,
    name: place.displayName?.text || brand.name,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? 0,
    reviews,
    businessStatus: place.businessStatus ?? null,
    hasWebsite: Boolean(place.websiteUri),
    hasHours: Boolean(place.regularOpeningHours),
    photoCount: place.photos?.length ?? 0,
    categories: place.types ?? [],
    auditScore: auditScore(place),
    findings: findings(place),
    scannedAt: new Date().toISOString()
  };
}
