import type { ComponentType, SVGProps } from 'react';
import { PostgresLogo } from '@/components/brand-logos';
import { ListenyzenLogo } from '@/components/listenyzen/logo';

// Topics shown on the home page; the brand also colors that topic's docs pages.
// Hues from Simple Icons, nudged per mode where the logo color fails 4.5:1 as text.
export interface Brand {
  light: string;
  lightForeground: string;
  dark: string;
  darkForeground: string;
}

export interface Topic {
  slug: string;
  title: string;
  description: string;
  logo: ComponentType<SVGProps<SVGSVGElement>>;
  /** Brand color per mode (docs pages + home cards); undefined keeps the site blue. */
  brand?: Brand;
  tags: string[];
}

export const topics: Topic[] = [
  {
    slug: 'postgresql-handbook',
    title: 'PostgreSQL Handbook',
    description: 'From first query to production: a 12-week path with SQL labs, challenges, worked solutions, and three capstones.',
    logo: PostgresLogo,
    brand: { light: '#27645d', lightForeground: '#ffffff', dark: '#73c9b7', darkForeground: '#151a22' },
    tags: ['Handbook', 'Hands-on labs', 'Challenges'],
  },
  {
    slug: 'listenyzen',
    title: 'Listenyzen Backend',
    description: 'Your English field guide to the codebase: architecture, schemas, access rules and the workflows behind the inbox.',
    logo: ListenyzenLogo,
    brand: { light: '#186b5b', lightForeground: '#ffffff', dark: '#63c7ae', darkForeground: '#151a22' },
    tags: ['Architecture', 'MongoDB', 'Interactive'],
  },
  {
    slug: 'postgresql',
    title: 'PostgreSQL',
    description: 'SQL থেকে indexing, transactions আর performance tuning পর্যন্ত।',
    logo: PostgresLogo,
    brand: { light: '#4169e1', lightForeground: '#ffffff', dark: '#6d8ef0', darkForeground: '#151a22' },
    tags: ['SQL', 'Indexes', 'Transactions'],
  },
];
