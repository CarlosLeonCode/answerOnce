import { genericJobMeta } from '../../domain/job-meta';
import type { AtsAdapter } from '../../ports/ats-adapter';

/**
 * Fallback adapter: matches every page and defers all fields to the generic
 * synonym rules. Kept as an explicit adapter so the pipeline is uniform.
 */
export const genericAdapter: AtsAdapter = {
  id: 'generic',
  name: 'Generic form',
  detect: () => true,
  mapField: () => null,
  jobMeta: ({ meta }) => genericJobMeta(meta),
};
