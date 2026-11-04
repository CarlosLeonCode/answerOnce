import { useCallback, useEffect, useRef, useState } from 'react';
import { readApplications, type ApplicationsDeps } from '../../application/applications';
import type { Application } from '../../domain/applications';
import { applicationsDeps } from './container';
import { errorMessage, type VaultApi } from './use-vault';

/** Extension pages tell each other when they wrote applications.json. */
const CHANNEL = 'answeronce:applications';

export interface ApplicationsState {
  /** True until the first read finished (or was skipped for lack of folder access). */
  loading: boolean;
  applications: Application[];
  /** applications.json could not be read (e.g. a hand edit broke it). */
  error: string | null;
}

/**
 * React binding for applications.json. Reads it without prompting (only when
 * folder access was granted in this browser session, so again right after a
 * reconnect) on mount, on
 * window focus, and when another extension page wrote it. `run` performs a
 * write: it asks for folder access if needed, so call it from a click.
 */
export function useApplications(vault: VaultApi) {
  const [state, setState] = useState<ApplicationsState>({ loading: true, applications: [], error: null });
  const handle = vault.handle;
  const hasSession = vault.session !== null;
  const accessGranted = vault.accessGranted;
  const channel = useRef<BroadcastChannel | null>(null);

  const reload = useCallback(async (): Promise<Application[] | null> => {
    if (!handle || !hasSession || !accessGranted) {
      setState((s) => ({ ...s, loading: false }));
      return null;
    }
    try {
      const { applications } = await readApplications(applicationsDeps(handle).storage);
      setState({ loading: false, applications, error: null });
      return applications;
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(e) }));
      return null;
    }
  }, [handle, hasSession, accessGranted]);

  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = () => void reload();
    } catch {
      bc = null;
    }
    channel.current = bc;
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      bc?.close();
      channel.current = null;
    };
  }, [reload]);

  const run = useCallback(
    async <T>(write: (deps: ApplicationsDeps) => Promise<T>): Promise<T> => {
      await vault.withDeps();
      const result = await write(applicationsDeps(vault.handle!));
      await reload();
      channel.current?.postMessage('changed');
      return result;
    },
    [vault, reload],
  );

  return { ...state, reload, run };
}

export type ApplicationsApi = ReturnType<typeof useApplications>;
