import { boardSlug, cleanRole, companyFromSlug, genericJobMeta, pickMeta, roleAtCompany } from '../../domain/job-meta';
import { tableAdapter } from './base';

const ASHBY_HOST = /(^|\.)ashbyhq\.com$/;

/** Ashby hosted job boards (jobs.ashbyhq.com/<company>/<id>/application). */
export const ashbyAdapter = tableAdapter({
  id: 'ashby',
  name: 'Ashby',
  hosts: [/(^|\.)jobs\.ashbyhq\.com$/],
  hint: 'ashby',
  fields: {
    _systemfield_name: 'fullName',
    _systemfield_email: 'email',
    _systemfield_phone: 'phone',
    _systemfield_location: 'location',
    _systemfield_resume: 'resume',
    _systemfield_linkedin: 'linkedin',
    _systemfield_github: 'github',
    _systemfield_website: 'website',
  },
  // Title: "Role @ Company"; heading: .ashby-job-posting-heading; URL: jobs.ashbyhq.com/<company>/<id>.
  jobMeta: ({ url, meta }) =>
    pickMeta(
      roleAtCompany(meta.title),
      { role: cleanRole(meta.marks['.ashby-job-posting-heading'] ?? '') },
      { company: companyFromSlug(boardSlug(url, ASHBY_HOST)) },
      genericJobMeta(meta),
    ),
});
