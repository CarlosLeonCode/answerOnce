/**
 * English strings: the source of truth for the shape every locale must match (`Strings`).
 * Rich fields (see `Rich` in ./index.ts) take **bold**, `code` and {vars}.
 * Mockups of the extension UI stay in English in every locale, so their labels are not here.
 */
import type { Rich } from './index';

const rich = (r: Rich): Rich => r;

export const en = {
  meta: {
    title: 'AnswerOnce — Answer once. Apply everywhere.',
    description:
      'AI-powered job application autofill that works with Claude and your AI agent. Your profile stays on your disk, and you always press Submit.',
    ogImageAlt: 'AnswerOnce: answer once, apply everywhere, without giving your data away.',
    skip: 'Skip to content',
  },
  nav: {
    aria: 'Main',
    home: 'AnswerOnce home',
    howItWorks: 'How it works',
    features: 'Features',
    privacy: 'Privacy',
    installGuide: 'Install guide',
    faq: 'FAQ',
    tools: 'Tools',
    source: 'Source',
    install: 'Install',
    menu: 'Menu',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    language: 'Language',
    moreTools: 'More tools',
  },
  hero: {
    createdBy: 'Created by',
    pill: 'AI-powered · works with Claude',
    titleDim: 'Answer once.',
    titleBefore: 'Apply',
    titleGlow: 'everywhere',
    titleAfter: '.',
    lead: 'Fill job applications in one click. AI imports your CV and helps with the hard answers. Your profile lives on your disk.',
    install: 'Install AnswerOnce',
    how: 'See how it works',
    worksWith: 'Works with',
    agentsAria: 'Works with these AI agents',
    figureAria: 'AnswerOnce filling an application form',
    shotAlt:
      'A job application form for a Senior Frontend Engineer role. The AnswerOnce panel floats on the right after clicking Fill this page: 9 fields filled and outlined in green, and one open question, “Why do you want to work at Fieldstone?”, waiting for input.',
    figcaption: 'AnswerOnce’s in-page panel on an application form (fictional company and data).',
    captionsAria: 'What happens when you click Fill this page',
    captions: [
      { tag: 'Filled for you', text: 'Known fields and your CV, in one click. Consent boxes stay for you.' },
      { tag: 'You press Submit', text: 'AnswerOnce never submits. You review and send.' },
    ],
    scroll: 'Scroll',
  },
  problem: {
    eyebrow: 'The problem',
    titleDim: 'Same questions.',
    title: 'Different forms.',
    lead: 'Every job site asks the same things its own way.',
    fragsAria: 'The same questions, as four different application forms ask them',
    profile: 'Your profile',
    profileNote: 'One answer per question',
    fields: {
      firstName: 'First name',
      email: 'Email',
      phone: 'Phone',
      linkedin: 'LinkedIn',
      cv: 'Resume / CV',
      workAuth: 'Work authorization',
      yes: 'Yes',
    },
    savedTo: 'saved to',
    fileNote: 'in your folder · on your disk',
    outroDim: 'One profile.',
    outro: 'Every form.',
    outroLead: 'Greenhouse, Lever, Ashby and many standard forms, in English and Spanish.',
  },
  privacy: {
    eyebrow: 'Privacy model',
    titleDim: 'Your data stays',
    titleBefore: 'on your',
    titleGlow: 'computer',
    titleAfter: '.',
    lead: 'No account, no server, no tracking. AI runs only when you ask.',
    cards: [
      { kicker: 'On your disk', title: 'Plain files you own', body: 'Your profile and CV live in a folder you choose, as files you can open and back up.' },
      {
        kicker: 'In the browser',
        title: 'Nothing personal at rest',
        body: 'Your profile is cleared from the browser when you close it. Job pages only get the fields they ask for.',
      },
      {
        kicker: 'Optional AI',
        title: 'What a provider sees',
        body: 'Claude, OpenAI or Gemini with your own key. Drafting sends a short summary; CV import sends your CV after you confirm.',
      },
    ],
    local: 'Or Ollama, fully on your computer.',
    permissions: 'Four browser permissions. No access to all sites.',
  },
  steps: {
    eyebrow: 'How it works',
    titleDim: 'Set up once.',
    title: 'Then it takes a click.',
    items: [
      {
        title: 'Import your CV',
        body: 'Drop your CV and AI fills your profile, or use the basic extractor. You review every value.',
        alt: 'Import from CV review step: each extracted field (first name, last name, email, phone, location) is shown next to the current value with a checkbox, and a button to save the changes to the profile.',
      },
      {
        title: 'Fill the application',
        body: 'Press Fill this page. Known fields are filled and your CV is attached.',
        alt: 'AnswerOnce panel after filling: 9 fields filled, 1 needs input, 0 kept.',
      },
      {
        title: 'Review & submit',
        body: 'Draft open questions with AI, one click each. Then you press Submit.',
        alt: 'An AI-drafted answer to “Why do you want to work at Fieldstone?” in the AnswerOnce panel, with buttons to generate again, insert into page, or save the answer.',
      },
    ],
  },
  features: {
    eyebrow: 'Beyond the form',
    titleDim: 'Remember every application.',
    title: 'Manage it from your agent.',
    trackTitle: 'Track every application',
    trackBody: 'Every application and what you answered, with its status. AnswerOnce reminds you if you already applied to that job.',
    agentTitle: 'Works with your AI agent',
    agentBody:
      'Add it to Claude Desktop from one file. Ask it to import your CV or list your applications. Profile changes wait for your approval.',
    agentsAria: 'Compatible agents',
  },
  install: {
    eyebrow: 'Install',
    titleDim: 'Installed and filling',
    title: 'in about two minutes.',
    lead: 'Chrome, Arc or Edge. The guide walks you through every click.',
    download: 'Download and install',
    guide: 'Open the install guide',
    version: 'Version {version}',
    chromium: 'Chromium 116 or newer',
    source: 'or build it from source',
    previewAria: 'Install guide preview',
    preview: ['Download the zip', 'Unzip it somewhere permanent', 'Load unpacked in your browser', 'Choose your profile folder'],
  },
  faq: {
    eyebrow: 'FAQ',
    titleDim: 'Questions,',
    title: 'answered plainly.',
    lead: 'The details are in the README.',
    items: [
      {
        q: 'Is my data sent anywhere?',
        a: 'No. There is no server and no account. Only the AI provider you pick gets a request, when you ask for AI help. With Ollama, nothing leaves your computer.',
      },
      {
        q: 'Which sites and browsers does it work with?',
        a: 'Greenhouse, Lever and Ashby, plus many standard forms, in English or Spanish. Browsers: Chrome, Arc and Edge (116 or newer). Brave blocks folder access unless you turn it on in its settings.',
      },
      {
        q: 'Does AnswerOnce submit applications for me?',
        a: 'No. It fills the form and stops. Consent boxes and the Submit button are always yours.',
      },
      {
        q: 'Can I use it from Claude, Codex, Antigravity, OpenCode or Cursor?',
        a: 'Yes. Claude Desktop installs it from one file. Claude Code, Codex and Antigravity take one command; OpenCode and Cursor a short config. Then ask “import my CV into AnswerOnce”. Profile changes arrive as proposals you approve, unless you turn on direct writes.',
      },
      {
        q: 'Where exactly is my data?',
        a: 'In a folder you choose, as plain files: your profile, your applications and your CV. Keep it private and back it up.',
      },
    ],
  },
  tools: {
    title: 'More tools by carlosleoncode',
    lead: 'Small, focused tools from the same developer. Take a look.',
  },
  footer: {
    aria: 'Footer',
    tagline: 'Spend your time on the job, not the form.',
    licenseBefore: 'Open source under the',
    licenseAfter: '. Screenshots use fictional data.',
    disclaimer: 'Not affiliated with any applicant tracking system or AI provider. Product names belong to their owners.',
  },
  code: {
    copy: 'Copy',
    copied: 'Copied',
    copyFail: 'Press ⌘C',
    copyCommand: 'Copy command: {code}',
    copyAddress: 'Copy address: {url}',
  },
  guide: {
    pageTitle: 'Install AnswerOnce — step-by-step guide',
    pageDescription: 'Download AnswerOnce and load it in Chrome, Arc, Edge or Brave in eight short steps. No Chrome Web Store needed.',
    eyebrow: 'Install guide',
    titleDim: 'Install AnswerOnce',
    title: 'in about two minutes.',
    lead: 'AnswerOnce is not on the Chrome Web Store yet, so you load it yourself. Follow the steps below and tick each one off as you go. Your progress is kept on this device.',
    version: 'Version {version}',
    started: 'Your download has started. Didn’t start?',
    again: 'Download again',
    download: 'Download AnswerOnce',
    needs: 'Needs a desktop Chromium browser, version 116 or newer.',
    preferBuild: 'Prefer to build it?',
    buildLink: 'Build from source',
    stepsAria: 'Install steps',
    yourBrowser: 'Your browser',
    hint: 'The steps below use its wording.',
    progress: 'Progress',
    reset: 'Start over',
    noscript: rich(
      'The steps use Chrome’s wording. In Arc, Edge or Brave, open `arc://extensions`, `edge://extensions` or `brave://extensions` instead.',
    ),
    step: 'Step {n}',
    optional: 'Optional',
    next: 'Up next',
    done: 'Done',
    downloadFile: 'Download {file}',
    steps: [
      {
        title: 'Download the file',
        body: rich('Click **Download AnswerOnce** above. Your browser saves `{file}`{size} to your Downloads folder.'),
        note: rich(''),
      },
      {
        title: 'Unzip it',
        body: rich(
          'Double-click the zip and you get a folder named `answeronce-chrome`. Move it somewhere permanent, like Documents: the browser loads AnswerOnce from that folder every time, so keep it there.',
        ),
        note: rich('On Windows, right-click the zip and choose **Extract All**.'),
      },
      {
        title: 'Open the extensions page',
        body: rich('Open a new tab, paste this address and press Enter. Browsers don’t let web pages link to it, so copy it instead.'),
        note: rich([
          { b: 'chrome', t: 'Or open the **⋮** menu → **Extensions** → **Manage Extensions**.' },
          { b: 'arc', t: 'In Arc, press `⌘T`, paste the address and press Enter.' },
          { b: 'edge', t: 'Or open the **…** menu → **Extensions** → **Manage extensions**.' },
          { b: 'brave', t: 'Or open the **≡** menu → **Extensions**.' },
        ]),
      },
      {
        title: 'Turn on Developer mode',
        body: rich([
          { b: 'chrome arc brave', t: 'Switch on **Developer mode** in the top right corner of the extensions page. ' },
          { b: 'edge', t: 'Switch on **Developer mode** in the left sidebar of the extensions page. ' },
          'It lets the browser load an extension from a folder on your computer.',
        ]),
        note: rich(''),
      },
      {
        title: 'Load the folder',
        body: rich(
          'Click **Load unpacked**, which appears once Developer mode is on. Choose the `answeronce-chrome` folder from step 2 (the folder, not the zip) and click **Select**.',
        ),
        note: rich('AnswerOnce’s card then shows up in the list of extensions.'),
      },
      {
        title: 'Pin AnswerOnce',
        body: rich([
          { b: 'chrome brave', t: 'Click the puzzle-piece icon next to the address bar, then the pin next to AnswerOnce. ' },
          { b: 'edge', t: 'Click the puzzle-piece icon in the toolbar, then the eye icon next to AnswerOnce (Show in toolbar). ' },
          { b: 'arc', t: 'Click the puzzle-piece icon at the top of the sidebar, then pin AnswerOnce. ' },
          'Its icon stays one click away on every job application.',
        ]),
        note: rich(''),
      },
      {
        title: 'Turn on folder access',
        body: rich(
          'Brave blocks folder access for extensions by default, and AnswerOnce keeps your profile in a folder. Open a new tab, paste `brave://flags` and press Enter. Search for **File System Access API**, set it to **Enabled** and click **Relaunch**.',
        ),
        note: rich('Skip this and **Choose folder…** fails with “window.showDirectoryPicker is not a function”. It works on desktop only.'),
      },
      {
        title: 'Create your profile',
        body: rich([
          'Click the AnswerOnce icon, then ',
          { b: 'arc', t: '**Open settings** and ' },
          '**Choose folder…** and pick a new folder for your data, such as `Documents/answeronce` (not the extension folder). Click **Create profile**, then **Import your CV** to fill it in one step.',
        ]),
        note: rich([
          { b: 'chrome edge brave', t: 'AnswerOnce opens in the browser’s side panel. ' },
          { b: 'arc', t: 'In Arc, AnswerOnce opens as a floating panel inside the page. ' },
          'You can also skip the import and fill your profile by hand.',
        ]),
      },
      {
        title: 'Connect Claude',
        body: rich(
          'Download `{file}`, open it with Claude Desktop, click **Install** and choose your profile folder. Using Claude Code, Codex, Antigravity, OpenCode or Cursor instead? Open **Settings → AI agents** in AnswerOnce and follow the steps for your agent (needs Node.js 22.13 or newer).',
        ),
        note: rich(''),
      },
    ],
    finishTitle: 'That’s it. Go apply.',
    finishBody: rich('Open any job application, click the AnswerOnce icon and press **Fill this page**. Review the form and submit it yourself.'),
    trouble: {
      eyebrow: 'Troubleshooting',
      titleDim: 'Stuck?',
      title: 'Start here.',
      stillStuck: 'Still stuck?',
      issue: 'Open an issue',
      issueAfter: 'and say which browser and step.',
      items: [
        {
          q: 'I can’t find “Load unpacked”',
          a: 'Developer mode is off. Switch it on (step 4) and the Load unpacked button appears at the top of the extensions page.',
        },
        {
          q: '“Manifest file is missing or unreadable”',
          a: 'You selected the zip, or a folder one level too high or too low. Unzip first, then select the answeronce-chrome folder: the one that has manifest.json directly inside it.',
        },
        {
          q: 'How do I update AnswerOnce?',
          a: 'Download the new zip and unzip it. Replace the contents of your existing answeronce-chrome folder with the new files, then click the reload icon on AnswerOnce’s card on the extensions page. Loading a different folder installs a second copy. Your profile stays in its own folder either way.',
        },
        {
          q: 'The side panel doesn’t show up in Arc',
          a: 'Arc has no side panel for extensions, so AnswerOnce opens as a floating panel inside the page you are on. Everything else works the same.',
        },
        {
          q: 'Brave says “window.showDirectoryPicker is not a function”',
          a: 'Brave turns off folder access for websites and extensions by default. Open brave://flags, search for “File System Access API”, set it to Enabled and click Relaunch. Then click Choose folder… again. This works on desktop only.',
        },
      ],
      ollamaQ: 'Using Ollama for local AI?',
      ollamaA: rich(
        'Ollama rejects requests from browser extensions unless their origin is allowed. Set `OLLAMA_ORIGINS`, restart Ollama, then pick Ollama in Settings → AI provider.',
      ),
      ollamaMac: 'macOS app',
      ollamaServe: 'Running the server yourself',
      buildQ: 'Prefer to build from source?',
      buildBefore: 'Clone',
      buildLink: 'the source code',
      buildAfter: rich([
        '(Node 24+, pnpm 10) and build it. Then follow steps 3 to ',
        { b: 'chrome arc edge', t: '7' },
        { b: 'brave', t: '8' },
        ' and select the `.output/chrome-mv3` folder in step 5.',
      ]),
    },
    mock: { doubleClick: 'double-click', open: 'open' },
    /** Strings the guide's script writes at runtime ({name}, {n}, {total} are filled in there). */
    script: {
      detected: 'Detected {name}. The steps below use its wording.',
      chosen: 'The steps below use {name}’s wording.',
      count: '{n} of {total}',
      countLong: '{n} of {total} steps done',
      announce: '{n} of {total} steps done.',
      allDone: 'All steps done.',
      cleared: 'Progress cleared. Back to step 1.',
      mobile: 'Browser extensions need a computer. Open this page on your desktop in Chrome, Arc or Edge to install AnswerOnce.',
      notChromium: 'AnswerOnce runs in Chrome, Arc and Edge (version 116 or newer). Open this page in one of them to install it.',
    },
  },
};

export type Strings = typeof en;
