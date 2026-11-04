/** Browsers the install guide has wording for. The first one is the default (also with JavaScript off). */
export const browsers = [
  { id: 'chrome', name: 'Chrome', extensionsUrl: 'chrome://extensions' },
  { id: 'arc', name: 'Arc', extensionsUrl: 'arc://extensions' },
  { id: 'edge', name: 'Edge', extensionsUrl: 'edge://extensions' },
  { id: 'brave', name: 'Brave', extensionsUrl: 'brave://extensions' },
] as const;

export type BrowserId = (typeof browsers)[number]['id'];

export const isBrowserId = (value: unknown): value is BrowserId => browsers.some((b) => b.id === value);

/** localStorage key for the guide's progress and browser choice. */
export const GUIDE_STORAGE_KEY = 'answeronce:install-guide';
