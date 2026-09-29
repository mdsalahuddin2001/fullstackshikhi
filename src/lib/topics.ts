import type { ComponentType, SVGProps } from 'react';
import { AiLogo, NextLogo, PostgresLogo, RedisLogo } from '@/components/brand-logos';

// Home page syllabus. Lesson lists come from each folder's meta.json.
export interface Topic {
  slug: string;
  title: string;
  description: string;
  logo: ComponentType<SVGProps<SVGSVGElement>>;
  /** Brand color from Simple Icons; undefined follows the text color (Next.js is black/white). */
  color?: string;
  tags: string[];
}

export const topics: Topic[] = [
  {
    slug: 'postgresql',
    title: 'PostgreSQL',
    description: 'SQL থেকে indexing, transactions আর performance tuning পর্যন্ত।',
    logo: PostgresLogo,
    color: '#4169E1',
    tags: ['SQL', 'Indexes', 'Transactions'],
  },
  {
    slug: 'redis',
    title: 'Redis',
    description: 'Caching, data structures, rate limiting আর queues।',
    logo: RedisLogo,
    color: '#FF4438',
    tags: ['Caching', 'Pub/Sub', 'Streams'],
  },
  {
    slug: 'nextjs',
    title: 'Next.js',
    description: 'App Router, Server Components আর production deployment।',
    logo: NextLogo,
    tags: ['App Router', 'RSC', 'Deploy'],
  },
  {
    slug: 'ai',
    title: 'AI',
    description: 'LLM দিয়ে real product — prompting, RAG, embeddings, agents।',
    logo: AiLogo,
    color: 'var(--primary)',
    tags: ['LLMs', 'RAG', 'Agents'],
  },
];
