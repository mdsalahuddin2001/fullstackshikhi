import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="size-6">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M9 11l5 5-5 5M16 21h7"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
    </svg>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Logo />
          <span className="font-semibold tracking-tight">{appName}</span>
        </>
      ),
    },
    links: [{ text: 'Docs', url: '/docs', active: 'nested-url', on: 'nav' }],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
