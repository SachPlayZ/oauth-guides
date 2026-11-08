// Composio Toolkits API (v3.1). Server-side only; facts from here count as Documented.

const BASE = "https://backend.composio.dev/api/v3.1";

export type ToolkitSummary = {
  slug: string;
  name: string;
  appUrl: string | null;
  logo: string | null;
  description: string;
  authSchemes: string[];
  managedAuthAvailable: boolean;
  authGuideUrl: string | null;
};

export type ToolkitDetail = ToolkitSummary & { authModes: string[] };

type RawToolkit = {
  slug: string;
  name: string;
  auth_schemes?: string[];
  composio_managed_auth_schemes?: string[];
  auth_guide_url?: string | null;
  auth_config_details?: { mode: string }[];
  meta?: { app_url?: string | null; logo?: string; description?: string };
};

export const hasComposioKey = () => Boolean(process.env.COMPOSIO_API_KEY);

async function composioGet<T>(path: string): Promise<T> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY is not set");
  const res = await fetch(`${BASE}${path}`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Composio ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function summarize(t: RawToolkit): ToolkitSummary {
  return {
    slug: t.slug,
    name: t.name,
    appUrl: t.meta?.app_url ?? null,
    logo: t.meta?.logo ?? null,
    description: t.meta?.description ?? "",
    // The detail endpoint omits auth_schemes; its modes live in auth_config_details.
    authSchemes: t.auth_schemes ?? (t.auth_config_details ?? []).map((d) => d.mode),
    managedAuthAvailable: (t.composio_managed_auth_schemes ?? []).length > 0,
    authGuideUrl: t.auth_guide_url ?? null,
  };
}

export const isOAuthScheme = (s: string) => /^OAUTH/i.test(s);

export async function searchToolkits(query: string, limit = 10): Promise<ToolkitSummary[]> {
  const q = new URLSearchParams({ search: query, limit: String(limit) });
  const data = await composioGet<{ items: RawToolkit[] }>(`/toolkits?${q}`);
  return data.items.map(summarize);
}

export async function getToolkit(slug: string): Promise<ToolkitDetail> {
  const t = await composioGet<RawToolkit>(`/toolkits/${encodeURIComponent(slug)}`);
  return { ...summarize(t), authModes: (t.auth_config_details ?? []).map((d) => d.mode) };
}

/** Pages through the toolkit list, most-used first. Used by the library seed script. */
export async function listToolkitsByUsage(max: number): Promise<ToolkitSummary[]> {
  const out: ToolkitSummary[] = [];
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams({ sort_by: "usage", limit: "200" });
    if (cursor) q.set("cursor", cursor);
    const page: { items: RawToolkit[]; next_cursor: string | null } = await composioGet(`/toolkits?${q}`);
    out.push(...page.items.map(summarize));
    cursor = page.next_cursor;
  } while (cursor && out.length < max * 3);
  return out;
}
