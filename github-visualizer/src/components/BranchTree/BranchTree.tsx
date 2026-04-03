import { useState, useMemo, useCallback, memo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GitBranch, Loader2 } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { parseRepoUrl, fetchBranches, fetchBranchCommits } from '@/services/github.ts';
import type { GitHubBranch, GitHubCommit } from '@/types/index.ts';
import { CommitNode } from './CommitNode.tsx';
import styles from './BranchTree.module.css';

/* Lane header node */
const LaneHeaderNode = memo(function LaneHeaderNode({ data }: { data: Record<string, unknown> }) {
  const color = data.color as string;
  const isDefault = data.isDefault as boolean;
  return (
    <div
      style={{
        background: `${color}18`,
        border: `2px solid ${color}`,
        borderRadius: 12,
        padding: '10px 24px',
        textAlign: 'center',
        minWidth: 220,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <GitBranch size={14} style={{ color }} />
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color }}>{data.label as string}</span>
        {isDefault && (
          <span style={{
            fontSize: '0.6rem', background: color, color: '#fff',
            padding: '1px 6px', borderRadius: 6, fontWeight: 700,
          }}>default</span>
        )}
      </div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
        {data.commitCount as number} commits
      </div>
    </div>
  );
});

const nodeTypes = { commit: CommitNode, laneHeader: LaneHeaderNode };

const BRANCH_COLORS = [
  '#6366F1', '#14B8A6', '#F59E0B', '#EC4899', '#EF4444',
  '#06B6D4', '#84CC16', '#8B5CF6', '#F97316', '#A78BFA',
];

const LANE_WIDTH = 360;
const ROW_HEIGHT = 110;

interface BranchData {
  branch: GitHubBranch;
  commits: GitHubCommit[];
}

/**
 * Per-branch compact layout:
 * - Default branch: all commits stacked vertically in lane 0
 * - Other branches: only unique commits in their own lanes
 * - Fork/merge edges connect between lanes using smoothstep
 */
function layoutBranchTree(
  branchDataList: BranchData[],
  defaultBranch: string,
  selectedBranches: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];

  const sorted = [...branchDataList]
    .filter((bd) => selectedBranches.has(bd.branch.name))
    .sort((a, b) => {
      if (a.branch.name === defaultBranch) return -1;
      if (b.branch.name === defaultBranch) return 1;
      return a.branch.name.localeCompare(b.branch.name);
    });

  if (sorted.length === 0) return { nodes: [], edges: [] };

  const laneMap = new Map<string, number>();
  sorted.forEach((bd, i) => laneMap.set(bd.branch.name, i));

  const defaultBd = sorted.find((bd) => bd.branch.name === defaultBranch);
  const defaultShas = new Set(defaultBd?.commits.map((c) => c.sha) || []);

  const placedNodes = new Set<string>();

  // Per-branch: compute commits to display and place them compactly
  for (const bd of sorted) {
    const lane = laneMap.get(bd.branch.name)!;
    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];
    const isDefaultBranch = bd.branch.name === defaultBranch;

    // Default branch: all commits; others: unique only
    const branchCommits = isDefaultBranch
      ? bd.commits
      : bd.commits.filter((c) => !defaultShas.has(c.sha));

    // Lane header
    allNodes.push({
      id: `header-${bd.branch.name}`,
      type: 'laneHeader',
      position: { x: lane * LANE_WIDTH + 10, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        label: bd.branch.name,
        color,
        isDefault: isDefaultBranch,
        commitCount: branchCommits.length,
      },
    });

    // Stack commits vertically (newest first = API order)
    branchCommits.forEach((commit, row) => {
      if (placedNodes.has(commit.sha)) return;
      placedNodes.add(commit.sha);

      const isMerge = commit.parents.length > 1;
      const isHead = row === 0;

      // Fork point detection for default branch
      let isFork = false;
      if (isDefaultBranch) {
        for (const otherBd of sorted) {
          if (otherBd.branch.name === defaultBranch) continue;
          const otherUnique = otherBd.commits.filter((c) => !defaultShas.has(c.sha));
          if (otherUnique.length > 0) {
            const oldest = otherUnique[otherUnique.length - 1];
            if (oldest.parents.some((p) => p.sha === commit.sha)) {
              isFork = true;
              break;
            }
          }
        }
      }

      allNodes.push({
        id: commit.sha,
        type: 'commit',
        position: { x: lane * LANE_WIDTH, y: 80 + row * ROW_HEIGHT },
        data: {
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.author?.login || commit.commit.author.name,
          avatar: commit.author?.avatar_url || null,
          date: commit.commit.author.date,
          branchName: bd.branch.name,
          color,
          isMerge,
          isHead,
          isFork,
          parentCount: commit.parents.length,
        },
      });
    });

    // Within-branch edges (older → newer, bottom to top)
    for (let i = 0; i < branchCommits.length - 1; i++) {
      const newer = branchCommits[i];
      const older = branchCommits[i + 1];
      if (!placedNodes.has(newer.sha) || !placedNodes.has(older.sha)) continue;

      allEdges.push({
        id: `e-${bd.branch.name}-${i}`,
        source: older.sha,
        target: newer.sha,
        sourceHandle: 'bottom-out',
        targetHandle: 'top-in',
        type: 'smoothstep',
        style: { stroke: color, strokeWidth: 2.5, opacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
      });
    }
  }

  // Cross-branch edges: fork and merge
  for (const bd of sorted) {
    if (bd.branch.name === defaultBranch) continue;
    const lane = laneMap.get(bd.branch.name)!;
    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];

    const uniqueCommits = bd.commits.filter((c) => !defaultShas.has(c.sha));
    if (uniqueCommits.length === 0) continue;

    // Fork: oldest unique commit's parent on default → oldest unique commit
    const oldest = uniqueCommits[uniqueCommits.length - 1];
    for (const parent of oldest.parents) {
      if (placedNodes.has(parent.sha) && defaultShas.has(parent.sha)) {
        allEdges.push({
          id: `e-fork-${parent.sha}-${oldest.sha}`,
          source: parent.sha,
          target: oldest.sha,
          sourceHandle: 'right-out',
          targetHandle: 'left-in',
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 2.5, opacity: 0.6, strokeDasharray: '8 4' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
          label: 'branched',
          labelStyle: { fontSize: 11, fill: color, fontWeight: 700 },
          labelBgStyle: { fill: 'var(--bg-primary)', fillOpacity: 0.9 },
          labelBgPadding: [6, 4] as [number, number],
          labelBgBorderRadius: 4,
        });
        break;
      }
    }

    // Merge: check if any default branch merge commit has the newest unique as parent
    if (defaultBd) {
      const newestUnique = uniqueCommits[0];
      for (const dc of defaultBd.commits) {
        if (dc.parents.length > 1 && dc.parents.some((p) => p.sha === newestUnique.sha) && placedNodes.has(dc.sha)) {
          const defaultColor = BRANCH_COLORS[0];
          allEdges.push({
            id: `e-merge-${newestUnique.sha}-${dc.sha}`,
            source: newestUnique.sha,
            target: dc.sha,
            sourceHandle: 'left-in',
            targetHandle: 'right-out',
            type: 'smoothstep',
            style: { stroke: defaultColor, strokeWidth: 2.5, opacity: 0.6, strokeDasharray: '8 4' },
            markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: defaultColor },
            label: 'merged',
            labelStyle: { fontSize: 11, fill: defaultColor, fontWeight: 700 },
            labelBgStyle: { fill: 'var(--bg-primary)', fillOpacity: 0.9 },
            labelBgPadding: [6, 4] as [number, number],
            labelBgBorderRadius: 4,
          });
          break;
        }
      }
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

      const branchesToFetch = fetchedBranches.slice(0, 15);
      const results: BranchData[] = [];

      for (const branch of branchesToFetch) {
        try {
          const commits = await fetchBranchCommits(
            parsed.owner, parsed.repo, branch.name, token || undefined, 50
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

  // Compute unique counts for legend
  const defaultShasForLegend = useMemo(() => {
    const defaultBd = branchData.find(b => b.branch.name === repoInfo?.default_branch);
    return new Set(defaultBd?.commits.map(c => c.sha) || []);
  }, [branchData, repoInfo]);

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
          {branchData.map((bd) => {
            const sortedForLane = [...branchData].sort((a, b) => {
              if (a.branch.name === repoInfo?.default_branch) return -1;
              if (b.branch.name === repoInfo?.default_branch) return 1;
              return a.branch.name.localeCompare(b.branch.name);
            });
            const lane = sortedForLane.findIndex((x) => x.branch.name === bd.branch.name);
            const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];
            const isSelected = selectedBranches.has(bd.branch.name);
            const isDefault = bd.branch.name === repoInfo?.default_branch;
            const uniqueCount = isDefault
              ? bd.commits.length
              : bd.commits.filter(c => !defaultShasForLegend.has(c.sha)).length;
            return (
              <button
                key={bd.branch.name}
                className={`${styles.legendItem} ${isSelected ? styles.legendItemActive : ''}`}
                onClick={() => toggleBranch(bd.branch.name)}
                style={isSelected ? { borderColor: color, color } : undefined}
              >
                <span className={styles.legendDot} style={{ background: color }} />
                {bd.branch.name}
                <span className={styles.commitCount}>{uniqueCount}</span>
                {isDefault && <span className={styles.defaultBadge}>default</span>}
              </button>
            );
          })}
        </div>

        <span className={styles.branchCount}>
          {branches.length} branches · {layoutNodes.length} nodes
        </span>

        <button className={styles.loadBtn} onClick={handleLoad} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Reload'}
        </button>
      </div>

      <div className={styles.canvas}>
        <ReactFlow
          key={`rf-${[...selectedBranches].sort().join(',')}`}
          nodes={layoutNodes}
          edges={layoutEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnScroll
          zoomOnScroll
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.05}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(99,102,241,0.08)" />
          <MiniMap
            pannable
            zoomable
            style={{ background: '#1a1a2e', borderRadius: 8 }}
            maskColor="rgba(0,0,0,0.3)"
            nodeColor={(node) => {
              const color = (node.data as Record<string, unknown>)?.color;
              return typeof color === 'string' ? color : '#6366F1';
            }}
            nodeStrokeColor="transparent"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
