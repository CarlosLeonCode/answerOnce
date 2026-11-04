import { browser } from 'wxt/browser';
import { parseProfile } from '../../domain/profile';
import type { ProfileSession, SessionStore } from '../../ports/session-store';

// Legacy "hire" key (the product's former name), kept so an open session survives the rename.
const KEY = 'hire.session';

/**
 * chrome.storage.session is kept in memory and cleared when the browser
 * closes. Its default access level is TRUSTED_CONTEXTS, so content scripts and
 * injected page code cannot read it. We never call setAccessLevel.
 */
export class ChromeSessionStore implements SessionStore {
  async get(): Promise<ProfileSession | null> {
    const data = await browser.storage.session.get(KEY);
    return revive(data[KEY]);
  }

  async set(session: ProfileSession): Promise<void> {
    await browser.storage.session.set({ [KEY]: session });
  }

  async clear(): Promise<void> {
    await browser.storage.session.remove(KEY);
  }

  subscribe(listener: (session: ProfileSession | null) => void): () => void {
    const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'session' || !(KEY in changes)) return;
      listener(revive(changes[KEY]?.newValue));
    };
    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }
}

function revive(value: unknown): ProfileSession | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ProfileSession>;
  // Sessions written by an older build carry no revision: -1 forces a reload from disk.
  const revision = typeof v.revision === 'number' ? v.revision : -1;
  return { loadedAt: v.loadedAt ?? '', profile: parseProfile(v.profile), revision };
}
