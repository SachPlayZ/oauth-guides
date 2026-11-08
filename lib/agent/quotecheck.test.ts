import { describe, expect, it } from "vitest";
import { checkQuote, quoteMatches } from "./quotecheck";

const page = "## Review\n\nWe require that apps submitting to the **Slack Marketplace** have at least 10 installations on [active workspaces](https://x.y).";

describe("quote check", () => {
  it("matches across markdown, case and curly quotes", () => {
    expect(quoteMatches("apps submitting to the Slack Marketplace have at least 10 installations on active workspaces", page)).toBe(true);
    expect(quoteMatches("We’re fine", "we're fine")).toBe(true);
  });

  it("tolerates one changed word in a long quote", () => {
    expect(quoteMatches("we require that apps submitting to the slack marketplace have at least ten installations on active workspaces", page)).toBe(false);
    const long = "we require that apps submitting to the slack marketplace have at least 10 installations on active workspaces today";
    expect(quoteMatches(long, page)).toBe(true);
  });

  it("rejects a paraphrase", () => {
    expect(quoteMatches("Slack needs ten installs before listing", page)).toBe(false);
  });

  it("returns null with no text to check", () => {
    expect(checkQuote("x", "https://a", [new Map()])).toBeNull();
    expect(checkQuote("x", null, [new Map()])).toBeNull();
  });
});
