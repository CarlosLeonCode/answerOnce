import type { ImageMetadata } from 'astro';
import kaiflow from './assets/tools/kaiflow-icon.png';
import bashwizardry from './assets/tools/bashwizardry-icon.png';
import captuflow from './assets/tools/captuflow-icon.png';
import clcagenda from './assets/tools/clcagenda-icon.png';
import watextly from './assets/tools/watextly-icon.png';

/** Other tools by the same author, shown in the nav menu and the Tools section. Icons come from each site. */
export const tools: { name: string; href: string; text: string; icon: ImageMetadata }[] = [
  { name: 'Kaiflow', href: 'https://kaiflow.carlosleoncode.com/', text: 'Private time tracker for your menu bar', icon: kaiflow },
  { name: 'Bash Wizardry', href: 'https://bashwizardry.carlosleoncode.com/', text: '128 spells for Bash and Zsh', icon: bashwizardry },
  { name: 'CaptuFlow', href: 'https://captuflow.com/', text: 'Screenshot editor in your browser', icon: captuflow },
  { name: 'CLC Agenda', href: 'https://clcagenda.carlosleoncode.com/', text: 'WhatsApp contacts to Google Contacts', icon: clcagenda },
  { name: 'Watextly', href: 'https://watextly.carlosleoncode.com/', text: 'WhatsApp links and post formatting', icon: watextly },
];
