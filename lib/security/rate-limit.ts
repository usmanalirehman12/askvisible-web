import { createServiceClient } from "@/lib/supabase/service";

// "limit" means the caller genuinely used up their window. "unavailable" means we
// couldn't reach the counter — the caller may be innocent, so routes should say so
// rather than accusing them of hammering the endpoint.
export type RateLimitVerdict = { allowed: boolean; retryAfter: number; reason?: "limit" | "unavailable" };

type ConsumeRow = { allowed: boolean; retry_after: number };

// Shared fixed-window limiter for the unauthenticated public endpoints. Counts live in
// Postgres (see consume_rate_limit in supabase/schema.sql) because the previous
// module-level Map gave each Vercel instance its own counter — the ceiling grew with
// traffic, which is precisely backwards for a spend guard.
//
// Fails CLOSED. If the database is unreachable we deny, because what's behind these
// endpoints is money on an open door. A database outage degrading the free checker is a
// worse-looking but cheaper failure than an outage removing the only spend limit.
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitVerdict> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) throw new Error(error.message);
    // Postgres set-returning functions come back as an array through PostgREST, but a
    // single-row shape is a legal response too. Accept either.
    const row = (Array.isArray(data) ? data[0] : data) as ConsumeRow | undefined;
    if (!row || typeof row.allowed !== "boolean") throw new Error("consume_rate_limit returned no verdict");
    const retryAfter = Number(row.retry_after);
    return { allowed: row.allowed, retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : windowSeconds, reason: row.allowed ? undefined : "limit" };
  } catch (error) {
    console.error("[rate-limit]", { key, message: error instanceof Error ? error.message : String(error) });
    return { allowed: false, retryAfter: windowSeconds, reason: "unavailable" };
  }
}
