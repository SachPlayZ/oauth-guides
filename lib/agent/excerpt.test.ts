import { describe, expect, it } from "vitest";
import { excerpt } from "./excerpt";

const page = [
  "# Welcome to the platform docs, read on for details",
  "Our pricing page lists plans for teams of every size and shape.",
  "Redirect URIs must use HTTPS. Localhost is allowed for development only.",
  "Apps requesting restricted scopes need verification before launch.",
  "Contact sales for enterprise questions about anything at all.",
].join("\n\n");

describe("excerpt", () => {
  it("keeps matching blocks in page order and drops the rest", () => {
    const out = excerpt(page, "redirect https scopes verification");
    expect(out).toBe(
      "Redirect URIs must use HTTPS. Localhost is allowed for development only.\n\nApps requesting restricted scopes need verification before launch.",
    );
  });

  it("respects the size cap", () => {
    expect(excerpt(page, "redirect scopes", 80)).toBe("Redirect URIs must use HTTPS. Localhost is allowed for development only.");
  });

  it("returns empty for empty text", () => {
    expect(excerpt("", "anything")).toBe("");
  });
});
