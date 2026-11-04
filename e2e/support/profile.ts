/** Test data. Personal values are distinctive so they can be searched for in storage. */

export const ADA = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada.lovelace@example.com',
  phone: '+44 20 7946 0958',
  location: 'London, United Kingdom',
  city: 'London',
  country: 'United Kingdom',
  linkedin: 'https://linkedin.com/in/ada-lovelace',
  github: 'https://github.com/ada-lovelace',
  portfolio: 'https://ada-lovelace.example.com',
  title: 'Principal Engineer',
  company: 'Analytical Engines Ltd',
  countriesAuthorized: ['Spain'],
  needsSponsorship: false,
  noticePeriod: '30 days',
  expectedSalary: '90000',
  salaryCurrency: 'EUR',
  willingToRelocate: true,
  workModes: ['Remote'],
} as const;

export type TestProfile = typeof ADA;

/** Values that must never appear in browser storage (only in the folder, the session cache and the filled page). */
export const ADA_SECRETS = [ADA.lastName, ADA.email, ADA.phone, ADA.linkedin, ADA.company, ADA.expectedSalary];

/** Structured CV the stub Ollama returns. Contact details match tests/fixtures/sample-cv.* literally. */
export const CV_MODEL_JSON = {
  personal: {
    firstName: 'Jordan',
    lastName: 'Rivera',
    email: 'jordan.rivera@example.com',
    phone: '+351 912 345 678',
    location: 'Lisbon, Portugal',
    city: 'Lisbon',
    country: 'Portugal',
  },
  links: { linkedin: 'https://linkedin.com/in/jordan-rivera-dev', github: 'https://github.com/jrivera-dev', portfolio: 'https://jordanrivera.dev' },
  headline: 'Senior Frontend Engineer',
  summary: 'Frontend engineer with 8 years of experience building accessible, fast web applications with TypeScript and React.',
  skills: ['TypeScript', 'React', 'Node.js', 'GraphQL', 'Accessibility', 'Testing Library'],
  workAuthorization: { countriesAuthorized: ['Portugal'], needsSponsorship: false },
  experience: [
    {
      company: 'Lumen Analytics',
      title: 'Senior Frontend Engineer',
      location: 'Lisbon',
      startDate: '2021-03',
      endDate: '',
      current: true,
      description: 'Led the migration of the analytics dashboard to React 18 and a design system used by 6 teams.',
    },
    {
      company: 'Northwind Labs',
      title: 'Frontend Developer',
      location: 'Porto',
      startDate: '2017-06',
      endDate: '2021-02',
      current: false,
      description: 'Built customer-facing booking flows and improved Core Web Vitals by 40%.',
    },
  ],
  education: [{ school: 'Universidade de Lisboa', degree: 'BSc', field: 'Computer Science', startDate: '2013', endDate: '2017' }],
};

/** Personal values found in tests/fixtures/sample-cv.*. */
export const CV_SECRETS = ['Jordan', 'Rivera', 'jordan.rivera@example.com', '+351 912 345 678', 'Lumen Analytics', 'Universidade de Lisboa'];
