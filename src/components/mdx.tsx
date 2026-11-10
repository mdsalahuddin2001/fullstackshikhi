import { HandbookProgress } from './handbook-progress';
import { SchemaGraph } from './listenyzen/schema-graph';
import { IndexTable, ModelCards, ModelFields, RelationMatrix } from './listenyzen/schema-tables';
import { BrandScopeSimulator, PermissionPlayground, RequestSimulator, RouteGates, StatusMoveMatrix, TokenAnatomy } from './listenyzen-rbac/simulators';
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

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    HandbookProgress,
    img: (props) => <ImageZoom {...(props as ComponentProps<typeof ImageZoom>)} />,
    Mermaid,
    Playground,
    Reveal,
    Step,
    Steps,
    Tab,
    Tabs,
    YouTube,
    SchemaGraph,
    ModelFields,
    RelationMatrix,
    IndexTable,
    ModelCards,
    PermissionPlayground,
    RouteGates,
    RequestSimulator,
    BrandScopeSimulator,
    TokenAnatomy,
    StatusMoveMatrix,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
