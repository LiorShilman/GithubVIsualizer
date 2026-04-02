import { useState, useMemo, useCallback } from 'react';
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
import { GitBranch, Loader2 } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { parseRepoUrl, fetchBranches, fetchBranchCommits } from '@/services/github.ts';
import type { GitHubBranch, GitHubCommit } from '@/types/index.ts';
import { CommitNode } from './CommitNode.tsx';
import styles from './BranchTree.module.css';

const nodeTypes = { commit: CommitNode };

const BRANCH_COLORS = [
  '#6366F1', '#14B8A6', '#F59E0B', '#EC4899', '#EF4444',
  '#06B6D4', '#84CC16', '#8B5CF6', '#F97316', '#A78BFA',
];

interface BranchData {
  branch: GitHubBranch;
  commits: GitHubCommit[];
}

function layoutBranchTree(
  branchDataList: BranchData[],
  defaultBranch: string,
  selectedBranches: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80, marginx: 40, marginy: 50 });

  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];
  const commitNodeMap = new Map<string, string>(); // sha → nodeId

  // Sort: default branch first, then by name
  const sorted = [...branchDataList]
    .filter((bd) => selectedBranches.has(bd.branch.name))
    .sort((a, b) => {
      if (a.branch.name === defaultBranch) return -1;
      if (b.branch.name === defaultBranch) return 1;
      return a.branch.name.localeCompare(b.branch.name);
    });

  for (let bi = 0; bi < sorted.length; bi++) {
    const { branch, commits } = sorted[bi];
    const color = BRANCH_COLORS[bi % BRANCH_COLORS.length];

    for (let ci = 0; ci < commits.length; ci++) {
      const commit = commits[ci];
      const nodeId = `${branch.name}::${commit.sha}`;
      const isMerge = commit.parents.length > 1;

      // If this commit was already added by another branch, create a link instead
      if (commitNodeMap.has(commit.sha)) {
        // Link the previous commit in this branch to the existing node
        if (ci > 0) {
          const prevNodeId = `${branch.name}::${commits[ci - 1].sha}`;
          allEdges.push({
            id: `e-${prevNodeId}-${commitNodeMap.get(commit.sha)}`,
            source: prevNodeId,
            target: commitNodeMap.get(commit.sha)!,
            type: 'smoothstep',
            style: { stroke: color, strokeWidth: 1.5, strokeDasharray: '6 3', opacity: 0.5 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
          });
        }
        break; // Stop this branch here — it merges into existing commits
      }

      commitNodeMap.set(commit.sha, nodeId);

      g.setNode(nodeId, { width: 260, height: 60 });

      allNodes.push({
        id: nodeId,
        type: 'commit',
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.author?.login || commit.commit.author.name,
          avatar: commit.author?.avatar_url || null,
          date: commit.commit.author.date,
          branchName: branch.name,
          color,
          isMerge,
          isHead: ci === 0,
        },
      });

      // Edge from previous commit in this branch
      if (ci > 0) {
        const prevNodeId = `${branch.name}::${commits[ci - 1].sha}`;
        const edgeId = `e-${prevNodeId}-${nodeId}`;
        allEdges.push({
          id: edgeId,
          source: prevNodeId,
          target: nodeId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: color, strokeWidth: 2, opacity: 0.6 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
        });
      }

      // Cross-branch links for merge commits
      if (isMerge) {
        for (const parent of commit.parents) {
          if (commitNodeMap.has(parent.sha) && commitNodeMap.get(parent.sha) !== `${branch.name}::${commits[ci + 1]?.sha}`) {
            allEdges.push({
              id: `e-merge-${nodeId}-${parent.sha}`,
              source: nodeId,
              target: commitNodeMap.get(parent.sha)!,
              type: 'smoothstep',
              style: { stroke: color, strokeWidth: 1.5, strokeDasharray: '4 3', opacity: 0.4 },
              markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color },
            });
          }
        }
      }
    }
  }

  // Only layout nodes that are in the graph
  for (const node of allNodes) {
    if (!g.hasNode(node.id)) {
      g.setNode(node.id, { width: 260, height: 60 });
    }
  }

  // Add edges to dagre
  for (const edge of allEdges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  Dagre.layout(g);

  // Apply positions
  for (const node of allNodes) {
    const pos = g.node(node.id);
    if (pos) {
      node.position = { x: pos.x - 130, y: pos.y - 30 };
    }
  }

  return { nodes: allNodes, edges: allEdges };
}

export function BranchTree() {
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const repoUrl = useRepoStore((s) => s.repoUrl);
  const token = useRepoStore((s) => s.token);

  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [branchData, setBranchData] = useState<BranchData[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback(async () => {
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed || !repoInfo) return;

    setIsLoading(true);
    try {
      const fetchedBranches = await fetchBranches(parsed.owner, parsed.repo, token || undefined);
      setBranches(fetchedBranches);

      // Fetch commits for all branches (limit to 15 branches)
      const branchesToFetch = fetchedBranches.slice(0, 15);
      const results: BranchData[] = [];

      for (const branch of branchesToFetch) {
        try {
          const commits = await fetchBranchCommits(
            parsed.owner, parsed.repo, branch.name, token || undefined, 30
          );
          results.push({ branch, commits });
        } catch {
          // Skip branches that fail
        }
      }

      setBranchData(results);
      setSelectedBranches(new Set(results.map((r) => r.branch.name)));
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load branches:', err);
    } finally {
      setIsLoading(false);
    }
  }, [repoUrl, repoInfo, token]);

  const toggleBranch = useCallback((name: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    if (branchData.length === 0) return { nodes: [], edges: [] };
    return layoutBranchTree(branchData, repoInfo?.default_branch || 'main', selectedBranches);
  }, [branchData, repoInfo, selectedBranches]);

  const [, , onNodesChange] = useNodesState(layoutNodes);
  const [, , onEdgesChange] = useEdgesState(layoutEdges);

  if (!loaded) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <GitBranch size={48} strokeWidth={1} />
          <p>Visualize the branch and commit history</p>
          <button className={styles.loadBtn} onClick={handleLoad} disabled={isLoading}>
            {isLoading ? (
              <span className={styles.loadingState}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Loading branches...
              </span>
            ) : (
              'Load Branch Tree'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <span className={styles.controlLabel}>Branches:</span>
        <div className={styles.legend}>
          {branchData.map((bd, i) => {
            const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
            const isSelected = selectedBranches.has(bd.branch.name);
            const isDefault = bd.branch.name === repoInfo?.default_branch;
            return (
              <button
                key={bd.branch.name}
                className={`${styles.legendItem} ${isSelected ? styles.legendItemActive : ''}`}
                onClick={() => toggleBranch(bd.branch.name)}
                style={isSelected ? { borderColor: color, color } : undefined}
              >
                <span className={styles.legendDot} style={{ background: color }} />
                {bd.branch.name}
                {isDefault && <span className={styles.defaultBadge}>default</span>}
              </button>
            );
          })}
        </div>

        <span className={styles.branchCount}>
          {branches.length} branches, {layoutNodes.length} commits
        </span>

        <button className={styles.loadBtn} onClick={handleLoad} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Reload'}
        </button>
      </div>

      <div className={styles.canvas}>
        <ReactFlow
          key={`${[...selectedBranches].sort().join(',')}`}
          nodes={layoutNodes}
          edges={layoutEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
              return (node.data as { color?: string })?.color || 'var(--text-muted)';
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
