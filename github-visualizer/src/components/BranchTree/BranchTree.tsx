import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  GitBranch, GitMerge, GitCommit as GitCommitIcon, Loader2,
  RefreshCw, Eye, EyeOff, Clock, Users, Hash,
} from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { parseRepoUrl, fetchBranches, fetchBranchCommits } from '@/services/github.ts';
import type { GitHubBranch, GitHubCommit } from '@/types/index.ts';
import { StyledAvatar } from '@/components/shared/StyledAvatar.tsx';
import styles from './BranchTree.module.css';

/* ─── Constants ─── */
const RAIL_GAP = 26;
const DOT_R = 5;
const HEAD_R = 7;
const ROW_H = 44;
const GRAPH_PAD = 20;

const BRANCH_COLORS = [
  '#6366F1', '#14B8A6', '#F59E0B', '#EC4899', '#EF4444',
  '#06B6D4', '#84CC16', '#8B5CF6', '#F97316', '#A78BFA',
];

/* ─── Types ─── */
interface BranchData {
  branch: GitHubBranch;
  commits: GitHubCommit[];
}

interface GraphRow {
  sha: string;
  message: string;
  author: string;
  avatarUrl: string | null;
  date: string;
  rail: number;
  color: string;
  isHead: boolean;
  isMerge: boolean;
  branchLabel: string | null;
}

interface RailSegment {
  rail: number;
  color: string;
  y1: number;
  y2: number;
}

interface CurveConn {
  fromRail: number;
  fromRow: number;
  toRail: number;
  toRow: number;
  color: string;
  dashed: boolean;
}

interface GraphData {
  rows: GraphRow[];
  rails: RailSegment[];
  curves: CurveConn[];
  railCount: number;
}

/* ─── Graph computation ─── */
function computeGraph(
  branchDataList: BranchData[],
  defaultBranch: string,
  selectedBranches: Set<string>
): GraphData {
  const sorted = [...branchDataList]
    .filter((bd) => selectedBranches.has(bd.branch.name))
    .sort((a, b) => {
      if (a.branch.name === defaultBranch) return -1;
      if (b.branch.name === defaultBranch) return 1;
      return a.branch.name.localeCompare(b.branch.name);
    });

  if (sorted.length === 0)
    return { rows: [], rails: [], curves: [], railCount: 0 };

  const railOf = new Map<string, number>();
  sorted.forEach((bd, i) => railOf.set(bd.branch.name, i));

  const defaultBd = sorted.find((b) => b.branch.name === defaultBranch);
  const defaultShas = new Set(defaultBd?.commits.map((c) => c.sha) || []);

  const ownerOf = new Map<string, string>();
  for (const c of defaultBd?.commits || []) ownerOf.set(c.sha, defaultBranch);
  for (const bd of sorted) {
    if (bd.branch.name === defaultBranch) continue;
    for (const c of bd.commits) {
      if (!defaultShas.has(c.sha) && !ownerOf.has(c.sha))
        ownerOf.set(c.sha, bd.branch.name);
    }
  }

  const allMap = new Map<string, GitHubCommit>();
  for (const bd of sorted) for (const c of bd.commits) if (!allMap.has(c.sha)) allMap.set(c.sha, c);
  const all = [...allMap.values()];

  // Topological sort (Kahn's)
  const childCount = new Map<string, number>();
  const parentEdges = new Map<string, string[]>();
  for (const c of all) {
    childCount.set(c.sha, 0);
    parentEdges.set(c.sha, c.parents.map((p) => p.sha).filter((s) => allMap.has(s)));
  }
  for (const c of all) {
    for (const ps of parentEdges.get(c.sha) || []) {
      childCount.set(ps, (childCount.get(ps) || 0) + 1);
    }
  }
  const ready = all
    .filter((c) => (childCount.get(c.sha) || 0) === 0)
    .sort((a, b) => new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime());
  const timeline: GitHubCommit[] = [];
  const remaining = new Map(childCount);
  while (ready.length > 0) {
    ready.sort((a, b) => new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime());
    const cur = ready.shift()!;
    timeline.push(cur);
    for (const ps of parentEdges.get(cur.sha) || []) {
      const n = (remaining.get(ps) || 0) - 1;
      remaining.set(ps, n);
      if (n === 0) { const p = allMap.get(ps); if (p) ready.push(p); }
    }
  }
  if (timeline.length < all.length) {
    const placed = new Set(timeline.map((c) => c.sha));
    for (const c of all) if (!placed.has(c.sha)) timeline.push(c);
  }

  const rowIdx = new Map<string, number>();
  timeline.forEach((c, i) => rowIdx.set(c.sha, i));

  const headShas = new Set<string>();
  const headBranch = new Map<string, string>();
  for (const bd of sorted) {
    if (bd.commits[0]) {
      headShas.add(bd.commits[0].sha);
      headBranch.set(bd.commits[0].sha, bd.branch.name);
    }
  }

  const rows: GraphRow[] = timeline.map((c) => {
    const owner = ownerOf.get(c.sha) || defaultBranch;
    const rail = railOf.get(owner) ?? 0;
    const color = BRANCH_COLORS[rail % BRANCH_COLORS.length];
    return {
      sha: c.sha,
      message: c.commit.message.split('\n')[0],
      author: c.author?.login || c.commit.author.name,
      avatarUrl: c.author?.avatar_url || null,
      date: c.commit.author.date,
      rail,
      color,
      isHead: headShas.has(c.sha),
      isMerge: c.parents.length > 1,
      branchLabel: headBranch.get(c.sha) || null,
    };
  });

  const branchRowRange = new Map<string, { min: number; max: number }>();
  for (const c of timeline) {
    const owner = ownerOf.get(c.sha);
    if (!owner || !selectedBranches.has(owner)) continue;
    const r = rowIdx.get(c.sha)!;
    const range = branchRowRange.get(owner) || { min: r, max: r };
    range.min = Math.min(range.min, r);
    range.max = Math.max(range.max, r);
    branchRowRange.set(owner, range);
  }

  const rails: RailSegment[] = [];
  for (const [branchName, range] of branchRowRange) {
    const rail = railOf.get(branchName)!;
    rails.push({
      rail,
      color: BRANCH_COLORS[rail % BRANCH_COLORS.length],
      y1: range.min * ROW_H + ROW_H / 2,
      y2: range.max * ROW_H + ROW_H / 2,
    });
  }

  const curves: CurveConn[] = [];
  for (const bd of sorted) {
    if (bd.branch.name === defaultBranch) continue;
    const branchRail = railOf.get(bd.branch.name)!;
    const branchColor = BRANCH_COLORS[branchRail % BRANCH_COLORS.length];
    const unique = bd.commits.filter((c) => !defaultShas.has(c.sha));
    if (unique.length === 0) continue;

    const oldest = unique[unique.length - 1];
    for (const p of oldest.parents) {
      if (defaultShas.has(p.sha) && rowIdx.has(p.sha) && rowIdx.has(oldest.sha)) {
        curves.push({
          fromRail: railOf.get(defaultBranch)!,
          fromRow: rowIdx.get(p.sha)!,
          toRail: branchRail,
          toRow: rowIdx.get(oldest.sha)!,
          color: branchColor,
          dashed: false,
        });
        break;
      }
    }

    if (defaultBd) {
      const newest = unique[0];
      for (const dc of defaultBd.commits) {
        if (dc.parents.length > 1 && dc.parents.some((p) => p.sha === newest.sha) && rowIdx.has(dc.sha) && rowIdx.has(newest.sha)) {
          curves.push({
            fromRail: branchRail,
            fromRow: rowIdx.get(newest.sha)!,
            toRail: railOf.get(defaultBranch)!,
            toRow: rowIdx.get(dc.sha)!,
            color: BRANCH_COLORS[0],
            dashed: true,
          });
          break;
        }
      }
    }
  }

  return { rows, rails, curves, railCount: sorted.length };
}

/* ─── SVG Graph ─── */
function GraphSvg({ data, totalHeight, graphWidth }: { data: GraphData; totalHeight: number; graphWidth: number }) {
  const rx = (rail: number) => GRAPH_PAD + rail * RAIL_GAP;
  const ry = (row: number) => row * ROW_H + ROW_H / 2;

  return (
    <svg width={graphWidth} height={totalHeight} className={styles.graphSvg}>
      <defs>
        {/* Glow filter for HEAD dots */}
        {BRANCH_COLORS.map((color, i) => (
          <filter key={i} id={`glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx={0} dy={0} stdDeviation={3} floodColor={color} floodOpacity={0.6} />
          </filter>
        ))}
      </defs>

      {/* Rail lines with gradient opacity */}
      {data.rails.map((seg, i) => (
        <g key={`rail-${i}`}>
          <line
            x1={rx(seg.rail)} y1={seg.y1}
            x2={rx(seg.rail)} y2={seg.y2}
            stroke={seg.color} strokeWidth={2.5} opacity={0.2}
            strokeLinecap="round"
          />
          <line
            x1={rx(seg.rail)} y1={seg.y1}
            x2={rx(seg.rail)} y2={seg.y2}
            stroke={seg.color} strokeWidth={1.5} opacity={0.5}
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* Curves with glow */}
      {data.curves.map((c, i) => {
        const x1 = rx(c.fromRail), y1 = ry(c.fromRow);
        const x2 = rx(c.toRail), y2 = ry(c.toRow);
        const [sx, sy, ex, ey] = y1 < y2 ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
        const my = (sy + ey) / 2;
        const path = `M ${sx} ${sy} C ${sx} ${my}, ${ex} ${my}, ${ex} ${ey}`;
        return (
          <g key={`curve-${i}`}>
            {/* Glow behind */}
            <path d={path} fill="none" stroke={c.color}
              strokeWidth={4} opacity={0.1}
              strokeLinecap="round"
            />
            <path d={path} fill="none" stroke={c.color}
              strokeWidth={2} opacity={0.6}
              strokeDasharray={c.dashed ? '6 4' : undefined}
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {/* Commit dots */}
      {data.rows.map((row, i) => {
        const cx = rx(row.rail), cy = ry(i);
        const railIdx = row.rail % BRANCH_COLORS.length;
        return (
          <g key={row.sha}>
            {/* Head glow ring */}
            {row.isHead && (
              <>
                <circle cx={cx} cy={cy} r={HEAD_R + 4} fill="none"
                  stroke={row.color} strokeWidth={1} opacity={0.25} />
                <circle cx={cx} cy={cy} r={HEAD_R + 2} fill="none"
                  stroke={row.color} strokeWidth={1.5} opacity={0.4} />
              </>
            )}
            {/* Main dot */}
            <circle cx={cx} cy={cy}
              r={row.isHead ? HEAD_R : DOT_R}
              fill={row.color}
              stroke="var(--bg-primary)" strokeWidth={2}
              filter={row.isHead ? `url(#glow-${railIdx})` : undefined}
            />
            {/* Merge hollow center */}
            {row.isMerge && (
              <circle cx={cx} cy={cy} r={DOT_R - 2}
                fill="var(--bg-primary)" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Minimap ─── */
function MiniMap({
  data, totalHeight, scrollTop, viewportHeight,
  onJump, railCount,
}: {
  data: GraphData;
  totalHeight: number;
  scrollTop: number;
  viewportHeight: number;
  onJump: (y: number) => void;
  railCount: number;
}) {
  const MINI_H = 180;
  const MINI_W = 110;
  const scale = totalHeight > 0 ? MINI_H / totalHeight : 1;
  const viewH = Math.max(10, viewportHeight * scale);
  const viewY = Math.min(scrollTop * scale, MINI_H - viewH);
  const railSpacing = Math.min(10, (MINI_W - 24) / Math.max(railCount, 1));

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const target = (clickY / MINI_H) * totalHeight - viewportHeight / 2;
    onJump(Math.max(0, target));
  };

  return (
    <div className={styles.minimapWrap}>
      <div className={styles.minimapLabel}>
        <Hash size={9} /> MAP
      </div>
      <svg width={MINI_W} height={MINI_H} className={styles.minimap} onClick={handleClick}>
        <defs>
          <linearGradient id="minimap-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bg-secondary)" stopOpacity={0.95} />
            <stop offset="100%" stopColor="var(--bg-primary)" stopOpacity={0.95} />
          </linearGradient>
        </defs>
        <rect width={MINI_W} height={MINI_H} rx={6} fill="url(#minimap-bg)" />
        {/* Rails */}
        {data.rails.map((seg, i) => (
          <line key={i}
            x1={14 + seg.rail * railSpacing} y1={seg.y1 * scale}
            x2={14 + seg.rail * railSpacing} y2={seg.y2 * scale}
            stroke={seg.color} strokeWidth={2} opacity={0.4}
            strokeLinecap="round"
          />
        ))}
        {/* Curves */}
        {data.curves.map((c, i) => {
          const x1c = 14 + c.fromRail * railSpacing;
          const y1c = (c.fromRow * ROW_H + ROW_H / 2) * scale;
          const x2c = 14 + c.toRail * railSpacing;
          const y2c = (c.toRow * ROW_H + ROW_H / 2) * scale;
          const [sx, sy, ex, ey] = y1c < y2c ? [x1c, y1c, x2c, y2c] : [x2c, y2c, x1c, y1c];
          const my = (sy + ey) / 2;
          return (
            <path key={`mc-${i}`}
              d={`M ${sx} ${sy} C ${sx} ${my}, ${ex} ${my}, ${ex} ${ey}`}
              fill="none" stroke={c.color} strokeWidth={1} opacity={0.35}
            />
          );
        })}
        {/* Dots */}
        {data.rows.map((row, i) => (
          <circle key={row.sha}
            cx={14 + row.rail * railSpacing}
            cy={(i * ROW_H + ROW_H / 2) * scale}
            r={row.isHead ? 2.5 : 1.5} fill={row.color}
            opacity={row.isHead ? 1 : 0.6}
          />
        ))}
        {/* Viewport */}
        <rect x={2} y={viewY} width={MINI_W - 4} height={viewH}
          rx={4} fill="rgba(99,102,241,0.12)"
          stroke="var(--accent)" strokeWidth={1.5} opacity={0.9}
        />
      </svg>
    </div>
  );
}

/* ─── Helpers ─── */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

/* ─── Main Component ─── */
export function BranchTree() {
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const repoUrl = useRepoStore((s) => s.repoUrl);
  const token = useRepoStore((s) => s.token);

  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [branchData, setBranchData] = useState<BranchData[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleLoad = useCallback(async () => {
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed || !repoInfo) return;
    setIsLoading(true);
    try {
      const fetchedBranches = await fetchBranches(parsed.owner, parsed.repo, token || undefined);
      setBranches(fetchedBranches);
      const results: BranchData[] = [];
      for (const branch of fetchedBranches.slice(0, 15)) {
        try {
          const commits = await fetchBranchCommits(parsed.owner, parsed.repo, branch.name, token || undefined, 50);
          results.push({ branch, commits });
        } catch { /* skip */ }
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
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const graph = useMemo(() => {
    if (branchData.length === 0) return { rows: [], rails: [], curves: [], railCount: 0 } as GraphData;
    return computeGraph(branchData, repoInfo?.default_branch || 'main', selectedBranches);
  }, [branchData, repoInfo, selectedBranches]);

  const totalHeight = graph.rows.length * ROW_H;
  const graphWidth = GRAPH_PAD * 2 + Math.max(0, graph.railCount - 1) * RAIL_GAP + 16;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportH(el.clientHeight);
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => { el.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); };
  }, [loaded]);

  const handleMinimapJump = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ top: y, behavior: 'smooth' });
  }, []);

  const defaultShas = useMemo(() => {
    const d = branchData.find((b) => b.branch.name === repoInfo?.default_branch);
    return new Set(d?.commits.map((c) => c.sha) || []);
  }, [branchData, repoInfo]);

  // Unique authors count
  const authorCount = useMemo(() => {
    const set = new Set<string>();
    for (const row of graph.rows) set.add(row.author);
    return set.size;
  }, [graph.rows]);

  // Merge count
  const mergeCount = useMemo(() => graph.rows.filter((r) => r.isMerge).length, [graph.rows]);

  // Sorted branches for consistent coloring
  const sortedBranchData = useMemo(() => {
    return [...branchData].sort((a, b) => {
      if (a.branch.name === repoInfo?.default_branch) return -1;
      if (b.branch.name === repoInfo?.default_branch) return 1;
      return a.branch.name.localeCompare(b.branch.name);
    });
  }, [branchData, repoInfo]);

  if (!loaded) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <GitBranch size={56} strokeWidth={1} />
          </div>
          <h3 className={styles.emptyTitle}>Branch Visualizer</h3>
          <p className={styles.emptyDesc}>
            Explore the commit history with an interactive graph
          </p>
          <button className={styles.loadBtnHero} onClick={handleLoad} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 size={16} className={styles.spinner} />
                Loading branches...
              </>
            ) : (
              <>
                <GitBranch size={16} />
                Load Branch Tree
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* ─── Stats bar ─── */}
      <div className={styles.statsBar}>
        <div className={styles.statItem}>
          <GitBranch size={13} />
          <span className={styles.statValue}>{branches.length}</span>
          <span className={styles.statLabel}>branches</span>
        </div>
        <div className={styles.statItem}>
          <GitCommitIcon size={13} />
          <span className={styles.statValue}>{graph.rows.length}</span>
          <span className={styles.statLabel}>commits</span>
        </div>
        <div className={styles.statItem}>
          <GitMerge size={13} />
          <span className={styles.statValue}>{mergeCount}</span>
          <span className={styles.statLabel}>merges</span>
        </div>
        <div className={styles.statItem}>
          <Users size={13} />
          <span className={styles.statValue}>{authorCount}</span>
          <span className={styles.statLabel}>authors</span>
        </div>
        <button className={styles.reloadBtn} onClick={handleLoad} disabled={isLoading} title="Reload">
          <RefreshCw size={13} className={isLoading ? styles.spinner : ''} />
        </button>
      </div>

      {/* ─── Branch pills ─── */}
      <div className={styles.branchBar}>
        {sortedBranchData.map((bd) => {
          const lane = sortedBranchData.findIndex((x) => x.branch.name === bd.branch.name);
          const color = BRANCH_COLORS[lane % BRANCH_COLORS.length];
          const isSelected = selectedBranches.has(bd.branch.name);
          const isDefault = bd.branch.name === repoInfo?.default_branch;
          const count = isDefault
            ? bd.commits.length
            : bd.commits.filter((c) => !defaultShas.has(c.sha)).length;
          return (
            <button
              key={bd.branch.name}
              className={`${styles.branchPill} ${isSelected ? styles.branchPillActive : ''}`}
              onClick={() => toggleBranch(bd.branch.name)}
              style={isSelected
                ? { '--pill-color': color, borderColor: color } as React.CSSProperties
                : { '--pill-color': color } as React.CSSProperties
              }
            >
              <span className={styles.pillDot} style={{ background: color }} />
              <span className={styles.pillName}>{bd.branch.name}</span>
              <span className={styles.pillCount}>{count}</span>
              {isDefault && <span className={styles.pillDefault}>HEAD</span>}
              {isSelected
                ? <Eye size={10} className={styles.pillEye} />
                : <EyeOff size={10} className={styles.pillEye} />
              }
            </button>
          );
        })}
      </div>

      {/* ─── Graph area ─── */}
      <div className={styles.graphArea}>
        <div className={styles.scrollArea} ref={scrollRef}>
          <div className={styles.graphContent} style={{ height: totalHeight }}>
            {/* SVG graph column */}
            <GraphSvg data={graph} totalHeight={totalHeight} graphWidth={graphWidth} />

            {/* Commit rows */}
            <div className={styles.commitList} style={{ marginLeft: graphWidth }}>
              {graph.rows.map((row, idx) => (
                  <div
                    key={row.sha}
                    className={`${styles.commitRow} ${row.isHead ? styles.commitRowHead : ''} ${row.isMerge ? styles.commitRowMerge : ''}`}
                    style={{
                      height: ROW_H,
                      '--row-color': row.color,
                      animationDelay: `${idx * 12}ms`,
                    } as React.CSSProperties}
                  >
                    {/* Colored accent line */}
                    <div className={styles.rowAccent} style={{ background: row.color }} />

                    {/* Type indicator */}
                    <div className={styles.rowType}>
                      {row.branchLabel ? (
                        <span className={styles.branchTag} style={{ background: row.color }}>
                          <GitBranch size={10} />
                          {row.branchLabel}
                        </span>
                      ) : row.isMerge ? (
                        <span className={styles.mergeTag}>
                          <GitMerge size={11} />
                        </span>
                      ) : (
                        <GitCommitIcon size={11} className={styles.commitIcon} />
                      )}
                    </div>

                    {/* Message */}
                    <span className={styles.commitMsg} title={row.message}>
                      {row.message.length > 72 ? row.message.slice(0, 72) + '...' : row.message}
                    </span>

                    {/* Author */}
                    <div className={styles.commitAuthor}>
                      {row.avatarUrl ? (
                        <img src={row.avatarUrl} alt={row.author} className={styles.authorAvatar} />
                      ) : (
                        <StyledAvatar name={row.author} size={18} />
                      )}
                      <span className={styles.authorName}>{row.author}</span>
                    </div>

                    {/* SHA */}
                    <code className={styles.commitSha} style={{ color: row.color }}>
                      {row.sha.slice(0, 7)}
                    </code>

                    {/* Time */}
                    <span className={styles.commitTime}>
                      <Clock size={9} />
                      {timeAgo(row.date)}
                    </span>
                  </div>
              ))}
            </div>
          </div>
        </div>

        {/* Minimap */}
        {graph.rows.length > 0 && (
          <MiniMap
            data={graph}
            totalHeight={totalHeight}
            scrollTop={scrollTop}
            viewportHeight={viewportH}
            onJump={handleMinimapJump}
            railCount={graph.railCount}
          />
        )}
      </div>
    </div>
  );
}
