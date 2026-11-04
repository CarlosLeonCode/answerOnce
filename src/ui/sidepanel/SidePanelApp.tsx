import { Globe, ShieldCheck, UserRoundPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getActiveTab } from '../../infrastructure/page/scripting-page-gateway';
import { Brand } from '../shared/components';
import { ToastProvider } from '../shared/toast';
import { VaultGate } from '../shared/VaultGate';
import { useVault } from '../shared/use-vault';
import { FillPanel } from './FillPanel';
import { openOptions } from './open-options';

/** Host of the page this panel is bound to (?tabId=), so the user knows what will be filled. */
function useBoundHost(): string | null {
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('tabId')) return;
    void getActiveTab().then((tab) => {
      try {
        setHost(tab?.url ? new URL(tab.url).host : null);
      } catch {
        setHost(null);
      }
    });
  }, []);
  return host;
}

// Framed inside the job page (in-page panel): no file pickers or permission prompts there.
const embedded = new URLSearchParams(location.search).get('embed') === '1';

export function SidePanelApp() {
  const vault = useVault();
  const boundHost = useBoundHost();
  return (
    <ToastProvider>
      <div className="panel">
        <header className="panel-header">
          <Brand />
          <span className="spacer" />
          <button type="button" className="ghost sm" onClick={() => openOptions()}>
            <UserRoundPen aria-hidden="true" />
            Profile
          </button>
        </header>
        {boundHost && (
          <p className="target-page" title="AnswerOnce fills the form on this page">
            <Globe aria-hidden="true" />
            Filling <strong>{boundHost}</strong>
          </p>
        )}
        <VaultGate vault={vault} onOpenSettings={embedded ? () => openOptions() : undefined}>
          <FillPanel vault={vault} />
        </VaultGate>
        <p className="footnote">
          <ShieldCheck aria-hidden="true" />
          You review and submit the form yourself. AnswerOnce never submits.
        </p>
      </div>
    </ToastProvider>
  );
}
