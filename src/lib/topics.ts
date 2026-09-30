import type { ComponentType, SVGProps } from 'react';
import { PostgresLogo } from '@/components/brand-logos';

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
    slug: 'postgresql',
    title: 'PostgreSQL',
    description: 'SQL থেকে indexing, transactions আর performance tuning পর্যন্ত।',
    logo: PostgresLogo,
    brand: { light: '#4169e1', lightForeground: '#ffffff', dark: '#6d8ef0', darkForeground: '#151a22' },
    tags: ['SQL', 'Indexes', 'Transactions'],
  },
];
