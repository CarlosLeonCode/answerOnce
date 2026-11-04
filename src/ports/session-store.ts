import type { Profile } from '../domain/profile';

/**
 * The profile loaded for the current browser session. Must be backed by
 * memory-only storage (chrome.storage.session), never by disk.
 */
export interface ProfileSession {
  profile: Profile;
  loadedAt: string;
  /** Revision of profile.json the profile was read from (or written as). -1 = unknown. */
  revision: number;
}

export interface SessionStore {
  get(): Promise<ProfileSession | null>;
  set(session: ProfileSession): Promise<void>;
  clear(): Promise<void>;
  /** Subscribes to changes (e.g. the folder was reconnected in another extension page). Returns unsubscribe. */
  subscribe(listener: (session: ProfileSession | null) => void): () => void;
}
