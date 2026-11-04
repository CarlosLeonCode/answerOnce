import { containsPhrase, diceSimilarity, normalize } from './text';

/**
 * Picks the option text that best matches the candidates. Candidates are tried
 * in order; exact (normalized) matches win, then prefix/contains, then fuzzy.
 */
export function pickOption(options: string[], candidates: string[]): string | null {
  const norm = options.map((o) => ({ raw: o, n: normalize(o) })).filter((o) => o.n);
  for (const c of candidates) {
    const nc = normalize(c);
    if (!nc) continue;
    const exact = norm.find((o) => o.n === nc);
    if (exact) return exact.raw;
  }
  for (const c of candidates) {
    const nc = normalize(c);
    if (!nc) continue;
    const partial = norm.find((o) => o.n.startsWith(`${nc} `) || containsPhrase(o.n, nc));
    if (partial) return partial.raw;
  }
  let best: { raw: string; score: number } | null = null;
  for (const c of candidates) {
    for (const o of norm) {
      const score = diceSimilarity(o.n, c);
      if (score >= 0.8 && (!best || score > best.score)) best = { raw: o.raw, score };
    }
  }
  return best?.raw ?? null;
}
