// Stage 4: does the quote appear on the page? Exact after normalizing, else ≥ 90% of its word
// pairs appear on the page (tolerates markdown, line breaks and small edits).

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑–—]/g, "-")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown links → text
    .replace(/[*_#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (s: string) => normalize(s).match(/[a-z0-9']+/g) ?? [];

export function quoteMatches(quote: string, page: string, threshold = 0.9): boolean {
  const q = normalize(quote);
  if (!q) return false;
  const p = normalize(page);
  if (p.includes(q)) return true;
  const qw = words(quote);
  if (qw.length < 4) return false;
  const pw = words(page);
  const pairs = new Set(pw.slice(1).map((w, i) => `${pw[i]} ${w}`));
  const qPairs = qw.slice(1).map((w, i) => `${qw[i]} ${w}`);
  return qPairs.filter((x) => pairs.has(x)).length / qPairs.length >= threshold;
}

/** true/false when we have the page or snippet text; null when there's nothing to check against. */
export function checkQuote(quote: string, url: string | null, texts: Map<string, string>[]): boolean | null {
  if (!url) return null;
  const found = texts.map((t) => t.get(url)).filter((t): t is string => !!t);
  if (!found.length) return null;
  return found.some((t) => quoteMatches(quote, t));
}
