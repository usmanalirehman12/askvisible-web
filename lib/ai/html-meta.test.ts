import { describe, expect, it } from "vitest";
import { decodeHtml, metaTag, pageTitle } from "./html-meta";

describe("decodeHtml", () => {
  it("decodes common HTML entities", () => {
    expect(decodeHtml("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeHtml("&quot;quoted&quot;")).toBe('"quoted"');
    expect(decodeHtml("it&#39;s")).toBe("it's");
  });

  it("strips HTML tags", () => {
    expect(decodeHtml("<b>bold</b> text")).toBe("bold text");
  });

  it("collapses whitespace and trims", () => {
    expect(decodeHtml("  a   b\n\tc  ")).toBe("a b c");
  });

  it("returns empty string for empty input", () => {
    expect(decodeHtml("")).toBe("");
  });
});

describe("metaTag", () => {
  it("finds a tag by name attribute", () => {
    const html = `<meta name="description" content="A great site">`;
    expect(metaTag(html, "description")).toBe("A great site");
  });

  it("finds a tag by property attribute (og: tags)", () => {
    const html = `<meta property="og:description" content="OG desc">`;
    expect(metaTag(html, "og:description")).toBe("OG desc");
  });

  it("matches keys case-insensitively", () => {
    const html = `<meta NAME="Description" CONTENT="Cased">`;
    expect(metaTag(html, "description")).toBe("Cased");
  });

  it("decodes entities in the content attribute", () => {
    const html = `<meta name="description" content="Fish &amp; Chips">`;
    expect(metaTag(html, "description")).toBe("Fish & Chips");
  });

  it("returns empty string when the tag is missing", () => {
    expect(metaTag("<html><head></head></html>", "description")).toBe("");
  });

  it("ignores tags with a different key", () => {
    const html = `<meta name="keywords" content="a,b,c">`;
    expect(metaTag(html, "description")).toBe("");
  });
});

describe("pageTitle", () => {
  it("extracts the title tag contents", () => {
    expect(pageTitle("<title>My Page</title>")).toBe("My Page");
  });

  it("decodes entities in the title", () => {
    expect(pageTitle("<title>Sales &amp; Support</title>")).toBe("Sales & Support");
  });

  it("returns empty string when there is no title tag", () => {
    expect(pageTitle("<html><body>no title</body></html>")).toBe("");
  });

  it("handles multiline title content", () => {
    expect(pageTitle("<title>\n  Line1\n  Line2\n</title>")).toBe("Line1 Line2");
  });
});
