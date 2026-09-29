import { Database, Layers, Sparkles, Zap, type LucideIcon } from 'lucide-react';

// Home page topic cards. Sidebar tabs come from each folder's meta.json.
export interface Topic {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tags: string[];
}

export const topics: Topic[] = [
  {
    slug: 'postgresql',
    title: 'PostgreSQL',
    description: 'SQL থেকে indexing, transactions আর performance tuning পর্যন্ত।',
    icon: Database,
    tags: ['SQL', 'Indexes', 'Transactions'],
  },
  {
    slug: 'redis',
    title: 'Redis',
    description: 'Caching, data structures, rate limiting আর queues।',
    icon: Zap,
    tags: ['Caching', 'Pub/Sub', 'Streams'],
  },
  {
    slug: 'nextjs',
    title: 'Next.js',
    description: 'App Router, Server Components আর production deployment।',
    icon: Layers,
    tags: ['App Router', 'RSC', 'Deploy'],
  },
  {
    slug: 'ai',
    title: 'AI',
    description: 'LLM দিয়ে real product — prompting, RAG, embeddings, agents।',
    icon: Sparkles,
    tags: ['LLMs', 'RAG', 'Agents'],
  },
];
