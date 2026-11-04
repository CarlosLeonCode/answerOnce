import type { CanonicalKey } from '../../domain/canonical-keys';
import type { FieldDescriptor } from '../../domain/field';
import { genericJobMeta, type JobMeta, type PageMeta } from '../../domain/job-meta';
import type { AtsAdapter } from '../../ports/ats-adapter';

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Builds an adapter from host patterns, a DOM hint and a name/id lookup table. */
export function tableAdapter(config: {
  id: string;
  name: string;
  hosts: RegExp[];
  hint: string;
  fields: Record<string, CanonicalKey>;
  patterns?: [RegExp, CanonicalKey][];
  /** Company and role from this ATS's markup; defaults to the generic page heuristics. */
  jobMeta?: (frame: { url: string; meta: PageMeta }) => JobMeta;
}): AtsAdapter {
  return {
    id: config.id,
    name: config.name,
    detect: ({ url, hints }) => hints.includes(config.hint) || config.hosts.some((h) => h.test(hostnameOf(url))),
    mapField(field: FieldDescriptor): CanonicalKey | null {
      for (const attr of [field.name, field.htmlId]) {
        if (!attr) continue;
        const direct = config.fields[attr];
        if (direct) return direct;
        for (const [re, key] of config.patterns ?? []) if (re.test(attr)) return key;
      }
      return null;
    },
    jobMeta: config.jobMeta ?? (({ meta }) => genericJobMeta(meta)),
  };
}
