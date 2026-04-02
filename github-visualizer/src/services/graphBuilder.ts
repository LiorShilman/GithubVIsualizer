import type { GraphNode, GraphEdge } from '@/types/index.ts';
import { getExtension } from '@/utils/fileIcons.ts';

interface BuildGraphInput {
  edges: { source: string; target: string }[];
  filePaths: string[];
}

export function buildGraph(input: BuildGraphInput): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const { edges, filePaths } = input;

  const importCounts = new Map<string, number>();
  for (const edge of edges) {
    importCounts.set(edge.target, (importCounts.get(edge.target) || 0) + 1);
  }

  const filesInGraph = new Set<string>();
  for (const edge of edges) {
    filesInGraph.add(edge.source);
    filesInGraph.add(edge.target);
  }

  const nodes: GraphNode[] = [];
  for (const path of filePaths) {
    if (!filesInGraph.has(path)) continue;

    const parts = path.split('/');
    const label = parts[parts.length - 1];
    const directory = parts.slice(0, -1).join('/') || '/';
    const extension = getExtension(label);

    nodes.push({
      id: path,
      label,
      directory,
      extension,
      importCount: importCounts.get(path) || 0,
    });
  }

  const validNodes = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => validNodes.has(e.source) && validNodes.has(e.target)
  );

  return { nodes, edges: validEdges };
}
