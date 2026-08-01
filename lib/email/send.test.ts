import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailConfigured, sendEmail } from "./send";

const message = { to: "owner@example.com", subject: "Subject", text: "Body" };

describe("email sending", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.ALERT_FROM_EMAIL = "alerts@example.com";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.ALERT_FROM_EMAIL;
  });

  describe("emailConfigured", () => {
    it("needs both the key and the from address", () => {
      expect(emailConfigured()).toBe(true);
      delete process.env.ALERT_FROM_EMAIL;
      expect(emailConfigured()).toBe(false);
      process.env.ALERT_FROM_EMAIL = "alerts@example.com";
      delete process.env.RESEND_API_KEY;
      expect(emailConfigured()).toBe(false);
    });
  });

  it("skips without calling the network when unconfigured", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(message)).toEqual({ sent: false, skipped: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the message to Resend with the key and from address", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail(message);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body)).toEqual({
      from: "alerts@example.com",
      to: ["owner@example.com"],
      subject: "Subject",
      text: "Body"
    });
  });

  it("reports success on a 2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    expect(await sendEmail(message)).toEqual({ sent: true });
  });

  it("surfaces the response body on failure, not just the status", async () => {
    // An unverified domain and a bad key both come back 4xx; only the body says which.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "The example.com domain is not verified."
    }));
    const result = await sendEmail(message);
    expect(result.sent).toBe(false);
    expect(result.error).toContain("403");
    expect(result.error).toContain("not verified");
  });

  it("returns a result instead of throwing when the network fails", async () => {
    // The cron loop calls this after a scan is already saved — a throw here would turn a
    // successful scan into a failed one.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    expect(await sendEmail(message)).toEqual({ sent: false, error: "ECONNRESET" });
  });

  it("still reports the status when the error body can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => { throw new Error("stream already consumed"); }
    }));
    const result = await sendEmail(message);
    expect(result.sent).toBe(false);
    expect(result.error).toContain("500");
  });
});
