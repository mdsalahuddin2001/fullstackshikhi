import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MODELS, SNAPSHOT } from '../src/lib/listenyzen/schema-map.ts';

// Copies Listenyzen's schema files verbatim into the chapters, between
//   {/* schema: server/src/modules/x/schema.ts */}  …  {/* /schema */}
// and checks that every field in src/lib/listenyzen/schema-map.ts still exists in its file.
//   node --no-warnings scripts/sync-listenyzen-schemas.mjs           # rewrite the code blocks
//   node --no-warnings scripts/sync-listenyzen-schemas.mjs --check   # fail if anything drifted
// LISTENYZEN_DIR points at the Listenyzen checkout (default ~/Developer/Analyzen/listenyzen-v2.0).

const repo = process.env.LISTENYZEN_DIR ?? join(homedir(), 'Developer/Analyzen/listenyzen-v2.0');
const check = process.argv.includes('--check');
const pages = 'content/docs/listenyzen';
const problems = [];

const source = path => {
  const full = join(repo, path);
  if (!existsSync(full)) throw new Error(`Missing ${full}`);
  return readFileSync(full, 'utf8').replace(/\s+$/, '');
};

const block = path => {
  const code = source(path);
  const fence = '`'.repeat(Math.max(3, ...[...code.matchAll(/`{3,}/g)].map(m => m[0].length + 1)));
  return `{/* schema: ${path} */}\n${fence}ts title="${path}" lineNumbers\n${code}\n${fence}\n{/* /schema */}`;
};

let blocks = 0;
for (const name of readdirSync(pages).filter(file => file.endsWith('.mdx'))) {
  const file = join(pages, name);
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/\{\/\* schema: (\S+) \*\/\}[\s\S]*?\{\/\* \/schema \*\/\}/g, (_, path) => {
    blocks += 1;
    return block(path);
  });
  if (after === before) continue;
  if (check) problems.push(`${file}: schema code differs from ${repo}`);
  else writeFileSync(file, after);
}

// Every documented field must still be declared in its schema file (last path segment).
for (const model of MODELS) {
  const code = source(model.file);
  for (const field of model.fields) {
    const leaf = field.n.split('.').pop().replace('[]', '');
    if (!new RegExp(`\\b${leaf}\\??:`).test(code)) problems.push(`${model.name}.${field.n}: not found in ${model.file}`);
  }
  if (!code.includes(`'${model.name}'`)) problems.push(`${model.name}: model name not found in ${model.file}`);
}

const head = (() => {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();
if (check && head !== SNAPSHOT.revision) problems.push(`Checkout is ${head}, documented revision is ${SNAPSHOT.revision}`);
console.log(`${blocks} schema blocks, ${MODELS.length} models; documented revision ${SNAPSHOT.revision}, checkout ${head}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
