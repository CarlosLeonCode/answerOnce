/** Text normalization helpers shared by matchers. Pure functions. */

/** Lowercases, strips accents/punctuation, removes "required" markers, collapses spaces. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((required|optional|obligatorio|opcional)\)/g, ' ')
    .replace(/[*✱]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Splits identifiers like `job_application[first_name]` or `firstName` into words. */
export function identifierToWords(input: string): string {
  return normalize(input.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-[\].]+/g, ' '));
}

export function tokens(input: string): string[] {
  return normalize(input).split(' ').filter(Boolean);
}

/** True when `phrase` appears in `text` as a whole-word sequence (both normalized). */
export function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

const STOPWORDS = new Set([
  // EN
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'you', 'your', 'are', 'is', 'do',
  'does', 'have', 'has', 'with', 'what', 'please', 'this', 'that', 'at', 'be', 'we', 'our', 'us',
  'any', 'if', 'as', 'by', 'from', 'it', 'will', 'would',
  // ES
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'o', 'tu', 'su', 'es', 'que',
  'por', 'para', 'con', 'al', 'se', 'te', 'usted', 'nos', 'favor',
]);

export function contentTokens(input: string): string[] {
  return tokens(input).filter((t) => !STOPWORDS.has(t));
}

function bigrams(s: string): string[] {
  const compact = s.replace(/\s+/g, ' ');
  const out: string[] = [];
  for (let i = 0; i < compact.length - 1; i++) out.push(compact.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice coefficient over character bigrams, in [0, 1]. */
export function diceSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  if (ba.length === 0 || bb.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of ba) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of bb) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      counts.set(g, c - 1);
    }
  }
  return (2 * overlap) / (ba.length + bb.length);
}

/** Jaccard similarity over content tokens (stopwords removed), in [0, 1]. */
export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(contentTokens(a));
  const tb = new Set(contentTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
