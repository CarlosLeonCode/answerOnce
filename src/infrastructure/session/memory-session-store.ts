import type { ProfileSession, SessionStore } from '../../ports/session-store';

/** In-memory SessionStore: tests, and the per-request session of the answeronce-mcp server. */
export class MemorySessionStore implements SessionStore {
  private value: ProfileSession | null = null;
  private listeners = new Set<(s: ProfileSession | null) => void>();
  async get() {
    return this.value;
  }
  async set(session: ProfileSession) {
    this.value = session;
    this.listeners.forEach((l) => l(session));
  }
  async clear() {
    this.value = null;
    this.listeners.forEach((l) => l(null));
  }
  subscribe(listener: (s: ProfileSession | null) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}
