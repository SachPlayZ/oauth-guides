// Web search and page reading via Tavily (ADR-0004). Free plan: 1,000 credits/month.
// search = 1 credit (basic); extract = 1 credit per 5 successful URLs.

const BASE = "https://api.tavily.com";

export type SearchResult = { title: string; url: string; content: string; score: number; publishedDate: string | null };
export type PageText = { url: string; text: string };

async function tavily<T>(path: string, body: object, timeoutMs = 30_000): Promise<T> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Tavily ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export async function webSearch(query: string, opts: { maxResults?: number; includeDomains?: string[] } = {}) {
  const data = await tavily<{
    results: { title: string; url: string; content: string; score: number; published_date?: string | null }[];
  }>("/search", {
    query,
    search_depth: "basic",
    max_results: opts.maxResults ?? 6,
    include_published_date: true,
    ...(opts.includeDomains?.length ? { include_domains: opts.includeDomains } : {}),
  });
  return data.results.map<SearchResult>((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
    publishedDate: r.published_date ?? null,
  }));
}

/** Full page text (markdown) for up to 20 URLs. Failed URLs are returned separately, never thrown. */
export async function readPages(urls: string[]): Promise<{ pages: PageText[]; failed: { url: string; error: string }[] }> {
  if (!urls.length) return { pages: [], failed: [] };
  const data = await tavily<{
    results: { url: string; raw_content: string }[];
    failed_results: { url: string; error: string }[];
  }>("/extract", { urls: urls.slice(0, 20), extract_depth: "basic", format: "markdown" }, 60_000);
  return {
    pages: data.results.map((r) => ({ url: r.url, text: r.raw_content ?? "" })),
    failed: data.failed_results ?? [],
  };
}
