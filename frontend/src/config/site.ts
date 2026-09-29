/** Site-wide configuration. Nothing here is invented: empty means "not configured". */

export const PUBLIC_NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/project', label: 'Project' },
  { to: '/case-studies', label: 'Case Studies' },
  { to: '/app', label: 'Mission Control' },
  { to: '/history', label: 'History' },
  { to: '/data-resources', label: 'Data Resources' },
  { to: '/contact', label: 'Contact' },
] as const

export interface TeamMember {
  name: string
  role: string
  bio?: string
  linkedin?: string
  github?: string
  email?: string
}

/** Populate to show the team section on /contact and the landing page. Leave empty to hide it. */
export const TEAM: TeamMember[] = [
  {
    name: 'Mannepalli Bala Praharsha',
    role: 'Team Lead',
    email: 'balapraharsha.m@gmail.com',
    linkedin: 'https://linkedin.com/in/mannepalli-bala-praharsha',
    github: 'https://github.com/balapraharsha',
  },
  {
    name: 'Yasasswini Idimukkala',
    role: 'Team Member 2',
    email: 'yasasswini.idimukkala.27@gmail.com',
    linkedin: 'https://www.linkedin.com/in/idimukkala-yasasswini',
    github: 'https://github.com/yasasswini08',
  },
  {
    name: 'Lakshminarasimha Karthikeya Chavala',
    role: 'Team Member 3',
    email: 'chkarthik7893@gmail.com',
    linkedin: 'https://www.linkedin.com/in/karthikeyachavala/',
    github: 'https://github.com/Karthikeya-Chavala7893',
  },
  {
    name: 'Rakesh Sankar Pydi',
    role: 'Team Member 4',
    email: 'pydirakesh2006@gmail.com',
    linkedin: 'https://linkedin.com/in/rakeshpydi',
    github: 'https://github.com/rakeshpydi',
  },
  {
    name: 'Kaustubh Thallam',
    role: 'Team Member 5',
    email: 'thallamkaustubh@gmail.com',
    linkedin: 'https://www.linkedin.com/in/kaustubhthallam/',
    github: 'https://github.com/Kaustubh-Thallam/',
  },
  {
    name: 'Deepthi Parisigani',
    role: 'Team Member 6',
    email: 'p.deepthi922@gmail.com',
    linkedin: 'https://www.linkedin.com/in/deepthi-p-364665330/',
    github: 'https://github.com/pdeepthi922-cpu',
  },
]

export const CONTACT = {
  /** Set via VITE_CONTACT_EMAIL. The contact form composes a mail to this address. */
  email: (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() ?? '',
  /** Fill in when available; rendered only when non-empty. */
  socials: { github: '', linkedin: '', youtube: '', x: '' },
  website: '',
  location: '',
} as const

export const TAGLINE = 'Seeing the Ocean. Finding the Truth.'