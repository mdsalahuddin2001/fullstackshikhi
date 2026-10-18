import { readFileSync, writeFileSync } from 'node:fs';

// Site chapters and endpoint JSON are the documentation source of truth.
// Run after editing them: node scripts/sync-listenyzen-downloads.mjs
const read = path => readFileSync(path, 'utf8');
const tours = JSON.parse(read('src/lib/listenyzen/code-tours.json'));
const navigation = JSON.parse(read('content/docs/listenyzen/meta.json'));
function markdown(slug) {
  const raw = read(`content/docs/listenyzen/${slug}.mdx`);
  const title = raw.match(/^title: "(.+)"$/m)?.[1] ?? slug;
  let body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
  body = body.replace(/<CodeLens tour="([^"]+)" \/>/g, (_, key) => {
    const tour = tours[key];
    return `Source: \`${tour.file}:${tour.line}\`\n\n\`\`\`typescript\n${tour.code}\n\`\`\`\n\n${tour.notes.map(note => `- **${note.label}:** ${note.detail}`).join('\n')}`;
  });
  let fenced = false;
  body = body.split('\n').map(line => {
    if (line.startsWith('```')) { fenced = !fenced; return line; }
    if (fenced) return line;
    if (/^<Card /.test(line)) return line.replace(/<Card title="([^"]+)" href="([^"]+)">(.*?)<\/Card>/, '- [$1]($2): $3');
    if (/^<Callout/.test(line)) return line.replace(/<Callout(?: title="([^"]+)")?.*>/, (_, label) => label ? `**${label}**` : '');
    if (/^<Tab value=/.test(line)) return line.replace(/<Tab value="([^"]+)">/, '### $1');
    if (/^<(?:EntityExplorer|SystemWalkthrough|AccessExplorer|SessionExplorer|SlaClock|EndpointExplorer|ApiReference|\w+)\s*\/>$/.test(line)) return '*Interactive illustration available in the website chapter.*';
    if (/^<\/?(?:Cards|Callout|Tabs|Tab|Steps|Step|details)(?:\s[^>]*)?>$/.test(line)) return '';
    return line.replace(/<summary>(.*?)<\/summary>/g, '**$1**');
  }).join('\n');
  return `# ${title}\n${body.trim()}\n`;
}
const guide = '# Listenyzen backend — database-first learning guide\n\nInspected 18 October 2026 at source revision `2a5407c`. Source-derived examples; no live API or database verification. Source paths refer to the Listenyzen repository.\n\n' + navigation.pages.filter(slug => slug !== 'index' && slug !== 'api-reference' && !slug.startsWith('---')).map(markdown).join('\n---\n\n') + '\n## Complete endpoint contracts\n\nSee [LISTENYZEN_API_REFERENCE.md](LISTENYZEN_API_REFERENCE.md) for all 121 API operations and two health checks.\n';
for (const path of ['docs/BACKEND_ONBOARDING.md', 'public/downloads/LISTENYZEN_BACKEND_ONBOARDING.md']) writeFileSync(path, guide);
const endpoints = JSON.parse(read('src/lib/listenyzen/api-reference.json'));
const header = read('docs/LISTENYZEN_API_REFERENCE.md').split('\n## POST /api/')[0].replace(/\d+ mounted API operations/, '121 mounted API operations').replace(/Inspected on \d{4}-\d{2}-\d{2}/, 'Inspected on 2026-10-18');
const reference = header + '\n\n' + endpoints.map(e => {
  const response = typeof e.response === 'string' ? e.response : JSON.stringify(e.response, null, 2);
  return `## ${e.method} ${e.path}\n\n**Source:** \`${e.source}\`\n\n**Access:** ${e.auth}\n\n**Prerequisites:** ${e.prerequisites}\n\n**Business logic:** ${e.businessLogic}\n\n**Implementation entry points:** \`${e.implementation}\`\n\n### Request example\n\n\`\`\`sh\n${e.request}\n\`\`\`\n\n### Example response — HTTP ${e.status}\n\n\`\`\`${e.contentType === 'application/json' ? 'json' : 'text'}\n${response}\n\`\`\`\n\n${e.notes.map(note => '- ' + note).join('\n')}\n\n### Validation declarations\n\n${e.validation.map(v => `**${v.kind}: ${v.name}** — \`${v.file}\`\n\n\`\`\`typescript\n${v.code}\n\`\`\``).join('\n\n') || 'See handler and service validation.'}\n\n### Error examples\n\n${e.errors.map(error => `- HTTP ${error.status}: ${error.message}`).join('\n') || 'Shared authentication, validation and service errors apply.'}\n\n### Handler code\n\n\`\`\`typescript\n${e.handler}\n\`\`\`\n`;
}).join('\n');
for (const path of ['docs/LISTENYZEN_API_REFERENCE.md', 'public/downloads/LISTENYZEN_API_REFERENCE.md']) writeFileSync(path, reference);
console.log(`Synchronized both Markdown downloads (${endpoints.length} endpoint contracts).`);
