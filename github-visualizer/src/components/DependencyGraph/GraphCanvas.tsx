import { useMemo, useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
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

  // Build export counts
  const exportCounts = new Map<string, number>();
  for (const edge of allEdges) {
    exportCounts.set(edge.source, (exportCounts.get(edge.source) || 0) + 1);
  }

  for (const node of graphNodes) {
    g.setNode(node.id, { width: 200, height: 50 });
  }

  for (const edge of allEdges) {
    // Only add edges between nodes that exist in our set
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

export function GraphCanvas({ nodes: graphNodes, edges: graphEdges, searchQuery, onOpenCodeMap }: GraphCanvasProps) {
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    nodeLabel: string;
    position: { x: number; y: number };
  } | null>(null);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const laidOutNodes = useMemo(() => layoutNodes(graphNodes, graphEdges), [graphNodes, graphEdges]);

  const styledNodes = useMemo(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return laidOutNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isDimmed: !n.id.toLowerCase().includes(q),
          isHighlighted: n.id.toLowerCase().includes(q),
        },
      }));
    }

    if (hoveredNodeId) {
      const connectedIds = new Set<string>();
      connectedIds.add(hoveredNodeId);
      for (const e of graphEdges) {
        if (e.source === hoveredNodeId) connectedIds.add(e.target);
        if (e.target === hoveredNodeId) connectedIds.add(e.source);
      }
      return laidOutNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isDimmed: !connectedIds.has(n.id),
          isHighlighted: n.id === hoveredNodeId,
        },
      }));
    }

    return laidOutNodes;
  }, [laidOutNodes, graphEdges, searchQuery, hoveredNodeId]);

  const styledEdges = useMemo((): Edge[] => {
    const connectedToHover = new Set<string>();
    if (hoveredNodeId) {
      for (const e of graphEdges) {
        if (e.source === hoveredNodeId || e.target === hoveredNodeId) {
          connectedToHover.add(`${e.source}->${e.target}`);
        }
      }
    }

    return graphEdges.map((e, i) => {
      const edgeKey = `${e.source}->${e.target}`;
      const isActive = hoveredNodeId ? connectedToHover.has(edgeKey) : false;

      return {
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        animated: isActive,
        style: {
          stroke: isActive ? 'var(--accent)' : 'var(--text-muted)',
          strokeWidth: isActive ? 2.5 : 1.2,
          opacity: hoveredNodeId ? (isActive ? 0.9 : 0.08) : 0.4,
          transition: 'all 0.3s ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: isActive ? 'var(--accent)' : 'var(--text-muted)',
        },
      };
    });
  }, [graphEdges, hoveredNodeId]);

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
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div className={styles.canvas}>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
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
