import { formatLevel, LEVEL_LABEL, rowLevel } from "./rubric";
import type { Guide } from "./schema";

// Markdown export (PLAN §13): the Guide for humans, plus a block a browser Setup agent can follow.

const OWNER = { setup_agent: "🤖 Setup agent", setup_agent_drafts: "🤝 Agent drafts, you confirm", you: "👤 You" } as const;
const range = (r: { min: number; max: number; unit: string }) => (r.min === r.max ? `${r.min} ${r.unit}` : `${r.min}–${r.max} ${r.unit}`);
const cites = (ids: string[]) => (ids.length ? ` [${ids.join(", ")}]` : "");

export function checklist(guide: Guide): string {
  return guide.steps.map((s) => `- [ ] ${s.title} (${OWNER[s.owner]}${s.estMinutes ? `, ~${s.estMinutes} min` : ""})`).join("\n");
}

export function setupAgentBlock(guide: Guide): string {
  const agentSteps = guide.steps.filter((s) => s.owner !== "you");
  const stops = [...new Set(guide.steps.flatMap((s) => s.takeoverPoints))];
  const lines = [
    "## Instructions for your Setup agent",
    "",
    `You are helping a developer register an OAuth app with ${guide.productName}${guide.devPortalUrl ? ` at ${guide.devPortalUrl}` : ""}.`,
    "",
    "You may do these steps:",
    ...agentSteps.map((s) => `- ${s.title}${s.owner === "setup_agent_drafts" ? " (draft only; the human confirms)" : ""}${s.url ? ` — ${s.url}` : ""}`),
    "",
    `Callback / redirect URL: ${guide.composio ? guide.composio.callbackUrl : "the developer's own redirect URL"}. Paste it exactly.`,
    `Scopes to request: ${guide.usageRows.find((r) => r.id === guide.defaultUsageId)?.exampleScopes.join(", ") || "ask the developer"}.`,
    "",
    "STOP and hand back to the human for: sign-in, 2FA, CAPTCHA, payment, accepting terms, and the final submit.",
    ...stops.map((t) => `- STOP: ${t}`),
    "",
    "Never paste a client secret anywhere except the field that asks for it. Never share it in chat.",
  ];
  return lines.join("\n");
}

export function guideToMarkdown(guide: Guide, url?: string): string {
  const c = guide.verdict.computed;
  const def = guide.usageRows.find((r) => r.id === guide.defaultUsageId)!;
  const claimById = new Map(guide.claims.map((x) => [x.id, x]));
  const out: string[] = [
    `# ${guide.productName}: your own OAuth app`,
    "",
    `> ${guide.verdict.oneLiner}`,
    "",
    `- **Runway level:** ${c ? `${formatLevel(c.level, c.levelCeiling)} (${c.level === null ? "N/A" : LEVEL_LABEL[c.level]})` : "not computed"} for "${def.usage}"`,
    `- **Hands-on effort:** ${c ? range(c.handsOnEffort) : "?"}`,
    `- **Approval wait:** ${guide.verdict.approvalWait ? range(guide.verdict.approvalWait.range) : "Unknown"}`,
    `- **Confidence:** ${c?.confidence ?? "?"} · last checked ${c?.lastChecked.slice(0, 10) ?? "?"} · ${guide.meta.reviewStatus}`,
    ...(url ? [`- **Live guide:** ${url}`] : []),
    "",
    "## Usage rows",
    ...guide.usageRows.map((r) => {
      const l = rowLevel(r);
      return `- ${r.id === def.id ? "**" : ""}${r.usage}${r.id === def.id ? "** (default)" : ""}: ${formatLevel(l.level, l.levelCeiling)}${r.exampleScopes.length ? ` — scopes ${r.exampleScopes.join(", ")}` : ""}`;
    }),
    "",
    `## Why this level ("${def.usage}")`,
    "",
    "| Gate | Answer | Claims |",
    "|---|---|---|",
    ...def.gates.map((g) => `| ${g.key.replaceAll("_", " ")} | ${g.answer} | ${g.claimIds.join(", ")} |`),
    ...def.blockingLimits.map((b) => `| blocking limit: ${b.text} | yes | ${b.claimIds.join(", ")} |`),
  ];
  if (def.requirements.length || def.artifacts.length) {
    out.push("", "## Before you start", ...def.requirements.map((r) => `- ${r.label}${cites(r.claimIds)}`), ...def.artifacts.map((a) => `- Prepare: ${a.label} (~${a.estMinutes} min)${cites(a.claimIds)}`));
  }
  out.push("", "## Steps", "");
  for (const s of guide.steps) {
    out.push(`### ${s.title}`, `${OWNER[s.owner]} · ${s.phase}${s.estMinutes ? ` · ~${s.estMinutes} min` : ""}${s.url ? ` · ${s.url}` : ""}`, "", s.detail + cites(s.claimIds));
    for (const t of s.takeoverPoints) out.push(`- ✋ Takeover: ${t}`);
    for (const b of s.blockers) out.push(`- ⚠️ ${b.text} → ${b.workaround}`);
    out.push("");
  }
  if (guide.whileYouWait.length) out.push("## While you wait", ...guide.whileYouWait.map((w) => `- ${w.text}${cites(w.claimIds)}`), "");
  if (guide.gotchas.length) out.push("## Gotchas", ...guide.gotchas.map((g) => `- **${g.severity}:** ${g.text}${cites(g.claimIds)}`), "");
  if (guide.unknowns.length) out.push("## What we couldn't verify", ...guide.unknowns.map((u) => `- ${u}`), "");
  out.push("## Checklist", "", checklist(guide), "", setupAgentBlock(guide), "", "## Evidence", "");
  for (const id of [...claimById.keys()]) {
    const x = claimById.get(id)!;
    out.push(`- **${x.id}** (${x.evidence}${x.verifier.status !== "not_checked" ? `, ${x.verifier.status}` : ""}) ${x.text}${x.sources[0] ? ` — ${x.sources[0].url}` : ""}`);
  }
  return `${out.join("\n")}\n`;
}
