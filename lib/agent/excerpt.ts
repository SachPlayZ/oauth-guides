// Pick the parts of a page that matter for a focus query, so the model reads ~2K chars, not 50K.

const STOP = new Set(["the", "and", "for", "with", "how", "what", "does", "are", "you", "your", "app", "apps", "can", "from", "that", "this", "into", "need"]);

const terms = (s: string) =>
  [...new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter((t) => !STOP.has(t));

/** Highest-scoring blocks (by focus-term hits), up to maxChars, kept in page order. */
export function excerpt(text: string, focus: string, maxChars = 2_000): string {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 20);
  if (!blocks.length) return "";
  const want = terms(focus);
  const scored = blocks.map((b, i) => {
    const lower = b.toLowerCase();
    const hits = want.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
    return { i, b: b.length > 800 ? `${b.slice(0, 800)}…` : b, hits };
  });
  const picked: typeof scored = [];
  let used = 0;
  for (const s of [...scored].sort((x, y) => y.hits - x.hits || x.i - y.i)) {
    if (want.length && s.hits === 0 && picked.length) break;
    if (used + s.b.length > maxChars) continue;
    picked.push(s);
    used += s.b.length + 2;
  }
  return picked.sort((x, y) => x.i - y.i).map((s) => s.b).join("\n\n");
}
