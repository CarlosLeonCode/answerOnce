import type { Profile } from './profile';

/**
 * Three-way merge of an unsaved draft onto a newer saved version (written by
 * an agent or another window), per top-level profile section.
 *
 * - Sections the user did not touch take the newer saved value.
 * - Sections only the user changed keep the user's edits.
 * - Sections both changed are conflicts: `mine` keeps the user's edits,
 *   `theirs` keeps the saved version, so the UI can let the user choose.
 */

/** Sections managed outside the draft (never edited in the profile form). */
const ALWAYS_THEIRS: readonly (keyof Profile)[] = ['agentProposals', 'agents', 'documents', 'defaultResumeId'];

export interface RebaseResult {
  /** Draft with the user's edits re-applied (user wins on conflicts). */
  mine: Profile;
  /** Draft with the saved version for conflicting sections. */
  theirs: Profile;
  conflicts: (keyof Profile)[];
  /** True when the user still has edits on top of the new version. */
  dirty: boolean;
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function rebaseDraft(base: Profile, draft: Profile, incoming: Profile): RebaseResult {
  const mine: Record<string, unknown> = { ...incoming };
  const theirs: Record<string, unknown> = { ...incoming };
  const conflicts: (keyof Profile)[] = [];
  let dirty = false;
  for (const key of Object.keys(incoming) as (keyof Profile)[]) {
    if (ALWAYS_THEIRS.includes(key)) continue;
    const userChanged = !equal(base[key], draft[key]);
    if (!userChanged) continue;
    const vaultChanged = !equal(base[key], incoming[key]);
    if (vaultChanged && !equal(draft[key], incoming[key])) conflicts.push(key);
    mine[key] = draft[key];
    if (!vaultChanged) theirs[key] = draft[key];
    if (!equal(draft[key], incoming[key])) dirty = true;
  }
  return { mine: mine as Profile, theirs: theirs as Profile, conflicts, dirty };
}

const SECTION_LABELS: Partial<Record<keyof Profile, string>> = {
  personal: 'Personal',
  links: 'Links',
  headline: 'Headline',
  summary: 'Summary',
  skills: 'Skills',
  workAuthorization: 'Work authorization',
  preferences: 'Preferences',
  experience: 'Experience',
  education: 'Education',
  savedAnswers: 'Saved answers',
  ai: 'AI provider',
  agentSetup: 'AI agent setup',
};

export function sectionLabel(key: keyof Profile): string {
  return SECTION_LABELS[key] ?? String(key);
}
