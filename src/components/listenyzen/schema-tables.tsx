import { DOMAINS, MODELS, RELATIONS, modelByName, type Domain } from '@/lib/listenyzen/schema-map';

// Tables generated from the model map, so every chapter reads the same facts.

const TIME = {
  baseSchema: 'createdAt / updatedAt from baseSchema (both indexed)',
  timestamps: 'createdAt / updatedAt from { timestamps: true } (not indexed)',
  createdAt: 'createdAt only',
  none: 'no timestamps',
} as const;

function Flags({ f }: { f: (typeof MODELS)[number]['fields'][number] }) {
  return (
    <span className="lz-flags">
      {f.req && <b data-k="req">required</b>}
      {f.unique && <b data-k="uniq">unique</b>}
      {f.immutable && <b data-k="imm">immutable</b>}
      {f.hidden && <b data-k="hidden">select: false</b>}
      {f.denorm && <b data-k="denorm">copy</b>}
    </span>
  );
}

/** Every field of one model: type, flags, default, what it points at. */
export function ModelFields({ model: name }: { model: string }) {
  const model = modelByName(name);
  if (!model) throw new Error(`Unknown model ${name}`);
  return (
    <div className="lz-table not-prose">
      <div className="lz-table-head" style={{ '--lz-domain': DOMAINS[model.domain].color } as React.CSSProperties}>
        <strong>{model.name}</strong>
        <code>db.{model.collection}</code>
        <span>{TIME[model.time]}</span>
        {model.variants && <span>Variants: {model.variants.map(v => `${v.name} (${v.key}: '${v.value}')`).join(', ')}</span>}
      </div>
      <div className="lz-scroll">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type · default</th>
              <th>Points to · meaning</th>
            </tr>
          </thead>
          <tbody>
            {model.fields.map(f => (
              <tr key={f.n} data-nested={f.n.includes('.') || undefined}>
                <td>
                  <code>{f.n}</code>
                  <Flags f={f} />
                </td>
                <td>
                  <code>{f.t}</code>
                  {f.def && (
                    <small>
                      {' '}
                      default <code>{f.def}</code>
                    </small>
                  )}
                </td>
                <td>
                  {f.ref ? <b className="lz-ref">→ {f.ref} </b> : f.poly ? <span className="lz-poly">→ {f.poly.join(' | ')} </span> : null}
                  {f.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Which model holds an id of which: rows hold the id, columns are pointed at. */
export function RelationMatrix({ domains, scope = false }: { domains?: Domain[]; scope?: boolean }) {
  const rows = MODELS.filter(m => !domains || domains.includes(m.domain));
  const relations = RELATIONS.filter(r => scope || !r.scope);
  const cols = MODELS.filter(m => relations.some(r => r.to === m.name && rows.some(row => row.name === r.from)));
  return (
    <div className="lz-matrix not-prose lz-scroll">
      <table>
        <thead>
          <tr>
            <th>holds id of →</th>
            {cols.map(c => (
              <th key={c.name} style={{ color: DOMAINS[c.domain].color }}>
                <span>{c.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.name}>
              <th style={{ color: DOMAINS[row.domain].color }}>{row.name}</th>
              {cols.map(col => {
                const hits = relations.filter(r => r.from === row.name && r.to === col.name);
                return (
                  <td key={col.name} data-hit={hits.length ? hits.every(h => h.kind === 'poly') ? 'poly' : 'ref' : undefined} title={hits.map(h => h.field).join(', ')}>
                    {hits.map(h => (h.kind === 'many' ? `${h.field}[]` : h.field)).join(', ')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every declared index, per model. */
export function IndexTable({ domains }: { domains?: Domain[] }) {
  const models = MODELS.filter(m => !domains || domains.includes(m.domain));
  return (
    <div className="lz-table not-prose lz-scroll">
      <table>
        <thead>
          <tr>
            <th>Collection</th>
            <th>Index</th>
            <th>Kind</th>
          </tr>
        </thead>
        <tbody>
          {models.flatMap(m =>
            m.indexes.map((ix, i) => {
              const kinds = [ix.includes('!') && 'unique', ix.includes('partial') && 'partial', ix.includes('sparse') && 'sparse', ix.includes('TTL') && 'TTL', ix.includes('multikey') && 'multikey', ix.includes('collation') && 'collation'].filter(Boolean);
              return (
                <tr key={m.name + i}>
                  {i === 0 && (
                    <td rowSpan={m.indexes.length} style={{ color: DOMAINS[m.domain].color }}>
                      <strong>{m.collection}</strong>
                    </td>
                  )}
                  <td>
                    <code>{ix.replace(/ !/, '').replace(/ (partial|sparse|TTL).*$/, '').replace(/ \((multikey|case-insensitive collation)\)/, '')}</code>
                    {/partial:/.test(ix) && <small> where {ix.split('partial:')[1].trim()}</small>}
                  </td>
                  <td>
                    <span className="lz-flags">
                      {kinds.map(k => (
                        <b key={String(k)} data-k={String(k)}>
                          {k}
                        </b>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/** One card per model of a domain: collection, purpose, size. */
export function ModelCards({ domains }: { domains?: Domain[] }) {
  return (
    <div className="lz-cards not-prose">
      {MODELS.filter(m => !domains || domains.includes(m.domain)).map(m => (
        <a key={m.name} href={`/docs/listenyzen/${DOMAINS[m.domain].page}#${m.name.toLowerCase()}`} style={{ '--lz-domain': DOMAINS[m.domain].color } as React.CSSProperties}>
          <span className="lz-eyebrow">{DOMAINS[m.domain].label}</span>
          <strong>{m.name}</strong>
          <code>{m.collection}</code>
          <p>{m.summary}</p>
          <small>
            {m.fields.filter(f => !f.n.includes('.')).length} fields · {m.indexes.length} indexes · {RELATIONS.filter(r => r.from === m.name).length} outgoing links
          </small>
        </a>
      ))}
    </div>
  );
}
