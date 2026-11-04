/**
 * Company and role of a job page, for the application record. Pure helpers:
 * the page agent collects plain text (PageMeta) and ATS adapters interpret it.
 */

export interface PageMeta {
  /** document.title */
  title: string;
  /** <meta property="og:title"> */
  ogTitle: string;
  /** <meta property="og:site_name"> */
  ogSiteName: string;
  /** Text of the first visible <h1>. */
  h1: string;
  /** Text of well-known ATS job header elements, by CSS selector (see JOB_META_SELECTORS). */
  marks: Record<string, string>;
}

export interface JobMeta {
  company: string;
  role: string;
}

export const EMPTY_PAGE_META: PageMeta = { title: '', ogTitle: '', ogSiteName: '', h1: '', marks: {} };

/** Job header elements of the supported ATS boards, read by the page agent. */
export const JOB_META_SELECTORS = [
  // Greenhouse (classic and new boards)
  '.app-title',
  '.company-name',
  '.job__title h1',
  // Lever
  '.posting-headline h2',
  // Ashby
  '.ashby-job-posting-heading',
] as const;

const MAX = 200;

export function cleanMeta(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX);
}

const GENERIC_ROLE = /^(apply( now)?|job application|application( form)?|careers?|jobs?|home|solicitud|empleo|trabaja con nosotros)$/i;

export function cleanRole(text: string): string {
  const t = cleanMeta(text).replace(/^(job application for|apply for|application for|apply:|apply to)\s+/i, '');
  return GENERIC_ROLE.test(t) ? '' : t;
}

export function cleanCompany(text: string): string {
  const t = cleanMeta(text).replace(/^(at|@|en)\s+/i, '').replace(/\s+(careers|jobs|job board|hiring)$/i, '');
  return GENERIC_ROLE.test(t) ? '' : t;
}

/** "Senior Engineer at Acme", "Senior Engineer @ Acme", "Job Application for X at Y". */
export function roleAtCompany(title: string): JobMeta | null {
  const match = /^(.+?)\s+(?:at|@)\s+([^|–—]+?)(?:\s*[|–—].*)?$/i.exec(cleanMeta(title));
  if (!match) return null;
  const meta = { role: cleanRole(match[1]!), company: cleanCompany(match[2]!) };
  return meta.role && meta.company ? meta : null;
}

/** "Acme - Senior Engineer" (Lever's page title). */
export function companyDashRole(title: string): JobMeta | null {
  const match = /^(.+?)\s+[-–—]\s+(.+)$/.exec(cleanMeta(title));
  if (!match) return null;
  const meta = { company: cleanCompany(match[1]!), role: cleanRole(match[2]!) };
  return meta.role && meta.company ? meta : null;
}

/** "Senior Engineer - Acme" or "Senior Engineer | Acme" (common on career sites). */
export function roleDashCompany(title: string): JobMeta | null {
  const match = /^(.+?)\s+[-–—|]\s+(.+?)$/.exec(cleanMeta(title));
  if (!match) return null;
  const meta = { role: cleanRole(match[1]!), company: cleanCompany(match[2]!) };
  return meta.role && meta.company ? meta : null;
}

/** "acme-corp" -> "Acme Corp" (ATS board slugs in the URL). */
export function companyFromSlug(slug: string): string {
  const clean = decodeURIComponentSafe(slug).replace(/[-_]+/g, ' ').trim();
  if (!clean || /^\d+$/.test(clean) || clean.length > 60) return '';
  return clean.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The first path segment of a URL whose host matches, e.g. jobs.lever.co/<company>/... */
export function boardSlug(url: string, host: RegExp): string {
  try {
    const parsed = new URL(url);
    if (!host.test(parsed.hostname.toLowerCase())) return '';
    return parsed.pathname.split('/').filter(Boolean)[0] ?? '';
  } catch {
    return '';
  }
}

/** Keeps the first non-empty value of each field. */
export function pickMeta(...candidates: (Partial<JobMeta> | null | undefined)[]): JobMeta {
  const out: JobMeta = { company: '', role: '' };
  for (const c of candidates) {
    if (!c) continue;
    if (!out.company && c.company) out.company = cleanMeta(c.company);
    if (!out.role && c.role) out.role = cleanMeta(c.role);
  }
  return out;
}

/**
 * Fallback for any page: og:site_name for the company; "Role at Company",
 * "Role - Company" in og:title or document.title; the first h1 for the role.
 */
export function genericJobMeta(meta: PageMeta): JobMeta {
  const titles = [meta.ogTitle, meta.title].filter(Boolean);
  const fromTitles = titles.map((t) => roleAtCompany(t) ?? roleDashCompany(t));
  const site = cleanCompany(meta.ogSiteName);
  return pickMeta(
    ...fromTitles,
    { company: site, role: cleanRole(meta.h1) },
    { role: cleanRole(meta.ogTitle) },
    { role: cleanRole(meta.title) },
  );
}
