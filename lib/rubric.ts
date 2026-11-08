import type { Claim, Computed, Guide, UsageRow } from "./schema";
import { z } from "zod";
import { GateKey, Range } from "./schema";

// Runway level, derived in code from Gate answers (ADR-0001). Highest wins.
export const GATE_LEVEL: Record<z.infer<typeof GateKey>, number> = {
  partner_application: 5,
  manual_approval_uncertain: 5,
  security_assessment: 4,
  business_verification: 3,
  publisher_verification: 3,
  domain_verification: 3,
  scope_verification: 3,
  production_access_review: 2,
  min_installs: 2,
};
const BLOCKING_LIMIT_LEVEL = 2;
const REQUIREMENT_LEVEL = 1;

export const LEVEL_LABEL = ["Instant", "Self-serve with limits", "Review", "Verification", "Security assessment", "Gated"];

export function rowLevel(row: UsageRow): { level: number; levelCeiling: number } {
  let level = 0;
  let ceiling = 0;
  for (const g of row.gates) {
    if (g.answer === "yes") level = Math.max(level, GATE_LEVEL[g.key]);
    if (g.answer === "unknown") ceiling = Math.max(ceiling, GATE_LEVEL[g.key]);
  }
  if (row.blockingLimits.length) level = Math.max(level, BLOCKING_LIMIT_LEVEL);
  if (row.requirements.length) level = Math.max(level, REQUIREMENT_LEVEL);
  return { level, levelCeiling: Math.max(level, ceiling) };
}

/** "R4" or "R1–R4?" when unknown Gate answers could push the level higher. */
export function formatLevel(level: number | null, ceiling: number | null): string {
  if (level === null) return "N/A";
  return ceiling === null || ceiling === level ? `R${level}` : `R${level}–R${ceiling}?`;
}

/** Claims cited by the Gate answers of the Default Usage row (the oauth Claims when OAuth is unsupported). */
export function verdictRelevantClaims(guide: Guide): Claim[] {
  const ids = new Set<string>();
  if (!guide.oauth.supported) guide.oauth.claimIds.forEach((id) => ids.add(id));
  else defaultRow(guide).gates.forEach((g) => g.claimIds.forEach((id) => ids.add(id)));
  return guide.claims.filter((c) => ids.has(c.id));
}

export function confidence(guide: Guide): Computed["confidence"] {
  const hasUnknownGate = guide.oauth.supported && defaultRow(guide).gates.some((g) => g.answer === "unknown");
  const claims = verdictRelevantClaims(guide);
  const weak = claims.some(
    (c) => c.evidence === "unverified" || c.verifier.status === "conflicting" || c.verifier.status === "unsupported",
  );
  if (hasUnknownGate || weak || claims.length === 0) return "low";
  const strong = claims.every(
    (c) => (c.evidence === "tested" || c.evidence === "documented") && c.verifier.status === "supported",
  );
  return strong ? "high" : "medium";
}

/** Sum of step estimates (excluding the wait) plus the Default Usage row's Review artifacts. */
export function handsOnEffort(guide: Guide): z.infer<typeof Range> {
  const steps = guide.steps.filter((s) => s.phase !== "wait").reduce((n, s) => n + (s.estMinutes ?? 0), 0);
  const artifacts = guide.oauth.supported ? defaultRow(guide).artifacts.reduce((n, a) => n + a.estMinutes, 0) : 0;
  const min = steps + artifacts;
  const max = Math.round(min * 1.5);
  if (max <= 120) return { min, max, unit: "minutes" };
  const toHours = (m: number) => Math.round((m / 60) * 2) / 2;
  return { min: toHours(min), max: toHours(max), unit: "hours" };
}

export function computeGuide(guide: Guide): Guide {
  const usageRows = guide.usageRows.map((r) => ({ ...r, ...rowLevel(r) }));
  const withRows = { ...guide, usageRows };
  const def = guide.oauth.supported ? usageRows.find((r) => r.id === guide.defaultUsageId)! : null;

  const relevant = verdictRelevantClaims(withRows);
  const dates = (relevant.length ? relevant : guide.claims).map((c) => c.checkedAt).sort();

  const computed: Computed = {
    level: def ? def.level : null,
    levelCeiling: def ? def.levelCeiling : null,
    handsOnEffort: handsOnEffort(withRows),
    confidence: confidence(withRows),
    lastChecked: dates[0] ?? guide.meta.generatedAt,
    startHereStepId: guide.steps.find((s) => s.owner === "you")?.id ?? guide.steps[0]?.id ?? null,
  };
  return { ...withRows, verdict: { ...guide.verdict, computed } };
}

function defaultRow(guide: Guide): UsageRow {
  const row = guide.usageRows.find((r) => r.id === guide.defaultUsageId);
  if (!row) throw new Error(`defaultUsageId "${guide.defaultUsageId}" matches no Usage row`);
  return row;
}
