import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createServiceClient = vi.fn(() => ({ rpc }));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => createServiceClient() }));

// Imported after the mock so the helper picks up the stubbed client.
const { consumeRateLimit } = await import("./rate-limit");

describe("consumeRateLimit", () => {
  beforeEach(() => {
    // The helper logs on every failure path; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rpc.mockReset();
    createServiceClient.mockClear();
    vi.restoreAllMocks();
  });

  it("passes the key, limit and window straight through to the SQL function", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after: 3600 }], error: null });
    await consumeRateLimit("check:1.2.3.4", 5, 3600);
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", { p_key: "check:1.2.3.4", p_limit: 5, p_window_seconds: 3600 });
  });

  it("allows the request when the counter is under the limit", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after: 3200 }], error: null });
    expect(await consumeRateLimit("check:ip", 5, 3600)).toEqual({ allowed: true, retryAfter: 3200, reason: undefined });
  });

  it("denies with reason 'limit' and the remaining window when the caller is over", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after: 1800 }], error: null });
    expect(await consumeRateLimit("check:ip", 5, 3600)).toEqual({ allowed: false, retryAfter: 1800, reason: "limit" });
  });

  it("accepts a single-row response as well as an array", async () => {
    rpc.mockResolvedValue({ data: { allowed: true, retry_after: 900 }, error: null });
    expect(await consumeRateLimit("check:ip", 5, 3600)).toMatchObject({ allowed: true, retryAfter: 900 });
  });

  describe("fails closed", () => {
    it("denies when the RPC returns an error", async () => {
      rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });
      expect(await consumeRateLimit("check:ip", 5, 3600)).toEqual({ allowed: false, retryAfter: 3600, reason: "unavailable" });
    });

    it("denies when the RPC rejects", async () => {
      rpc.mockRejectedValue(new Error("network down"));
      expect(await consumeRateLimit("check:ip", 5, 3600)).toEqual({ allowed: false, retryAfter: 3600, reason: "unavailable" });
    });

    it("denies when the service client can't be constructed (missing env)", async () => {
      createServiceClient.mockImplementationOnce(() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured."); });
      expect(await consumeRateLimit("check:ip", 5, 3600)).toEqual({ allowed: false, retryAfter: 3600, reason: "unavailable" });
    });

    it("denies when the function returns an empty result set", async () => {
      rpc.mockResolvedValue({ data: [], error: null });
      expect(await consumeRateLimit("check:ip", 5, 3600)).toEqual({ allowed: false, retryAfter: 3600, reason: "unavailable" });
    });

    it("denies when the verdict is missing or the wrong type", async () => {
      rpc.mockResolvedValue({ data: [{ retry_after: 60 }], error: null });
      expect(await consumeRateLimit("check:ip", 5, 3600)).toMatchObject({ allowed: false, reason: "unavailable" });
    });
  });

  it("falls back to the full window when retry_after is missing or nonsensical", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after: null }], error: null });
    expect(await consumeRateLimit("check:ip", 5, 3600)).toMatchObject({ retryAfter: 3600 });
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after: -5 }], error: null });
    expect(await consumeRateLimit("check:ip", 5, 3600)).toMatchObject({ retryAfter: 3600 });
  });

  it("namespaces buckets so /api/check and /api/audit don't share a counter", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after: 3600 }], error: null });
    await consumeRateLimit("check:9.9.9.9", 5, 3600);
    await consumeRateLimit("audit:9.9.9.9", 5, 3600);
    const keys = rpc.mock.calls.map(call => call[1].p_key);
    expect(new Set(keys).size).toBe(2);
  });
});
