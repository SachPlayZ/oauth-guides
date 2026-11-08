// Deterministic probes (plain fetch, no LLM). Each result becomes a Tested Claim.

const TIMEOUT_MS = 5000;
const DISCOVERY_PATHS = ["/.well-known/openid-configuration", "/.well-known/oauth-authorization-server"];
const SUBDOMAINS = ["", "api.", "auth.", "login.", "accounts.", "oauth."];
const LOGIN_WALL = /\/(login|signin|sign-in|sign_in|auth|sso)\b/i;

export type DiscoveryProbe = {
  id: string;
  kind: "discovery";
  url: string;
  found: boolean;
  status: number | null;
  checkedAt: string;
  metadata?: {
    issuer?: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    registrationEndpoint?: string; // present → dynamic client registration
    pkceMethods?: string[];
    scopes?: string[];
  };
  snippet?: string; // first bytes of the raw response, kept as evidence
};

export type ReachabilityProbe = {
  id: string;
  kind: "reachability";
  url: string;
  status: number | null;
  finalUrl: string | null;
  loginWall: boolean;
  checkedAt: string;
};

export type Probe = DiscoveryProbe | ReachabilityProbe;

async function timedFetch(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function probeDiscoveryUrl(url: string): Promise<DiscoveryProbe> {
  const base = { id: `probe:${url}`, kind: "discovery" as const, url, checkedAt: new Date().toISOString() };
  try {
    const res = await timedFetch(url, { headers: { accept: "application/json" } });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (!res.ok || !json || typeof json.authorization_endpoint !== "string") {
      return { ...base, found: false, status: res.status };
    }
    const strs = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
    return {
      ...base,
      found: true,
      status: res.status,
      snippet: text.slice(0, 500),
      metadata: {
        issuer: json.issuer as string | undefined,
        authorizationEndpoint: json.authorization_endpoint as string,
        tokenEndpoint: json.token_endpoint as string | undefined,
        registrationEndpoint: json.registration_endpoint as string | undefined,
        pkceMethods: strs(json.code_challenge_methods_supported),
        scopes: strs(json.scopes_supported)?.slice(0, 50),
      },
    };
  } catch {
    return { ...base, found: false, status: null };
  }
}

/** OIDC / RFC 8414 discovery across the apex and common auth subdomains, plus any extra hosts. */
export async function probeDiscovery(domain: string, extraHosts: string[] = []): Promise<DiscoveryProbe[]> {
  const hosts = [...new Set([...SUBDOMAINS.map((s) => s + domain), ...extraHosts])];
  const urls = hosts.flatMap((h) => DISCOVERY_PATHS.map((p) => `https://${h}${p}`));
  const results = await Promise.all(urls.map(probeDiscoveryUrl));
  // Many providers serve one document on every subdomain; keep the first hit per issuer.
  const seen = new Set<string>();
  return results.filter((p) => {
    if (!p.found) return true;
    const key = p.metadata?.issuer ?? p.metadata?.authorizationEndpoint ?? p.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Is a docs or dev-portal page publicly readable, or does it redirect to a login wall? */
export async function probeReachable(url: string): Promise<ReachabilityProbe> {
  const base = { id: `probe:${url}`, kind: "reachability" as const, url, checkedAt: new Date().toISOString() };
  try {
    const res = await timedFetch(url, { method: "GET" });
    const finalUrl = res.url || url;
    const movedToLogin = finalUrl !== url && LOGIN_WALL.test(new URL(finalUrl).pathname);
    return { ...base, status: res.status, finalUrl, loginWall: movedToLogin || res.status === 401 };
  } catch {
    return { ...base, status: null, finalUrl: null, loginWall: false };
  }
}

export async function runProbes(domain: string, pages: string[] = []): Promise<Probe[]> {
  const [discovery, reach] = await Promise.all([probeDiscovery(domain), Promise.all(pages.map(probeReachable))]);
  return [...discovery, ...reach];
}

/** One-line summary for the event stream and Claim text. */
export function describeProbe(p: Probe): string {
  if (p.kind === "reachability") {
    if (p.status === null) return `${p.url} unreachable`;
    return p.loginWall ? `${p.url} redirects to a login wall (${p.finalUrl})` : `${p.url} is publicly readable (HTTP ${p.status})`;
  }
  if (!p.found) return `No OAuth discovery document at ${p.url}`;
  const m = p.metadata!;
  const bits = [`OAuth discovery found at ${p.url}`];
  if (m.pkceMethods?.length) bits.push(`PKCE: ${m.pkceMethods.join(", ")}`);
  bits.push(m.registrationEndpoint ? "dynamic client registration supported" : "no dynamic client registration endpoint");
  return bits.join("; ");
}
