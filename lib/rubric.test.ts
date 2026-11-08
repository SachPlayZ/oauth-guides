import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeGuide, formatLevel, rowLevel } from "./rubric";
import { GATE_KEYS, Guide, type Claim, type UsageRow } from "./schema";

const github = Guide.parse(JSON.parse(readFileSync(join(__dirname, "../data/curated/github.json"), "utf8")));

const claim = (id: string, over: Partial<Claim> = {}): Claim => ({
  id,
  text: id,
  evidence: "documented",
  sources: [{ url: "https://example.com", quote: "q", official: true, retrievedAt: "2026-11-09" }],
  verifier: { status: "supported" },
  checkedAt: "2026-11-09",
  ...over,
});

/** A Usage row answering every Gate "no" (citing c0) except the overrides. */
const row = (id: string, over: Partial<Record<(typeof GATE_KEYS)[number], "yes" | "unknown">> = {}, extra: Partial<UsageRow> = {}): UsageRow => ({
  id,
  usage: id,
  exampleScopes: [],
  gates: GATE_KEYS.map((key) => ({ key, answer: over[key] ?? "no", claimIds: over[key] === "unknown" ? [] : ["c0"] })),
  requirements: [],
  blockingLimits: [],
  artifacts: [],
  notes: "",
  ...extra,
});

const guide = (rows: UsageRow[], claims: Claim[] = [claim("c0")]) =>
  Guide.parse({ ...github, usageRows: rows, defaultUsageId: rows[0].id, preApprovalLimits: [], steps: github.steps.map((s) => ({ ...s, claimIds: [] })), whileYouWait: [], gotchas: [], oauth: { ...github.oauth, claimIds: [] }, composio: null, claims });

describe("curated GitHub guide", () => {
  const g = computeGuide(github);
  it("validates and has sign-in at R0", () => {
    expect(g.usageRows.find((r) => r.id === "signin")!.level).toBe(0);
  });
  it("default (org repos) is R1 from the org admin-consent requirement", () => {
    expect(g.verdict.computed!.level).toBe(1);
    expect(formatLevel(g.verdict.computed!.level, g.verdict.computed!.levelCeiling)).toBe("R1");
  });
  it("is low confidence while 'no review' is unverified", () => {
    expect(g.verdict.computed!.confidence).toBe("low");
  });
  it("sums step estimates into effort and starts at the first step you own", () => {
    expect(g.verdict.computed!.handsOnEffort).toEqual({ min: 25, max: 38, unit: "minutes" });
    expect(g.verdict.computed!.startHereStepId).toBe("s3");
  });
});

describe("rowLevel", () => {
  it("Gmail read: security assessment → R4", () => {
    expect(rowLevel(row("read", { security_assessment: "yes", scope_verification: "yes" }))).toEqual({ level: 4, levelCeiling: 4 });
  });
  it("Slack history: a Blocking limit → R2", () => {
    const r = row("history", {}, { blockingLimits: [{ text: "1 req/min on conversations.history", claimIds: ["c0"] }] });
    expect(rowLevel(r).level).toBe(2);
  });
  it("partner program → R5", () => {
    expect(rowLevel(row("x", { partner_application: "yes" })).level).toBe(5);
  });
  it("unknown gate above the level → range", () => {
    const r = rowLevel(row("x", { security_assessment: "unknown" }, { requirements: [{ key: "https_redirect", label: "", claimIds: ["c0"] }] }));
    expect(r).toEqual({ level: 1, levelCeiling: 4 });
    expect(formatLevel(r.level, r.levelCeiling)).toBe("R1–R4?");
  });
});

describe("confidence", () => {
  it("high when every verdict-relevant Claim is documented and supported", () => {
    expect(computeGuide(guide([row("a")])).verdict.computed!.confidence).toBe("high");
  });
  it("low when a gate is unknown", () => {
    expect(computeGuide(guide([row("a", { min_installs: "unknown" })])).verdict.computed!.confidence).toBe("low");
  });
  it("medium when a verdict-relevant Claim is only Reported", () => {
    expect(computeGuide(guide([row("a")], [claim("c0", { evidence: "reported" })])).verdict.computed!.confidence).toBe("medium");
  });
  it("low when a Claim conflicts", () => {
    expect(computeGuide(guide([row("a")], [claim("c0", { verifier: { status: "conflicting" } })])).verdict.computed!.confidence).toBe("low");
  });
});

describe("schema guards", () => {
  it("rejects a row missing a Gate answer", () => {
    const r = row("a");
    expect(() => guide([{ ...r, gates: r.gates.slice(1) }])).toThrow(/answered 0 times/);
  });
  it("rejects a yes/no answer without a Claim", () => {
    const r = row("a");
    expect(() => guide([{ ...r, gates: r.gates.map((g) => ({ ...g, claimIds: [] })) }])).toThrow(/must cite a Claim/);
  });
  it("rejects references to unknown Claims", () => {
    expect(() => guide([row("a")], [claim("c1")])).toThrow(/unknown Claim id \\"c0\\"/);
  });
});
