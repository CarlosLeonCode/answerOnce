import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { installAgent } from '../page-agent/agent';

// Built to /page-agent.js. Injected only on user click via chrome.scripting.
export default defineUnlistedScript(() => {
  installAgent();
});
