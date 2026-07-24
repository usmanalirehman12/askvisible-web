// Google Places API (New), not the full Google Business Profile API: Places is a plain
// API-key lookup that works against any public listing (yours or a competitor's) with no
// owner OAuth/consent flow. The full GBP API requires the business owner to authorize your
// app against their specific listing — too heavy a consent step for a self-serve signup path,
// and unnecessary here since we only need to read public listing/review data, not write to it.
async function postJson(url: string, init: RequestInit, attempts = 3): Promise<any> {
  let last: Error = new Error("Places request failed");
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const message = data?.error?.message || `Places API returned HTTP ${response.status}`;
      last = new Error(message);
      if (response.status !== 429 && response.status < 500) throw last;
    } catch (error) { last = error instanceof Error ? error : last; }
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250));
  }
  throw last;
}

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

const FIELD_MASK = "places.id,places.displayName,places.rating,places.userRatingCount,places.reviews,places.businessStatus,places.types,places.websiteUri,places.regularOpeningHours,places.photos";

export async function findPlace(name: string, domain: string): Promise<any | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("Google Places API is not configured. Add GOOGLE_PLACES_API_KEY to .env.local.");
  const data = await postJson("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK, "Content-Type": "application/json" },
    body: JSON.stringify({ textQuery: `${name} ${domain}` })
  });
  return data.places?.[0] ?? null;
}
