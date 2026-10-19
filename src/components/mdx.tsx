import { HandbookProgress } from './handbook-progress';
import { ApiReference } from './listenyzen/api-reference';
import { CodeLens } from './listenyzen/code-lens';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { Step } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import type { MDXComponents } from 'mdx/types';
import type { ComponentProps } from 'react';
import { Mermaid } from './mermaid';
import { Playground } from './playground';
import { Reveal, Steps } from './present/reveal';
import { YouTube } from './youtube';
import { SystemWalkthrough, RequestFlow, EntityExplorer, AccessSimulator, SessionSimulator, SlaClock, EndpointExplorer } from './listenyzen/explorers';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    HandbookProgress,
    CodeLens,
    ApiReference,
    img: (props) => <ImageZoom {...(props as ComponentProps<typeof ImageZoom>)} />,
    Mermaid,
    Playground,
    Reveal,
    Step,
    Steps,
    Tab,
    Tabs,
    YouTube,
    SystemWalkthrough, RequestFlow, EntityExplorer, AccessSimulator, SessionSimulator, SlaClock, EndpointExplorer,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
