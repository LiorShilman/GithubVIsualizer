import { useMemo, useCallback, useState, useRef } from 'react';
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
import Dagre from '@dagrejs/dagre';
import type { GraphNode, GraphEdge } from '@/types/index.ts';
import { getExtensionColor } from '@/utils/fileIcons.ts';
import { CustomNode } from './CustomNode.tsx';
import { CategoryGroupNode } from './CategoryGroupNode.tsx';
import { NodeContextMenu } from './NodeContextMenu.tsx';
import styles from './DependencyGraph.module.css';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  searchQuery: string;
  onOpenCodeMap: (filePath: string) => void;
}

const nodeTypes = { custom: CustomNode, categoryGroup: CategoryGroupNode };

const CATEGORY_COLORS: Record<string, string> = {
  components: '#6366F1',
  services: '#14B8A6',
  store: '#F59E0B',
  utils: '#84CC16',
  hooks: '#EC4899',
  types: '#8B5CF6',
  styles: '#06B6D4',
  pages: '#EF4444',
  layouts: '#F97316',
  lib: '#A78BFA',
  assets: '#FB923C',
  config: '#64748B',
};

const FALLBACK_COLORS = [
  '#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#8B5CF6',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#A78BFA',
];

function getCategory(dir: string): string {
  const parts = dir.split('/').filter(Boolean);
  // Skip 'src' to find the meaningful category
  const start = parts[0] === 'src' ? 1 : 0;
  if (parts.length > start) return parts[start].toLowerCase();
  return parts[0]?.toLowerCase() || 'root';
}

function getCategoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function getCategoryColor(cat: string, idx: number): string {
  return CATEGORY_COLORS[cat] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

const GROUP_PAD = 40;

function layoutNodes(graphNodes: GraphNode[], allEdges: GraphEdge[]): Node[] {
  const g = new Dagre.graphlib.Graph({ compound: true }).setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: 'TB',
    nodesep: 60,
    ranksep: 100,
    edgesep: 30,
    marginx: 40,
    marginy: 40,
  });

  const exportCounts = new Map<string, number>();
  for (const edge of allEdges) {
    exportCounts.set(edge.source, (exportCounts.get(edge.source) || 0) + 1);
  }

  // Group nodes by category
  const categoryMap = new Map<string, GraphNode[]>();
  for (const node of graphNodes) {
    const cat = getCategory(node.directory);
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(node);
  }

  for (const node of graphNodes) {
    g.setNode(node.id, { width: 200, height: 50 });
  }

  for (const edge of allEdges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  Dagre.layout(g);

  // Build positioned nodes
  const positioned = graphNodes.map((node) => {
    const pos = g.node(node.id);
    const cat = getCategory(node.directory);
    return { node, x: pos.x - 100, y: pos.y - 25, cat };
  });

  // Compute bounding boxes for each category
  const categories = [...categoryMap.keys()];
  const groupNodes: Node[] = [];

  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci];
    const members = positioned.filter((p) => p.cat === cat);
    if (members.length === 0) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of members) {
      minX = Math.min(minX, m.x);
      minY = Math.min(minY, m.y);
      maxX = Math.max(maxX, m.x + 200);
      maxY = Math.max(maxY, m.y + 50);
    }

    const color = getCategoryColor(cat, ci);

    groupNodes.push({
      id: `group-${cat}`,
      type: 'categoryGroup',
      position: { x: minX - GROUP_PAD, y: minY - GROUP_PAD - 28 },
      data: {
        label: getCategoryLabel(cat),
        color,
        count: members.length,
      },
      style: {
        width: maxX - minX + GROUP_PAD * 2,
        height: maxY - minY + GROUP_PAD * 2 + 28,
      },
      selectable: false,
      draggable: false,
    });
  }

  const fileNodes: Node[] = positioned.map((p) => {
    const cat = getCategory(p.node.directory);
    const catColor = getCategoryColor(cat, categories.indexOf(cat));

    return {
      id: p.node.id,
      type: 'custom',
      position: { x: p.x, y: p.y },
      data: {
        label: p.node.label,
        extension: p.node.extension,
        color: getExtensionColor(p.node.extension),
        dirColor: catColor,
        importCount: p.node.importCount,
        exportCount: exportCounts.get(p.node.id) || 0,
        directory: p.node.directory,
        isHighlighted: false,
        isDimmed: false,
      },
    };
  });

  // Group nodes go first (rendered behind) then file nodes
  return [...groupNodes, ...fileNodes];
}

function buildEdges(graphEdges: GraphEdge[]): Edge[] {
  return graphEdges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: 'var(--text-muted)',
      strokeWidth: 1.2,
      opacity: 0.4,
      transition: 'all 0.3s ease',
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color: 'var(--text-muted)',
    },
  }));
}

export function GraphCanvas({ nodes: graphNodes, edges: graphEdges, searchQuery, onOpenCodeMap }: GraphCanvasProps) {
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    nodeLabel: string;
    position: { x: number; y: number };
  } | null>(null);

  const hoveredRef = useRef<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialNodes = useMemo(() => layoutNodes(graphNodes, graphEdges), [graphNodes, graphEdges]);
  const initialEdges = useMemo(() => buildEdges(graphEdges), [graphEdges]);

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Apply search highlighting (only when search changes, not on hover)
  useMemo(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      setFlowNodes(initialNodes.map((n) => {
        if (n.type === 'categoryGroup') return n;
        return {
          ...n,
          data: {
            ...n.data,
            isDimmed: !n.id.toLowerCase().includes(q),
            isHighlighted: n.id.toLowerCase().includes(q),
          },
        };
      }));
    } else if (!hoveredRef.current) {
      setFlowNodes(initialNodes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, initialNodes]);

  const applyHover = useCallback((nodeId: string | null) => {
    hoveredRef.current = nodeId;

    if (searchQuery) return; // Don't override search highlighting

    if (!nodeId) {
      // Reset all nodes and edges to default
      setFlowNodes((nds) =>
        nds.map((n) => {
          if (n.type === 'categoryGroup') return n;
          return { ...n, data: { ...n.data, isHighlighted: false, isDimmed: false } };
        })
      );
      setFlowEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: false,
          style: {
            ...e.style,
            stroke: 'var(--text-muted)',
            strokeWidth: 1.2,
            opacity: 0.4,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: 'var(--text-muted)',
          },
        }))
      );
      return;
    }

    // Find connected nodes
    const connectedIds = new Set<string>();
    connectedIds.add(nodeId);
    const connectedEdges = new Set<string>();
    for (const e of graphEdges) {
      if (e.source === nodeId) {
        connectedIds.add(e.target);
        connectedEdges.add(`${e.source}->${e.target}`);
      }
      if (e.target === nodeId) {
        connectedIds.add(e.source);
        connectedEdges.add(`${e.source}->${e.target}`);
      }
    }

    setFlowNodes((nds) =>
      nds.map((n) => {
        if (n.type === 'categoryGroup') return n;
        return {
          ...n,
          data: {
            ...n.data,
            isDimmed: !connectedIds.has(n.id),
            isHighlighted: n.id === nodeId,
          },
        };
      })
    );

    setFlowEdges((eds) =>
      eds.map((e) => {
        const edgeKey = `${e.source}->${e.target}`;
        const isActive = connectedEdges.has(edgeKey);
        return {
          ...e,
          animated: isActive,
          style: {
            ...e.style,
            stroke: isActive ? 'var(--accent)' : 'var(--text-muted)',
            strokeWidth: isActive ? 2.5 : 1.2,
            opacity: isActive ? 0.9 : 0.08,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: isActive ? 'var(--accent)' : 'var(--text-muted)',
          },
        };
      })
    );
  }, [graphEdges, searchQuery, setFlowNodes, setFlowEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'categoryGroup') return;
    const rect = (_.target as HTMLElement).closest('.react-flow__node')?.getBoundingClientRect();
    const x = rect ? Math.min(rect.right + 8, window.innerWidth - 340) : _.clientX;
    const y = rect ? Math.min(rect.top, window.innerHeight - 400) : _.clientY;

    setContextMenu({
      nodeId: node.id,
      nodeLabel: (node.data as { label: string }).label,
      position: { x, y },
    });
  }, []);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'categoryGroup') return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoveredRef.current = node.id;
    hoverTimerRef.current = setTimeout(() => {
      if (hoveredRef.current === node.id) {
        applyHover(node.id);
      }
    }, 400);
  }, [applyHover]);

  const onNodeMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoveredRef.current = null;
    applyHover(null);
  }, [applyHover]);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div className={styles.canvas}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.05}
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
            if (node.type === 'categoryGroup') return 'transparent';
            return (node.data as { color?: string })?.color || 'var(--text-muted)';
          }}
        />
      </ReactFlow>

      {contextMenu && (
        <NodeContextMenu
          nodeId={contextMenu.nodeId}
          nodeLabel={contextMenu.nodeLabel}
          position={contextMenu.position}
          edges={graphEdges}
          onClose={() => setContextMenu(null)}
          onOpenCodeMap={onOpenCodeMap}
        />
      )}
    </div>
  );
}
