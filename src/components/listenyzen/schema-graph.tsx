'use client';

import '@xyflow/react/dist/style.css';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { DOMAINS, MODELS, RELATIONS, modelByName, type Domain, type Model } from '@/lib/listenyzen/schema-map';

// Interactive map of every Listenyzen model: drag, zoom, click a model to see what it points at
// and what points at it.

const COLUMN = 250;
const ROW = 96;
// Four columns, roughly square so it fits the page: owners, configuration, the work, derived data.
const POSITION: Record<string, [number, number]> = {
  Company: [0, 0],
  User: [0, 1.5],
  Department: [0, 3],
  Team: [0, 4],
  File: [0, 6.5],
  Brand: [1, 0],
  BrandTag: [1, 1],
  FixedReply: [1, 2],
  Setting: [1, 3],
  AlertRule: [1, 5],
  NotificationMute: [1, 6],
  Notification: [1, 7],
  Customer: [2, 0],
  Conversation: [2, 1],
  Message: [2, 2],
  Session: [2, 3],
  SessionNote: [2, 4],
  Comment: [2, 5.5],
  QueryHandling: [3, 0],
  QueryTurn: [3, 1],
  OverviewDay: [3, 2.5],
  CustomerWeek: [3, 3.5],
  RollupDay: [3, 4.5],
  RollupRun: [3, 5.5],
  RollupRunDay: [3, 6.5],
  RollupDirtyDay: [3, 7.5],
};

const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
};
const htmlTheme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

type ModelNode = Node<{ model: Model; dim: boolean; active: boolean }, 'model'>;

function ModelBox({ data }: NodeProps<ModelNode>) {
  const { model, dim, active } = data;
  const color = DOMAINS[model.domain].color;
  return (
    <div className="lz-node" data-dim={dim || undefined} data-active={active || undefined} style={{ '--lz-domain': color } as React.CSSProperties}>
      <Handle type="target" position={Position.Left} />
      <strong>{model.name}</strong>
      <span>
        {model.collection} · {model.fields.filter(f => !f.n.includes('.')).length} fields
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { model: ModelBox };

export function SchemaGraph({ domains, height = 640 }: { domains?: Domain[]; height?: number }) {
  const theme = useSyncExternalStore(subscribe, htmlTheme, () => 'light');
  const [selected, setSelected] = useState<string | null>(null);
  const [scope, setScope] = useState(false);
  const [poly, setPoly] = useState(true);
  const [full, setFull] = useState(false);

  // Focus domains and the models they touch directly.
  const visible = useMemo(() => {
    if (!domains?.length) return new Set(MODELS.map(m => m.name));
    const core = new Set(MODELS.filter(m => domains.includes(m.domain)).map(m => m.name));
    const names = new Set(core);
    for (const r of RELATIONS) {
      if (r.scope && !scope) continue;
      if (core.has(r.from)) names.add(r.to);
      if (core.has(r.to)) names.add(r.from);
    }
    return names;
  }, [domains, scope]);

  const relations = useMemo(
    () => RELATIONS.filter(r => visible.has(r.from) && visible.has(r.to) && (scope || !r.scope) && (poly || r.kind !== 'poly')),
    [visible, scope, poly]
  );
  const linked = useMemo(() => {
    if (!selected) return null;
    const names = new Set([selected]);
    for (const r of relations) if (r.from === selected || r.to === selected) names.add(r.from === selected ? r.to : r.from);
    return names;
  }, [selected, relations]);

  // A chapter's graph: what its models point to on the left, the models in the middle, what points
  // at them on the right. The full map uses the fixed POSITION grid.
  const layout = useMemo(() => {
    if (!domains?.length) return null;
    const columns: string[][] = [[], [], []];
    for (const m of MODELS) {
      if (!visible.has(m.name)) continue;
      if (domains.includes(m.domain)) columns[1].push(m.name);
      else if (RELATIONS.some(r => r.to === m.name && visible.has(r.from) && domains.includes(modelByName(r.from)!.domain))) columns[0].push(m.name);
      else columns[2].push(m.name);
    }
    const tallest = Math.max(...columns.map(c => c.length));
    const at = new Map<string, [number, number]>();
    columns.forEach((names, col) => names.forEach((name, i) => at.set(name, [col * 1.15, i + (tallest - names.length) / 2])));
    return at;
  }, [domains, visible]);

  const nodes: ModelNode[] = MODELS.filter(m => visible.has(m.name)).map(model => {
    const [col, row] = layout?.get(model.name) ?? POSITION[model.name] ?? [4, 0];
    const outside = Boolean(domains?.length) && !domains!.includes(model.domain);
    return {
      id: model.name,
      type: 'model',
      position: { x: col * COLUMN, y: row * ROW },
      data: { model, dim: (linked ? !linked.has(model.name) : false) || (outside && !linked), active: selected === model.name },
    };
  });

  // Several fields between the same pair become one edge with every field in its label.
  const edges: Edge[] = useMemo(() => {
    const grouped = new Map<string, typeof relations>();
    for (const r of relations) {
      const key = `${r.from}>${r.to}`;
      grouped.set(key, [...(grouped.get(key) ?? []), r]);
    }
    return [...grouped.entries()].map(([key, group]) => {
      const [from, to] = key.split('>');
      const touches = selected === from || selected === to;
      const isPoly = group.every(r => r.kind === 'poly');
      const color = touches ? DOMAINS[modelByName(from)!.domain].color : 'var(--lz-edge)';
      return {
        id: key,
        source: from,
        target: to,
        type: 'smoothstep',
        label: touches
          ? (() => {
              const names = group.map(r => (r.kind === 'many' ? `${r.field}[]` : r.field));
              return names.length > 2 ? `${names[0]} +${names.length - 1} more` : names.join(', ');
            })()
          : undefined,
        animated: touches && isPoly,
        style: {
          stroke: color,
          strokeWidth: touches ? 2.2 : group.some(r => r.kind === 'many') ? 1.6 : 1.1,
          strokeDasharray: isPoly ? '6 4' : undefined,
          opacity: selected && !touches ? 0.12 : 1,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        labelBgPadding: [4, 2] as [number, number],
        labelStyle: { fontSize: 11, fontFamily: 'var(--font-mono)' },
        zIndex: touches ? 10 : 0,
      };
    });
  }, [relations, selected]);

  const model = selected ? modelByName(selected) : undefined;
  const outgoing = relations.filter(r => r.from === selected);
  const incoming = relations.filter(r => r.to === selected);

  return (
    <div className="lz-graph not-prose" data-full={full || undefined}>
      <div className="lz-graph-bar">
        <label>
          <input type="checkbox" checked={scope} onChange={e => setScope(e.target.checked)} /> Tenant-scope copies (companyId, copied brandId)
        </label>
        <label>
          <input type="checkbox" checked={poly} onChange={e => setPoly(e.target.checked)} /> Polymorphic ids (dashed)
        </label>
        <span className="lz-graph-hint">Click a model · drag · scroll to zoom</span>
        <button className="lz-graph-full" onClick={() => setFull(!full)}>
          {full ? 'Close full screen' : 'Full screen'}
        </button>
      </div>
      <div className="lz-graph-body">
        <div className="lz-graph-canvas" style={full ? undefined : { height }}>
          <ReactFlow
            key={String(full)}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode={theme as 'light' | 'dark'}
            fitView
            fitViewOptions={{ padding: 0.08 }}
            minZoom={0.2}
            onNodeClick={(_, node) => setSelected(node.id === selected ? null : node.id)}
            onPaneClick={() => setSelected(null)}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
          >
            <Background gap={22} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside className="lz-graph-panel" aria-live="polite">
          {model ? (
            <>
              <p className="lz-eyebrow" style={{ color: DOMAINS[model.domain].color }}>
                {DOMAINS[model.domain].label}
              </p>
              <h3>{model.name}</h3>
              <code>{model.collection}</code>
              <p>{model.summary}</p>
              <h4>Points to ({outgoing.length})</h4>
              <ul>
                {outgoing.map(r => (
                  <li key={r.field + r.to}>
                    <code>{r.field}</code> →{' '}
                    <button onClick={() => setSelected(r.to)}>{r.to}</button>
                    {r.kind === 'poly' && <em> (one of several)</em>}
                  </li>
                ))}
                {!outgoing.length && <li>Nothing.</li>}
              </ul>
              <h4>Pointed at by ({incoming.length})</h4>
              <ul>
                {incoming.map(r => (
                  <li key={r.from + r.field}>
                    <button onClick={() => setSelected(r.from)}>{r.from}</button>.<code>{r.field}</code>
                  </li>
                ))}
                {!incoming.length && <li>Nothing.</li>}
              </ul>
              <a href={`/docs/listenyzen/${DOMAINS[model.domain].page}#${model.name.toLowerCase()}`}>Open the chapter →</a>
            </>
          ) : (
            <>
              <h3>Legend</h3>
              <ul className="lz-legend">
                {(Object.keys(DOMAINS) as Domain[])
                  .filter(d => MODELS.some(m => m.domain === d && visible.has(m.name)))
                  .map(d => (
                    <li key={d}>
                      <i style={{ background: DOMAINS[d].color }} />
                      {DOMAINS[d].label}
                    </li>
                  ))}
              </ul>
              <p>Arrow: the model holding the id → the model it points at. Thick: an array of ids. Dashed: the target depends on another field.</p>
              <p>Select a model to list its links in both directions.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
