import { boardSlug, cleanCompany, cleanRole, companyFromSlug, genericJobMeta, pickMeta, roleAtCompany } from '../../domain/job-meta';
import { tableAdapter } from './base';

const GREENHOUSE_HOST = /(^|\.)greenhouse\.io$/;

/**
 * Greenhouse: classic boards (boards.greenhouse.io, `job_application[...]`
 * names), the newer React boards (job-boards.greenhouse.io, plain ids) and
 * embedded boards (iframe from greenhouse on a company site).
 */
export const greenhouseAdapter = tableAdapter({
  id: 'greenhouse',
  name: 'Greenhouse',
  hosts: [/(^|\.)boards\.greenhouse\.io$/, /(^|\.)job-boards\.greenhouse\.io$/, /(^|\.)boards\.eu\.greenhouse\.io$/],
  hint: 'greenhouse',
  fields: {
    'job_application[first_name]': 'firstName',
    'job_application[last_name]': 'lastName',
    'job_application[preferred_name]': 'preferredName',
    'job_application[email]': 'email',
    'job_application[phone]': 'phone',
    'job_application[location]': 'location',
    first_name: 'firstName',
    last_name: 'lastName',
    preferred_name: 'preferredName',
    email: 'email',
    phone: 'phone',
    'candidate-location': 'location',
    resume: 'resume',
    cover_letter: 'coverLetter',
  },
  patterns: [
    [/^job_application\[educations_attributes\]\[\d+\]\[school_name_id\]$/, 'school'],
    [/^job_application\[educations_attributes\]\[\d+\]\[degree_id\]$/, 'degree'],
    [/^job_application\[educations_attributes\]\[\d+\]\[discipline_id\]$/, 'fieldOfStudy'],
    [/^school--\d+$/, 'school'],
    [/^degree--\d+$/, 'degree'],
    [/^discipline--\d+$/, 'fieldOfStudy'],
  ],
  // Header: <h1 class="app-title">Role</h1><span class="company-name">at Company</span>;
  // title: "Job Application for Role at Company"; URL: boards.greenhouse.io/<company>/jobs/<id>.
  jobMeta: ({ url, meta }) => {
    const slug = boardSlug(url, GREENHOUSE_HOST);
    return pickMeta(
      { role: cleanRole(meta.marks['.app-title'] || meta.marks['.job__title h1'] || ''), company: cleanCompany(meta.marks['.company-name'] ?? '') },
      roleAtCompany(meta.title),
      { company: slug === 'embed' ? '' : companyFromSlug(slug) },
      genericJobMeta(meta),
    );
  },
});
