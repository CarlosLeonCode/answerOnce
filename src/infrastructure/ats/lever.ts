import { boardSlug, cleanRole, companyDashRole, companyFromSlug, genericJobMeta, pickMeta } from '../../domain/job-meta';
import { tableAdapter } from './base';

const LEVER_HOST = /(^|\.)lever\.co$/;

/** Lever hosted application forms (jobs.lever.co/<company>/<id>/apply). */
export const leverAdapter = tableAdapter({
  id: 'lever',
  name: 'Lever',
  hosts: [/(^|\.)jobs\.lever\.co$/, /(^|\.)jobs\.eu\.lever\.co$/],
  hint: 'lever',
  fields: {
    name: 'fullName',
    email: 'email',
    phone: 'phone',
    org: 'currentCompany',
    location: 'location',
    pronouns: 'pronouns',
    resume: 'resume',
    'urls[LinkedIn]': 'linkedin',
    'urls[GitHub]': 'github',
    'urls[Github]': 'github',
    'urls[Portfolio]': 'portfolio',
    'urls[Other]': 'website',
  },
  // Header: <div class="posting-headline"><h2>Role</h2>; title: "Company - Role"; URL: jobs.lever.co/<company>/<id>.
  jobMeta: ({ url, meta }) =>
    pickMeta(
      { role: cleanRole(meta.marks['.posting-headline h2'] ?? '') },
      companyDashRole(meta.title),
      { company: companyFromSlug(boardSlug(url, LEVER_HOST)) },
      genericJobMeta(meta),
    ),
});
