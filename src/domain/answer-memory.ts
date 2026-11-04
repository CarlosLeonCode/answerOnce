import type { SavedAnswer } from './profile';
import { diceSimilarity, normalize, tokenJaccard } from './text';

/** Minimum similarity for a saved answer to be reused automatically. */
export const MEMORY_THRESHOLD = 0.72;

export interface MemoryHit {
  answer: SavedAnswer;
  score: number;
}

/** Similarity between a field label and a saved answer label, in [0, 1]. */
export function labelSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return Math.max(diceSimilarity(na, nb), tokenJaccard(na, nb));
}

/** Returns the best saved answer for a question label, if similar enough. */
export function findSavedAnswer(
  label: string,
  answers: readonly SavedAnswer[],
  threshold = MEMORY_THRESHOLD,
): MemoryHit | null {
  let best: MemoryHit | null = null;
  for (const answer of answers) {
    const score = labelSimilarity(label, answer.label);
    if (score >= threshold && (!best || score > best.score)) best = { answer, score };
  }
  return best;
}

/** Inserts or updates (by similar label) a saved answer. Returns a new array. */
export function upsertAnswer(
  answers: readonly SavedAnswer[],
  label: string,
  answer: string,
  id: string,
  now: string,
): SavedAnswer[] {
  const existing = answers.find((a) => normalize(a.label) === normalize(label));
  if (existing) {
    return answers.map((a) => (a.id === existing.id ? { ...a, label, answer, updatedAt: now } : a));
  }
  return [...answers, { id, label, answer, updatedAt: now }];
}
