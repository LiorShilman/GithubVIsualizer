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

const LANE_WIDTH = 340;
const ROW_HEIGHT = 90;

interface BranchData {
  branch: GitHubBranch;
  commits: GitHubCommit[];
}

function layoutBranchTree(
  branchDataList: BranchData[],
  defaultBranch: string,
  selectedBranches: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];

  // Sort: default branch first, then by name
  const sorted = [...branchDataList]
    .filter((bd) => selectedBranches.has(bd.branch.name))
    .sort((a, b) => {
      if (a.branch.name === defaultBranch) return -1;
      if (b.branch.name === defaultBranch) return 1;
      return a.branch.name.localeCompare(b.branch.name);
    });

  if (sorted.length === 0) return { nodes: [], edges: [] };

  // Collect all commits from the default branch for fork-point detection
  const defaultBranchData = sorted.find((s) => s.branch.name === defaultBranch) || sorted[0];
  const defaultShas = new Set(defaultBranchData.commits.map((c) => c.sha));

  // Assign lanes: default branch = lane 0, others = lane 1, 2, ...
  const laneMap = new Map<string, number>();
  laneMap.set(defaultBranchData.branch.name, 0);
  let nextLane = 1;
  for (const bd of sorted) {
    if (!laneMap.has(bd.branch.name)) {
      laneMap.set(bd.branch.name, nextLane++);
    }
  }

  // Track which commits are placed (for dedup & fork detection)
  const placedCommits = new Map<string, { nodeId: string; lane: number; row: number }>();

  // Place default branch first
  placebranchCommits(defaultBranchData, 0, BRANCH_COLORS[0]);

  // Place other branches
  for (const bd of sorted) {
    if (bd.branch.name === defaultBranchData.branch.name) continue;
    const lane = laneMap.get(bd.branch.name)!;
    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];
    placebranchCommits(bd, lane, color);
  }

  function placebranchCommits(bd: BranchData, lane: number, color: string) {
    const { branch, commits } = bd;
    let row = 0;
    let forkRow = -1;

    // For non-default branches, find where they fork from default
    if (lane > 0) {
      for (let i = 0; i < commits.length; i++) {
        if (defaultShas.has(commits[i].sha)) {
          // This commit is shared with default branch — fork point found
          forkRow = i;
          break;
        }
      }
    }

    // Only place commits unique to this branch (up to fork point)
    const branchCommits = forkRow >= 0 ? commits.slice(0, forkRow) : commits;
    const forkCommit = forkRow >= 0 ? commits[forkRow] : null;

    for (let ci = 0; ci < branchCommits.length; ci++) {
      const commit = branchCommits[ci];

      // Skip if already placed by another branch
      if (placedCommits.has(commit.sha)) {
        // Connect existing commit → previous (newer) commit in this branch
        if (ci > 0) {
          const prevNodeId = `${branch.name}::${branchCommits[ci - 1].sha}`;
          const existing = placedCommits.get(commit.sha)!;
          allEdges.push({
            id: `e-join-${existing.nodeId}-${prevNodeId}`,
            source: existing.nodeId,
            target: prevNodeId,
            type: 'smoothstep',
            style: { stroke: color, strokeWidth: 2, opacity: 0.5, strokeDasharray: '6 4' },
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
          });
        }
        continue;
      }

      const nodeId = `${branch.name}::${commit.sha}`;
      const isMerge = commit.parents.length > 1;
      const x = lane * LANE_WIDTH;
      const y = row * ROW_HEIGHT + 40;

      placedCommits.set(commit.sha, { nodeId, lane, row });

      allNodes.push({
        id: nodeId,
        type: 'commit',
        position: { x, y },
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
          isFork: false,
          parentCount: commit.parents.length,
        },
      });

      // Edge: older commit → newer commit (parent → child)
      if (ci > 0) {
        const prevNodeId = `${branch.name}::${branchCommits[ci - 1].sha}`;
        allEdges.push({
          id: `e-${nodeId}-${prevNodeId}`,
          source: nodeId,
          target: prevNodeId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: color, strokeWidth: 2, opacity: 0.7 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
        });
      }

      // Cross-branch merge links: parent → merge commit
      if (isMerge) {
        for (const parent of commit.parents) {
          if (placedCommits.has(parent.sha)) {
            const parentInfo = placedCommits.get(parent.sha)!;
            if (parentInfo.lane !== lane) {
              allEdges.push({
                id: `e-merge-${parent.sha}-${nodeId}`,
                source: parentInfo.nodeId,
                target: nodeId,
                type: 'smoothstep',
                style: { stroke: color, strokeWidth: 1.5, strokeDasharray: '5 3', opacity: 0.4 },
                markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color },
              });
            }
          }
        }
      }

      row++;
    }

    // Connect fork point on default branch → oldest branch commit (shows origin)
    if (forkCommit && placedCommits.has(forkCommit.sha) && branchCommits.length > 0) {
      const lastNodeId = `${branch.name}::${branchCommits[branchCommits.length - 1].sha}`;
      const forkInfo = placedCommits.get(forkCommit.sha)!;

      // Mark the fork point node
      const forkNode = allNodes.find((n) => n.id === forkInfo.nodeId);
      if (forkNode) {
        forkNode.data = { ...forkNode.data, isFork: true };
      }

      allEdges.push({
        id: `e-fork-${forkInfo.nodeId}-${lastNodeId}`,
        source: forkInfo.nodeId,
        target: lastNodeId,
        type: 'smoothstep',
        style: { stroke: color, strokeWidth: 2.5, opacity: 0.6, strokeDasharray: '8 4' },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
      });
    }
  }

  // Add lane header nodes (branch labels at top)
  for (const bd of sorted) {
    const lane = laneMap.get(bd.branch.name)!;
    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];
    const isDefault = bd.branch.name === defaultBranch;

    allNodes.push({
      id: `lane-header-${bd.branch.name}`,
      type: 'default',
      position: { x: lane * LANE_WIDTH + 40, y: -40 },
      selectable: false,
      draggable: false,
      data: { label: '' },
      style: {
        background: `${color}15`,
        border: `1.5px solid ${color}50`,
        borderRadius: 20,
        padding: '4px 14px',
        fontSize: '0.72rem',
        fontWeight: 700,
        color,
        pointerEvents: 'none' as const,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap' as const,
      },
    });
    // Override the label with branch name + badge
    const headerNode = allNodes[allNodes.length - 1];
    headerNode.data = {
      label: `${bd.branch.name}${isDefault ? ' ★' : ''} · ${bd.commits.length} commits`,
    };
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
            parsed.owner, parsed.repo, branch.name, token || undefined, 40
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
            const lane = i; // sorted same way as layout
            const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];
            const isSelected = selectedBranches.has(bd.branch.name);
            const isDefault = bd.branch.name === repoInfo?.default_branch;
            const commitCount = bd.commits.length;
            return (
              <button
                key={bd.branch.name}
                className={`${styles.legendItem} ${isSelected ? styles.legendItemActive : ''}`}
                onClick={() => toggleBranch(bd.branch.name)}
                style={isSelected ? { borderColor: color, color } : undefined}
              >
                <span className={styles.legendDot} style={{ background: color }} />
                {bd.branch.name}
                <span className={styles.commitCount}>{commitCount}</span>
                {isDefault && <span className={styles.defaultBadge}>default</span>}
              </button>
            );
          })}
        </div>

        <span className={styles.branchCount}>
          {branches.length} branches · {layoutNodes.filter(n => n.type === 'commit').length} commits
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
          fitViewOptions={{ padding: 0.2 }}
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
              if (node.type !== 'commit') return 'transparent';
              return (node.data as { color?: string })?.color || 'var(--text-muted)';
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
