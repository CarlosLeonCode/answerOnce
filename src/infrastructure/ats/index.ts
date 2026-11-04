import type { AtsAdapter } from '../../ports/ats-adapter';
import { ashbyAdapter } from './ashby';
import { genericAdapter } from './generic';
import { greenhouseAdapter } from './greenhouse';
import { leverAdapter } from './lever';

/** Ordered: specific adapters first, generic last. */
export const ATS_ADAPTERS: readonly AtsAdapter[] = [greenhouseAdapter, leverAdapter, ashbyAdapter, genericAdapter];

/**
 * Hosts of ATS forms commonly embedded as cross-origin iframes. activeTab only
 * covers the tab's top-level origin, so these are optional host permissions
 * the user can grant from the side panel.
 */
export const ATS_EMBED_ORIGINS = [
  'https://boards.greenhouse.io/*',
  'https://job-boards.greenhouse.io/*',
  'https://jobs.lever.co/*',
  'https://jobs.ashbyhq.com/*',
];

export { ashbyAdapter, genericAdapter, greenhouseAdapter, leverAdapter };
