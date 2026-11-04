// On-screen text for the AnswerOnce video, selected with ?lang=en|es.
// Spanish follows landing/src/i18n/es.ts: neutral Spanish with "tú", no voseo.
// Real extension UI labels (Fill this page, Applied…) stay in English.
export const STRINGS = {
  en: {
    problemDim: 'Same questions. Different forms.',
    problem: 'You’ve typed the same answers a hundred times.',
    tagDim: 'Answer once.',
    tag: 'Apply everywhere.',
    intro: 'A browser extension that fills job applications from a profile on your own disk.',

    importDim: 'Import your CV.',
    import: 'Review every value.',
    importA: 'Optional AI: Claude, OpenAI, Gemini, or Ollama fully local.',
    importB: 'Your CV goes to the AI only after you confirm.',

    fillDim: 'One click.',
    fill: 'The whole form.',
    fillA: 'Known fields filled. Your CV attached.',
    fillB: 'Greenhouse, Lever, Ashby and many standard forms, in English and Spanish.',

    draftDim: 'Open questions?',
    draft: 'AI drafts them.',
    draftA: 'One click per question. You edit, then insert.',

    submitDim: 'It never submits.',
    submit: 'You press Submit.',
    submitA: 'Consent boxes are always left to you.',
    you: 'You',

    trackDim: 'Every application,',
    track: 'tracked.',
    trackA: 'Status, answers, and a reminder if you already applied.',

    agentsDim: 'Works with Claude',
    agents: 'and your AI agent.',
    agentsA: 'Claude Desktop, Claude Code, Codex, Antigravity, OpenCode and Cursor.',
    agentsB: 'Profile changes arrive as proposals you approve.',
    chatUser: 'Import my new CV and list my applications from this week.',
    chatReply: 'I proposed 3 changes to your profile. Review them in AnswerOnce. This week you applied to Senior Frontend Engineer at Fieldstone.',
    chatConnected: 'answeronce connected',

    privacyDim: 'Your profile lives',
    privacy: 'on your disk.',
    privacyA: 'Plain JSON files in a folder you choose.',
    noAccount: 'No account',
    noServer: 'No server',
    noTracking: 'No tracking',

    free: 'Free & open source · AGPL-3.0',
    browsers: 'For Chrome, Arc and Edge',
    createdBy: 'Created by',
  },
  es: {
    problemDim: 'Las mismas preguntas. Formularios distintos.',
    problem: 'Has escrito las mismas respuestas cien veces.',
    tagDim: 'Responde una vez.',
    tag: 'Postúlate en todas partes.',
    intro: 'Una extensión del navegador que completa solicitudes de empleo desde un perfil en tu propio disco.',

    importDim: 'Importa tu CV.',
    import: 'Revisa cada valor.',
    importA: 'IA opcional: Claude, OpenAI, Gemini, u Ollama en tu equipo.',
    importB: 'Tu CV va a la IA solo después de que confirmes.',

    fillDim: 'Un clic.',
    fill: 'Todo el formulario.',
    fillA: 'Los campos conocidos, completos. Tu CV, adjunto.',
    fillB: 'Greenhouse, Lever, Ashby y muchos formularios estándar, en inglés y en español.',

    draftDim: '¿Preguntas abiertas?',
    draft: 'La IA las redacta.',
    draftA: 'Un clic por pregunta. Tú la editas y la insertas.',

    submitDim: 'Nunca envía nada.',
    submit: 'Tú pulsas Enviar.',
    submitA: 'Las casillas de consentimiento siempre quedan para ti.',
    you: 'Tú',

    trackDim: 'Cada solicitud,',
    track: 'registrada.',
    trackA: 'Estado, respuestas y un aviso si ya te postulaste.',

    agentsDim: 'Funciona con Claude',
    agents: 'y tu agente de IA.',
    agentsA: 'Claude Desktop, Claude Code, Codex, Antigravity, OpenCode y Cursor.',
    agentsB: 'Los cambios en tu perfil llegan como propuestas que tú apruebas.',
    chatUser: 'Importa mi nuevo CV y lista mis solicitudes de esta semana.',
    chatReply: 'Propuse 3 cambios a tu perfil. Revísalos en AnswerOnce. Esta semana te postulaste a Senior Frontend Engineer en Fieldstone.',
    chatConnected: 'answeronce conectado',

    privacyDim: 'Tu perfil vive',
    privacy: 'en tu disco.',
    privacyA: 'Archivos JSON simples en una carpeta que tú eliges.',
    noAccount: 'Sin cuenta',
    noServer: 'Sin servidor',
    noTracking: 'Sin rastreo',

    free: 'Gratis y de código abierto · AGPL-3.0',
    browsers: 'Para Chrome, Arc y Edge',
    createdBy: 'Creado por',
  },
};

/** Labels from real application forms, in English and Spanish (scene 1). */
export const FORM_LABELS = [
  { label: 'First name', typed: 'Jordan' },
  { label: 'Nombre' },
  { label: 'Email address', typed: 'jordan.rivera@example.com' },
  { label: 'Correo electrónico' },
  { label: 'Phone number' },
  { label: 'Teléfono', typed: '+351 912 345 678' },
  { label: 'LinkedIn profile' },
  { label: 'Perfil de LinkedIn' },
  { label: 'Resume / CV', file: true },
  { label: 'Adjunta tu CV', file: true },
  { label: 'Are you authorized to work in Portugal?', select: true },
  { label: '¿Tienes permiso de trabajo?', select: true },
  { label: 'Given name', typed: 'Jordan' },
  { label: 'Ciudad' },
  { label: 'Website / portfolio' },
  { label: 'Full name', typed: 'Jordan Rivera' },
];
