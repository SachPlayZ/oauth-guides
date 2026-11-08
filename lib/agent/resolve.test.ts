import { describe, expect, it } from "vitest";
import type { ToolkitSummary } from "../composio";
import { matchToolkits, registrableDomain } from "./resolve";

const tk = (slug: string, name: string, appUrl: string | null = null): ToolkitSummary => ({
  slug, name, appUrl, logo: null, description: "", authSchemes: ["OAUTH2"], managedAuthAvailable: true, authGuideUrl: null,
});
const items = [
  tk("gmail", "Gmail", "https://mail.google.com"),
  tk("googledrive", "Google Drive", "https://drive.google.com"),
  tk("googlecalendar", "Google Calendar", "https://calendar.google.com"),
  tk("box", "Box", "https://www.box.com"),
  tk("linear", "Linear", "https://linear.app"),
];

describe("registrableDomain", () => {
  it.each([
    ["https://linear.app", "linear.app"],
    ["notion.so", "notion.so"],
    ["https://www.app.example.co.uk/path", "example.co.uk"],
    ["Box", null],
    ["Google Drive", null],
  ])("%s → %s", (input, out) => expect(registrableDomain(input)).toBe(out));
});

describe("matchToolkits", () => {
  it("exact name resolves", () => {
    const r = matchToolkits("Box", items);
    expect(r).toMatchObject({ kind: "resolved", product: { toolkitSlug: "box" } });
  });
  it("URL resolves via slug or app_url domain", () => {
    expect(matchToolkits("https://linear.app", items)).toMatchObject({ kind: "resolved", product: { slug: "linear" } });
  });
  it("vague name → candidates, never a guess", () => {
    const r = matchToolkits("google", items);
    expect(r?.kind).toBe("candidates");
    if (r?.kind === "candidates") expect(r.candidates.map((c) => c.slug)).toEqual(["googledrive", "googlecalendar"]);
  });
  it("no match → null (falls through to web)", () => {
    expect(matchToolkits("asdfgh", items)).toBeNull();
  });
});
