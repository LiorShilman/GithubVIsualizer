import { useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Boxes } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { detectArchitecture } from '@/services/architectureDetector.ts';
import { ArchNode, TYPE_COLORS } from './ArchNode.tsx';
import styles from './Architecture.module.css';

const nodeTypes = { arch: ArchNode };

// Layout positions for architecture tiers (top to bottom)
const TIER_LAYOUT: Record<string, { tier: number; order: number }> = {
  ci: { tier: 0, order: 0 },
  frontend: { tier: 1, order: 0 },
  testing: { tier: 1, order: 1 },
  api: { tier: 2, order: 0 },
  auth: { tier: 2, order: 1 },
  backend: { tier: 3, order: 0 },
  external: { tier: 3, order: 1 },
  cache: { tier: 4, order: 0 },
  storage: { tier: 4, order: 1 },
  database: { tier: 5, order: 0 },
};

const TIER_X_START = 100;
const TIER_Y_GAP = 200;
const NODE_X_GAP = 320;

function layoutArchitecture(
  components: ReturnType<typeof detectArchitecture>['components'],
  connections: ReturnType<typeof detectArchitecture>['connections']
): { nodes: Node[]; edges: Edge[] } {
  // Group components by tier
  const tiers = new Map<number, typeof components>();
  for (const comp of components) {
    const layout = TIER_LAYOUT[comp.type] || { tier: 3, order: 0 };
    if (!tiers.has(layout.tier)) tiers.set(layout.tier, []);
    tiers.get(layout.tier)!.push(comp);
  }

  const nodes: Node[] = [];

  // Position nodes by tier
  for (const [tier, comps] of tiers) {
    const totalWidth = comps.length * NODE_X_GAP;
    const startX = TIER_X_START + (800 - totalWidth) / 2;

    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i];
      const color = TYPE_COLORS[comp.type] || '#6366F1';

      nodes.push({
        id: comp.id,
        type: 'arch',
        position: { x: startX + i * NODE_X_GAP, y: tier * TIER_Y_GAP },
        data: {
          label: comp.label,
          tech: comp.tech,
          icon: comp.icon,
          componentType: comp.type,
          color,
          fileCount: comp.files.length,
        },
      });
    }
  }

  // Create animated edges
  const edges: Edge[] = connections.map((conn, idx) => {
    const fromComp = components.find((c) => c.id === conn.from);
    const toComp = components.find((c) => c.id === conn.to);
    if (!fromComp || !toComp) return null;

    const fromColor = TYPE_COLORS[fromComp.type] || '#6366F1';

    return {
      id: `arch-e-${idx}`,
      source: conn.from,
      target: conn.to,
      type: 'smoothstep',
      animated: conn.animated,
      label: conn.label,
      labelStyle: {
        fontSize: 10,
        fontWeight: 600,
        fill: 'var(--text-muted)',
      },
      labelBgStyle: {
        fill: 'var(--bg-primary)',
        fillOpacity: 0.85,
      },
      style: {
        stroke: fromColor,
        strokeWidth: 2,
        opacity: 0.6,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 10,
        height: 10,
        color: fromColor,
      },
    };
  }).filter(Boolean) as Edge[];

  return { nodes, edges };
}

export function Architecture() {
  const tree = useRepoStore((s) => s.tree);

  const { components, connections } = useMemo(() => {
    if (tree.length === 0) return { components: [], connections: [] };
    return detectArchitecture(tree);
  }, [tree]);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    return layoutArchitecture(components, connections);
  }, [components, connections]);

  const [, , onNodesChange] = useNodesState(layoutNodes);
  const [, , onEdgesChange] = useEdgesState(layoutEdges);

  if (components.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Boxes size={48} strokeWidth={1} />
          <p>
            No architecture components detected. Load a repository with a
            recognizable project structure (frontend, backend, API, database, etc.)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <span className={styles.title}>
          <Boxes size={16} />
          Architecture Map
        </span>
        <div className={styles.legend}>
          {components.map((comp) => (
            <span key={comp.id} className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: TYPE_COLORS[comp.type] }}
              />
              {comp.icon} {comp.tech}
            </span>
          ))}
        </div>
        <span className={styles.stats}>
          {components.length} components · {connections.length} connections
        </span>
      </div>

      <div className={styles.canvas}>
        <ReactFlow
          nodes={layoutNodes}
          edges={layoutEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            pannable
            zoomable
            style={{ background: 'var(--bg-secondary)', borderRadius: 8 }}
            maskColor="rgba(0,0,0,0.25)"
            nodeColor={(node) => {
              return (node.data as { color?: string })?.color || 'var(--text-muted)';
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
