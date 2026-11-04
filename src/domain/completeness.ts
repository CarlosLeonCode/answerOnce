import { defaultResume, type Profile } from './profile';

/** Where in the profile editor a missing item can be completed. */
export type ProfileArea = 'personal' | 'links' | 'about' | 'experience' | 'education' | 'work' | 'preferences' | 'documents';

export interface CompletenessItem {
  id: string;
  label: string;
  area: ProfileArea;
  done: boolean;
  /** Relative importance for the percentage. */
  weight: number;
}

export interface Completeness {
  percent: number;
  items: CompletenessItem[];
  missing: CompletenessItem[];
}

/** Key fields most application forms ask for. */
export function profileCompleteness(profile: Profile): Completeness {
  const p = profile.personal;
  const items: CompletenessItem[] = [
    { id: 'name', label: 'Full name', area: 'personal', done: Boolean(p.firstName && p.lastName), weight: 3 },
    { id: 'email', label: 'Email', area: 'personal', done: Boolean(p.email), weight: 3 },
    { id: 'phone', label: 'Phone', area: 'personal', done: Boolean(p.phone), weight: 2 },
    { id: 'location', label: 'Location', area: 'personal', done: Boolean(p.location || p.city || p.country), weight: 2 },
    { id: 'linkedin', label: 'LinkedIn profile', area: 'links', done: Boolean(profile.links.linkedin), weight: 1 },
    { id: 'headline', label: 'Headline', area: 'about', done: Boolean(profile.headline), weight: 1 },
    { id: 'skills', label: 'Skills', area: 'about', done: profile.skills.length > 0, weight: 1 },
    { id: 'experience', label: 'Work experience', area: 'experience', done: profile.experience.length > 0, weight: 3 },
    { id: 'education', label: 'Education', area: 'education', done: profile.education.length > 0, weight: 2 },
    {
      id: 'authorization',
      label: 'Work authorization',
      area: 'work',
      done: profile.workAuthorization.countriesAuthorized.length > 0 || profile.workAuthorization.needsSponsorship !== null,
      weight: 2,
    },
    { id: 'resume', label: 'CV / resume file', area: 'documents', done: Boolean(defaultResume(profile)), weight: 3 },
  ];
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  const done = items.filter((i) => i.done).reduce((sum, i) => sum + i.weight, 0);
  return { percent: Math.round((done / total) * 100), items, missing: items.filter((i) => !i.done) };
}

/** True when nothing meaningful has been entered yet (fresh profile). */
export function isProfileEmpty(profile: Profile): boolean {
  const p = profile.personal;
  return !p.firstName && !p.lastName && !p.email && profile.experience.length === 0 && profile.education.length === 0 && profile.documents.length === 0;
}
