import type { ImageMetadata } from 'astro';
import type { Locale } from './i18n';
import kaiflow from './assets/tools/kaiflow-icon.png';
import bashwizardry from './assets/tools/bashwizardry-icon.png';
import captuflow from './assets/tools/captuflow-icon.png';
import clcagenda from './assets/tools/clcagenda-icon.png';
import watextly from './assets/tools/watextly-icon.png';

/** Other tools by the same author, shown in the nav menu and the Tools section. Icons come from each site. */
export const tools: { name: string; href: string; text: Record<Locale, string>; icon: ImageMetadata }[] = [
  { name: 'Kaiflow', href: 'https://kaiflow.carlosleoncode.com/', text: { en: 'Private time tracker for your menu bar', es: 'Control de tiempo privado en tu barra de menús' }, icon: kaiflow },
  { name: 'Bash Wizardry', href: 'https://bashwizardry.carlosleoncode.com/', text: { en: '128 spells for Bash and Zsh', es: '128 hechizos para Bash y Zsh' }, icon: bashwizardry },
  { name: 'CaptuFlow', href: 'https://captuflow.com/', text: { en: 'Screenshot editor in your browser', es: 'Editor de capturas de pantalla en tu navegador' }, icon: captuflow },
  { name: 'CLC Agenda', href: 'https://clcagenda.carlosleoncode.com/', text: { en: 'WhatsApp contacts to Google Contacts', es: 'De contactos de WhatsApp a Google Contacts' }, icon: clcagenda },
  { name: 'Watextly', href: 'https://watextly.carlosleoncode.com/', text: { en: 'WhatsApp links and post formatting', es: 'Enlaces de WhatsApp y formato de publicaciones' }, icon: watextly },
];
