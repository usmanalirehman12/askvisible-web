import { afterEach, describe, expect, it, vi } from "vitest";
import { isObviouslyPrivateHost, scrapeHomepageMeta } from "./scrape-edge";

describe("isObviouslyPrivateHost", () => {
  it("blocks localhost and .local hosts", () => {
    expect(isObviouslyPrivateHost("localhost")).toBe(true);
    expect(isObviouslyPrivateHost("printer.local")).toBe(true);
  });

  it("blocks loopback and private IPv4 ranges", () => {
    expect(isObviouslyPrivateHost("127.0.0.1")).toBe(true);
    expect(isObviouslyPrivateHost("10.0.0.5")).toBe(true);
    expect(isObviouslyPrivateHost("192.168.1.1")).toBe(true);
    expect(isObviouslyPrivateHost("0.0.0.0")).toBe(true);
  });

  it("blocks the cloud metadata address (169.254.169.254)", () => {
    expect(isObviouslyPrivateHost("169.254.169.254")).toBe(true);
  });

  it("blocks the full 172.16.0.0/12 range, respecting the boundaries", () => {
    expect(isObviouslyPrivateHost("172.16.0.1")).toBe(true);
    expect(isObviouslyPrivateHost("172.20.5.5")).toBe(true);
    expect(isObviouslyPrivateHost("172.31.255.255")).toBe(true);
    expect(isObviouslyPrivateHost("172.15.255.255")).toBe(false);
    expect(isObviouslyPrivateHost("172.32.0.1")).toBe(false);
  });

  it("allows public hostnames", () => {
    expect(isObviouslyPrivateHost("stripe.com")).toBe(false);
    expect(isObviouslyPrivateHost("www.example.com")).toBe(false);
  });
});

function fakeResponse(opts: { ok?: boolean; contentType?: string; body?: string }) {
  return {
    ok: opts.ok ?? true,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? opts.contentType ?? "text/html" : null) },
    text: async () => opts.body ?? ""
  };
}

describe("scrapeHomepageMeta", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null and never fetches for an empty domain", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await scrapeHomepageMeta("  ")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null and never fetches for an obviously private host", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await scrapeHomepageMeta("localhost:3000")).toBeNull();
    expect(await scrapeHomepageMeta("127.0.0.1")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("extracts title and description from a successful HTML response", async () => {
    const html = `<html><head><title>Acme Co</title><meta name="description" content="We sell widgets"></head></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ body: html })));
    const result = await scrapeHomepageMeta("acme.com");
    expect(result).toEqual({ title: "Acme Co", description: "We sell widgets" });
  });

  it("title prefers og:title, description prefers the plain description tag", async () => {
    // Documents an existing asymmetry in scrapeHomepageMeta: og:title wins for the title,
    // but the plain <meta name="description"> tag wins for the description (og:description
    // is only used as a fallback when it's absent) — see scrape-edge.ts.
    const html = `<html><head><title>Fallback Title</title><meta property="og:title" content="OG Title"><meta name="description" content="Plain desc"><meta property="og:description" content="OG desc"></head></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ body: html })));
    const result = await scrapeHomepageMeta("acme.com");
    expect(result).toEqual({ title: "OG Title", description: "Plain desc" });
  });

  it("falls back to og:description when the plain description tag is absent", async () => {
    const html = `<html><head><title>T</title><meta property="og:description" content="OG desc only"></head></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ body: html })));
    const result = await scrapeHomepageMeta("acme.com");
    expect(result?.description).toBe("OG desc only");
  });

  it("returns null when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false })));
    expect(await scrapeHomepageMeta("acme.com")).toBeNull();
  });

  it("returns null when the response isn't HTML", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ contentType: "application/json" })));
    expect(await scrapeHomepageMeta("acme.com")).toBeNull();
  });

  it("returns null when fetch throws or times out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await scrapeHomepageMeta("acme.com")).toBeNull();
  });

  it("defaults to https when no scheme is given", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(fakeResponse({ body: "<title>X</title>" }));
    vi.stubGlobal("fetch", fetchSpy);
    await scrapeHomepageMeta("acme.com");
    expect(fetchSpy).toHaveBeenCalledWith("https://acme.com/", expect.any(Object));
  });
});
