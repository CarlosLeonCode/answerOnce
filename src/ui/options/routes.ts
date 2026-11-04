import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Briefcase,
  ClipboardList,
  FileUp,
  Files,
  GraduationCap,
  IdCard,
  Inbox,
  LayoutDashboard,
  Link,
  MessageSquareText,
  NotebookPen,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export const ROUTES = [
  'overview',
  'applications',
  'proposals',
  'import',
  'personal',
  'links',
  'about',
  'experience',
  'education',
  'work',
  'preferences',
  'documents',
  'answers',
  'ai',
  'agents',
  'security',
] as const;
export type Route = (typeof ROUTES)[number];

export interface RouteMeta {
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const ROUTE_META: Record<Route, RouteMeta> = {
  overview: { label: 'Overview', title: 'Overview', description: 'Your profile at a glance and what to complete next.', icon: LayoutDashboard },
  applications: {
    label: 'Applications',
    title: 'Applications',
    description: 'Jobs you filled or applied to with AnswerOnce, kept in applications.json in your profile folder.',
    icon: ClipboardList,
  },
  proposals: {
    label: 'Agent proposals',
    title: 'Agent proposals',
    description: 'Changes suggested by your AI agents. Nothing is applied until you accept it.',
    icon: Inbox,
  },
  import: {
    label: 'Import from CV',
    title: 'Import from CV',
    description: 'Turn your CV into a structured profile. You review every value before anything is saved.',
    icon: FileUp,
  },
  personal: { label: 'Personal', title: 'Personal details', description: 'Name, contact details and location used by almost every application.', icon: UserRound },
  links: { label: 'Links', title: 'Links', description: 'Professional profiles and websites.', icon: Link },
  about: { label: 'Summary & skills', title: 'Summary & skills', description: 'How you describe yourself professionally.', icon: NotebookPen },
  experience: { label: 'Experience', title: 'Experience', description: 'Your work history, most recent first.', icon: Briefcase },
  education: { label: 'Education', title: 'Education', description: 'Degrees, schools and certifications.', icon: GraduationCap },
  work: { label: 'Work authorization', title: 'Work authorization', description: 'Right to work, sponsorship and availability.', icon: IdCard },
  preferences: { label: 'Preferences', title: 'Preferences', description: 'Salary expectations, work modes and relocation.', icon: SlidersHorizontal },
  documents: { label: 'Documents', title: 'Documents', description: 'CVs and cover letters, kept as files in your profile folder.', icon: Files },
  answers: { label: 'Saved answers', title: 'Saved answers', description: 'Reusable answers to recurring application questions.', icon: MessageSquareText },
  ai: { label: 'AI provider', title: 'AI provider', description: 'Optional model used to draft answers and structure your CV.', icon: Bot },
  agents: {
    label: 'AI agents',
    title: 'AI agents',
    description: 'Let Claude and other AI assistants read your profile and suggest changes.',
    icon: Plug,
  },
  security: { label: 'Security', title: 'Security', description: 'Where your profile files are stored and who can read them.', icon: ShieldCheck },
};

export const NAV_GROUPS: { label: string | null; routes: Route[] }[] = [
  { label: null, routes: ['overview', 'applications', 'proposals', 'import'] },
  { label: 'Profile', routes: ['personal', 'links', 'about', 'experience', 'education'] },
  { label: 'Application details', routes: ['work', 'preferences', 'documents', 'answers'] },
  { label: 'Settings', routes: ['ai', 'agents', 'security'] },
];

function parseHash(): Route {
  const id = location.hash.replace(/^#\/?/, '');
  return (ROUTES as readonly string[]).includes(id) ? (id as Route) : 'overview';
}

/** Hash routing (#/personal) so pages are linkable, e.g. options.html#/import from the side panel. */
export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((next: Route) => {
    if (location.hash !== `#/${next}`) location.hash = `/${next}`;
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);
  return [route, navigate];
}
