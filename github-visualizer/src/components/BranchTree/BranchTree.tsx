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
const ROW_HEIGHT = 100;

interface BranchData {
  branch: GitHubBranch;
  commits: GitHubCommit[];
}

/**
 * Standard git-tree layout:
 * - Global timeline: all commits sorted by date, newest at top
 * - Each branch gets its own lane (column)
 * - Shared commits belong to default branch
 * - Fork lines connect parent on main → first unique commit on branch
 */
function layoutBranchTree(
  branchDataList: BranchData[],
  defaultBranch: string,
  selectedBranches: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];

  // Sort: default branch first
  const sorted = [...branchDataList]
    .filter((bd) => selectedBranches.has(bd.branch.name))
    .sort((a, b) => {
      if (a.branch.name === defaultBranch) return -1;
      if (b.branch.name === defaultBranch) return 1;
      return a.branch.name.localeCompare(b.branch.name);
    });

  if (sorted.length === 0) return { nodes: [], edges: [] };

  // Assign lanes
  const laneMap = new Map<string, number>();
  sorted.forEach((bd, i) => laneMap.set(bd.branch.name, i));

  // Assign each unique commit to its PRIMARY branch (first branch processed wins)
  const commitOwner = new Map<string, string>(); // sha → branch name
  for (const bd of sorted) {
    for (const commit of bd.commits) {
      if (!commitOwner.has(commit.sha)) {
        commitOwner.set(commit.sha, bd.branch.name);
      }
    }
  }

  // Build global timeline: all unique commits sorted by date (newest first)
  const allCommits = new Map<string, GitHubCommit>();
  for (const bd of sorted) {
    for (const c of bd.commits) {
      if (!allCommits.has(c.sha)) allCommits.set(c.sha, c);
    }
  }
  const timeline = [...allCommits.values()].sort(
    (a, b) => new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime()
  );

  // Assign row number to each commit based on timeline position
  const rowMap = new Map<string, number>();
  timeline.forEach((c, i) => rowMap.set(c.sha, i));

  // Create nodes
  const placedNodes = new Set<string>();
  for (const commit of timeline) {
    const branch = commitOwner.get(commit.sha)!;
    if (!selectedBranches.has(branch)) continue;

    const lane = laneMap.get(branch)!;
    const row = rowMap.get(commit.sha)!;
    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];
    const isMerge = commit.parents.length > 1;

    // Is this the HEAD (newest commit) of any selected branch?
    let isHead = false;
    let headBranchName = branch;
    for (const bd of sorted) {
      if (bd.commits[0]?.sha === commit.sha) {
        isHead = true;
        headBranchName = bd.branch.name;
        break;
      }
    }

    // Is this a fork point? (a commit on default branch that has children on other branches)
    let isFork = false;
    if (branch === (sorted[0]?.branch.name || defaultBranch)) {
      for (const bd of sorted) {
        if (bd.branch.name === branch) continue;
        // Check if any commit in this other branch has this commit as parent
        for (const c of bd.commits) {
          if (c.parents.some((p) => p.sha === commit.sha) && commitOwner.get(c.sha) !== branch) {
            isFork = true;
            break;
          }
        }
        if (isFork) break;
      }
    }

    placedNodes.add(commit.sha);

    allNodes.push({
      id: commit.sha,
      type: 'commit',
      position: { x: lane * LANE_WIDTH, y: row * ROW_HEIGHT },
      data: {
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.author?.login || commit.commit.author.name,
        avatar: commit.author?.avatar_url || null,
        date: commit.commit.author.date,
        branchName: headBranchName,
        color,
        isMerge,
        isHead,
        isFork,
        parentCount: commit.parents.length,
      },
    });
  }

  // Create edges within each branch (parent → child = old → new)
  for (const bd of sorted) {
    const lane = laneMap.get(bd.branch.name)!;
    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];

    // Get commits that belong to this branch
    const branchCommits = bd.commits.filter((c) => commitOwner.get(c.sha) === bd.branch.name);

    for (let i = 0; i < branchCommits.length - 1; i++) {
      const newer = branchCommits[i];
      const older = branchCommits[i + 1];
      if (!placedNodes.has(newer.sha) || !placedNodes.has(older.sha)) continue;

      allEdges.push({
        id: `e-${older.sha}-${newer.sha}`,
        source: older.sha,
        target: newer.sha,
        type: 'smoothstep',
        style: { stroke: color, strokeWidth: 2.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
      });
    }
  }

  // Fork/merge connections between branches
  for (const bd of sorted) {
    if (bd.branch.name === sorted[0]?.branch.name) continue; // skip default
    const lane = laneMap.get(bd.branch.name)!;
    const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];

    // Get unique commits for this branch
    const uniqueCommits = bd.commits.filter((c) => commitOwner.get(c.sha) === bd.branch.name);
    if (uniqueCommits.length === 0) continue;

    // Oldest unique commit — find its parent on default branch (fork point)
    const oldest = uniqueCommits[uniqueCommits.length - 1];
    for (const parent of oldest.parents) {
      if (placedNodes.has(parent.sha) && commitOwner.get(parent.sha) !== bd.branch.name) {
        allEdges.push({
          id: `e-fork-${parent.sha}-${oldest.sha}`,
          source: parent.sha,
          target: oldest.sha,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 2, opacity: 0.5, strokeDasharray: '8 4' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
          label: 'fork',
          labelStyle: { fontSize: 10, fill: color, fontWeight: 600 },
          labelBgStyle: { fill: 'var(--bg-primary)', fillOpacity: 0.8 },
        });
        break;
      }
    }

    // Check if branch HEAD was merged back (newest commit of default has this branch's commits as parent)
    const defaultHead = sorted[0]?.commits[0];
    if (defaultHead && defaultHead.parents.length > 1) {
      for (const parent of defaultHead.parents) {
        if (commitOwner.get(parent.sha) === bd.branch.name && placedNodes.has(parent.sha)) {
          const defaultColor = BRANCH_COLORS[0];
          allEdges.push({
            id: `e-merge-${parent.sha}-${defaultHead.sha}`,
            source: parent.sha,
            target: defaultHead.sha,
            type: 'smoothstep',
            style: { stroke: defaultColor, strokeWidth: 2, opacity: 0.5, strokeDasharray: '8 4' },
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: defaultColor },
            label: 'merge',
            labelStyle: { fontSize: 10, fill: defaultColor, fontWeight: 600 },
            labelBgStyle: { fill: 'var(--bg-primary)', fillOpacity: 0.8 },
          });
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
          {branchData.map((bd) => {
            const lane = [...branchData]
              .sort((a, b) => {
                if (a.branch.name === repoInfo?.default_branch) return -1;
                if (b.branch.name === repoInfo?.default_branch) return 1;
                return a.branch.name.localeCompare(b.branch.name);
              })
              .findIndex((x) => x.branch.name === bd.branch.name);
            const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];
            const isSelected = selectedBranches.has(bd.branch.name);
            const isDefault = bd.branch.name === repoInfo?.default_branch;
            const uniqueCount = bd.commits.filter(c => {
              // Count only commits owned by this branch
              let owned = true;
              if (!isDefault) {
                const defaultBd = branchData.find(b => b.branch.name === repoInfo?.default_branch);
                if (defaultBd?.commits.some(dc => dc.sha === c.sha)) owned = false;
              }
              return owned;
            }).length;
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
          {branches.length} branches · {layoutNodes.length} commits
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
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.03}
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
