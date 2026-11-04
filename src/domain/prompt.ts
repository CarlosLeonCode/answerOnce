import type { Profile } from './profile';

export interface AnswerPrompt {
  system: string;
  user: string;
}

const MAX_JOB_CHARS = 6000;

/**
 * Builds a data-minimized summary of the profile for the LLM. Contact details,
 * salary, API keys and documents are intentionally excluded.
 */
export function profileSummary(profile: Profile): string {
  const lines: string[] = [];
  const p = profile.personal;
  if (p.firstName) lines.push(`First name: ${p.firstName}`);
  if (profile.headline) lines.push(`Headline: ${profile.headline}`);
  if (profile.summary) lines.push(`Summary: ${profile.summary.slice(0, 600)}`);
  if (profile.skills.length) lines.push(`Skills: ${profile.skills.slice(0, 40).join(', ')}`);
  if (p.location || p.city || p.country) lines.push(`Location: ${p.location || [p.city, p.country].filter(Boolean).join(', ')}`);
  if (profile.workAuthorization.countriesAuthorized.length) {
    lines.push(`Authorized to work in: ${profile.workAuthorization.countriesAuthorized.join(', ')}`);
  }
  if (profile.preferences.workModes.length) lines.push(`Preferred work modes: ${profile.preferences.workModes.join(', ')}`);
  if (profile.experience.length) {
    lines.push('Experience:');
    for (const e of profile.experience.slice(0, 6)) {
      const period = [e.startDate, e.current ? 'present' : e.endDate].filter(Boolean).join(' – ');
      lines.push(`- ${e.title} at ${e.company}${period ? ` (${period})` : ''}${e.description ? `: ${e.description.slice(0, 400)}` : ''}`);
    }
  }
  if (profile.education.length) {
    lines.push('Education:');
    for (const ed of profile.education.slice(0, 4)) {
      lines.push(`- ${[ed.degree, ed.field].filter(Boolean).join(' in ')} — ${ed.school}`);
    }
  }
  return lines.join('\n');
}

export function buildAnswerPrompt(question: string, jobDescription: string, profile: Profile): AnswerPrompt {
  const job = jobDescription.trim().slice(0, MAX_JOB_CHARS);
  return {
    system:
      'You help a candidate answer job application questions. Write in first person, in the same language as the question. ' +
      'Be concise (under 150 words unless the question asks for more), specific, honest and professional. ' +
      'Only use facts from the candidate profile; never invent employers, degrees or numbers. ' +
      'Return only the answer text, without preamble or quotes.',
    user: [
      `Question: ${question.trim()}`,
      '',
      'Candidate profile:',
      profileSummary(profile) || '(empty)',
      '',
      'Job description (may be partial):',
      job || '(not available)',
    ].join('\n'),
  };
}
