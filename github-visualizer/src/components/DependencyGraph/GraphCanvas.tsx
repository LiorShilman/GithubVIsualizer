import { useMemo, useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import type { GraphNode, GraphEdge } from '@/types/index.ts';
import { getExtensionColor } from '@/utils/fileIcons.ts';
import { CustomNode } from './CustomNode.tsx';
import { NodeContextMenu } from './NodeContextMenu.tsx';
import styles from './DependencyGraph.module.css';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  searchQuery: string;
  onOpenCodeMap: (filePath: string) => void;
}

const nodeTypes = { custom: CustomNode };

const DIR_COLORS = [
  '#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#8B5CF6',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#A78BFA',
];

function getDirColor(dir: string): string {
  let hash = 0;
  for (let i = 0; i < dir.length; i++) {
    hash = dir.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DIR_COLORS[Math.abs(hash) % DIR_COLORS.length];
}

function layoutNodes(graphNodes: GraphNode[], allEdges: GraphEdge[]): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

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

  for (const node of graphNodes) {
    g.setNode(node.id, { width: 200, height: 50 });
  }

  for (const edge of allEdges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  Dagre.layout(g);

  return graphNodes.map((node) => {
    const pos = g.node(node.id);
    const dirColor = getDirColor(node.directory);

    return {
      id: node.id,
      type: 'custom',
      position: { x: pos.x - 100, y: pos.y - 25 },
      data: {
        label: node.label,
        extension: node.extension,
        color: getExtensionColor(node.extension),
        dirColor,
        importCount: node.importCount,
        exportCount: exportCounts.get(node.id) || 0,
        directory: node.directory,
        isHighlighted: false,
        isDimmed: false,
      },
    };
  });
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
      setFlowNodes(initialNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isDimmed: !n.id.toLowerCase().includes(q),
          isHighlighted: n.id.toLowerCase().includes(q),
        },
      })));
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
        nds.map((n) => ({
          ...n,
          data: { ...n.data, isHighlighted: false, isDimmed: false },
        }))
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
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isDimmed: !connectedIds.has(n.id),
          isHighlighted: n.id === nodeId,
        },
      }))
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
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          style={{ background: 'var(--bg-secondary)', borderRadius: 8 }}
          maskColor="rgba(0,0,0,0.15)"
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
