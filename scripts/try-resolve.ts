// Manual check for Stage 0–2: pnpm tsx scripts/try-resolve.ts "<query>" [--probe domain]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { resolve } = await import("../lib/agent/resolve");
  const { runProbes, describeProbe } = await import("../lib/probes");
  const args = process.argv.slice(2);
  const probeAt = args.indexOf("--probe");
  if (probeAt >= 0) {
    const probes = await runProbes(args[probeAt + 1], args.slice(probeAt + 2));
    for (const p of probes) if (p.kind === "reachability" || p.found) console.log(describeProbe(p));
    if (!probes.some((p) => p.kind === "discovery" && p.found)) console.log(`No OAuth discovery document on ${args[probeAt + 1]} or its auth subdomains`);
    return;
  }
  console.log(JSON.stringify(await resolve(args.join(" ")), null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
