import { useCallback, useEffect, useRef, useState } from 'react';
import { LEGACY_VAULT_FILE } from '../../application/legacy-migration';
import {
  clearSession,
  createProfile,
  inspectFolder,
  openProfile,
  saveProfile,
  syncSession,
  type FolderContents,
  type VaultDeps,
} from '../../application/vault';
import type { Profile } from '../../domain/profile';
import type { ProfileSession } from '../../ports/session-store';
import type { VaultStorage } from '../../ports/vault-storage';
import {
  directoryHandleStore,
  ensureDirectoryPermission,
  pickVaultDirectory,
} from '../../infrastructure/vault/directory-handle-store';
import { sessionStore, vaultDeps } from './container';

export interface VaultState {
  loading: boolean;
  handle: FileSystemDirectoryHandle | null;
  session: ProfileSession | null;
  /**
   * Folder access granted in this browser session. The cached session outlives
   * it (Chrome drops the grant when the last AnswerOnce page closes), so pages must
   * not trust the session alone: without access nothing can be read or saved.
   */
  accessGranted: boolean;
  /** What the folder holds; null = unknown until folder access is granted in this browser session. */
  contents: FolderContents | null;
  /** True right after a profile was created in this page (drives onboarding). */
  justCreated: boolean;
  /** Incremented every time profile.json was found changed on disk by someone else (agent, other window). */
  externalChanges: number;
}

const inspect = (storage: VaultStorage) => inspectFolder(storage, LEGACY_VAULT_FILE);

/** Read/write access already granted in this browser session (never prompts). */
const hasAccess = async (handle: FileSystemDirectoryHandle) =>
  (await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted';

/**
 * React binding for the profile folder. Every action touching the disk first
 * calls ensureDirectoryPermission(), so it must be triggered from a click handler.
 *
 * Agents (answeronce-mcp) and other windows can write profile.json too. The session
 * is reloaded from disk when its revision changed: before every disk action
 * (withDeps), and when the page regains focus or becomes visible.
 */
export function useVault() {
  const [state, setState] = useState<VaultState>({ loading: true, handle: null, session: null, accessGranted: false, contents: null, justCreated: false, externalChanges: 0 });
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);
  handleRef.current = state.handle;

  /** Reloads the session if profile.json has a newer revision. Returns the current session. */
  const syncFrom = useCallback(async (deps: VaultDeps): Promise<ProfileSession | null> => {
    const { session, changed } = await syncSession(deps);
    if (changed) setState((s) => ({ ...s, session, externalChanges: s.externalChanges + 1 }));
    return session;
  }, []);

  /** Inspects a folder we have access to and loads its profile when there is one. */
  const load = useCallback(async (handle: FileSystemDirectoryHandle, session: ProfileSession | null) => {
    const deps = vaultDeps(handle);
    const contents = await inspect(deps.storage);
    if (contents === 'profile' && !session) session = await openProfile(deps);
    return { contents, session };
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [handle, cached] = await Promise.all([directoryHandleStore.get().catch(() => null), sessionStore.get()]);
      let contents: FolderContents | null = null;
      let session = cached;
      // Access already granted in this browser session: no click needed.
      const accessGranted = handle !== null && (await hasAccess(handle));
      if (handle && accessGranted) {
        const loaded = await load(handle, session).catch(() => null);
        if (loaded) ({ contents, session } = loaded);
      }
      if (alive) setState((s) => ({ ...s, loading: false, handle, session, accessGranted, contents, justCreated: false }));
    })();
    const unsubscribe = sessionStore.subscribe((session) => setState((s) => ({ ...s, session })));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [load]);

  /** Folder access (asks for permission: call from a click) plus a fresh session. */
  const withDeps = useCallback(async (): Promise<VaultDeps> => {
    if (!state.handle) throw new Error('Choose a profile folder first.');
    if (!(await ensureDirectoryPermission(state.handle))) {
      setState((s) => (s.accessGranted ? { ...s, accessGranted: false } : s));
      throw new Error('Access to the profile folder was not granted.');
    }
    setState((s) => (s.accessGranted ? s : { ...s, accessGranted: true }));
    const deps = vaultDeps(state.handle);
    await syncFrom(deps);
    return deps;
  }, [state.handle, syncFrom]);

  /**
   * Picks up changes made by agents or other windows without prompting: does
   * nothing unless folder access was already granted in this session.
   */
  const refresh = useCallback(async (): Promise<ProfileSession | null> => {
    const handle = handleRef.current;
    if (!handle) return null;
    const accessGranted = await hasAccess(handle);
    setState((s) => (s.accessGranted === accessGranted ? s : { ...s, accessGranted }));
    if (!accessGranted || !(await sessionStore.get())) return null;
    return syncFrom(vaultDeps(handle));
  }, [syncFrom]);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined);
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [refresh]);

  const pickDirectory = useCallback(async () => {
    const handle = await pickVaultDirectory();
    if (state.session) await clearSession(sessionStore);
    const { contents, session } = await load(handle, null);
    setState((s) => ({ ...s, handle, contents, session, accessGranted: true }));
  }, [state.session, load]);

  /** "Reconnect folder": grants access for this browser session and loads the profile. */
  const connect = useCallback(async () => {
    await withDeps();
    const { contents, session } = await load(state.handle!, await sessionStore.get());
    setState((s) => ({ ...s, contents, session }));
  }, [withDeps, load, state.handle]);

  const create = useCallback(async () => {
    const session = await createProfile(await withDeps());
    setState((s) => ({ ...s, session, contents: 'profile', justCreated: true }));
  }, [withDeps]);

  /** Adopts a session loaded elsewhere (e.g. imported from an older version). */
  const adopt = useCallback((session: ProfileSession) => setState((s) => ({ ...s, session, contents: 'profile' })), []);

  /** Saves an edited profile. `baseRevision`: the revision the edits started from (conflict check). */
  const save = useCallback(
    async (profile: Profile, baseRevision?: number) => {
      const session = await saveProfile(await withDeps(), profile, baseRevision);
      setState((s) => ({ ...s, session }));
    },
    [withDeps],
  );

  const finishOnboarding = useCallback(() => setState((s) => ({ ...s, justCreated: false })), []);

  return { ...state, withDeps, refresh, pickDirectory, connect, create, adopt, save, finishOnboarding };
}

export type VaultApi = ReturnType<typeof useVault>;

export function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Cancelled.';
  return error instanceof Error ? error.message : String(error);
}
