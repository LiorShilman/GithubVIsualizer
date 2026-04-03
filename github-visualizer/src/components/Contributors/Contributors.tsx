import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Users } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { parseRepoUrl, fetchContributors, fetchBranchCommits } from '@/services/github.ts';
import type { GitHubContributor, GitHubCommit } from '@/types/index.ts';
import { StyledAvatar } from '@/components/shared/StyledAvatar.tsx';
import styles from './Contributors.module.css';

interface ContributorData extends GitHubContributor {
  directories: Map<string, number>; // directory → file count
}

interface BubbleNode {
  id: string;
  type: 'contributor' | 'directory';
  label: string;
  avatar?: string;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  fileCount?: number;
  contributions?: number;
}

interface BubbleEdge {
  source: string;
  target: string;
  weight: number;
}

// Gradient palette for contributor nodes
const CONTRIB_GRADIENTS = [
  ['#6366F1', '#A855F7'], // indigo → purple
  ['#EC4899', '#F43F5E'], // pink → rose
  ['#14B8A6', '#06B6D4'], // teal → cyan
  ['#F59E0B', '#EF4444'], // amber → red
  ['#8B5CF6', '#6366F1'], // violet → indigo
  ['#06B6D4', '#22C55E'], // cyan → green
  ['#F97316', '#F59E0B'], // orange → amber
  ['#E11D48', '#EC4899'], // rose → pink
  ['#10B981', '#14B8A6'], // emerald → teal
  ['#A855F7', '#EC4899'], // purple → pink
];

const DIR_COLORS = [
  '#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#84CC16', '#F97316', '#A855F7',
  '#10B981', '#E11D48', '#0EA5E9', '#D946EF', '#22C55E',
];

function getTopDirectory(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 1) return '/';
  // Use first meaningful directory (skip src/)
  if (parts[0] === 'src' && parts.length > 2) return parts[1];
  return parts[0];
}

export function Contributors() {
  const repoUrl = useRepoStore((s) => s.repoUrl);
  const token = useRepoStore((s) => s.token);
  const branch = useRepoStore((s) => s.branch);

  const [contributors, setContributors] = useState<ContributorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<BubbleNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const nodesRef = useRef<BubbleNode[]>([]);
  const edgesRef = useRef<BubbleEdge[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load contributor data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const parsed = parseRepoUrl(repoUrl);
      if (!parsed) return;

      setLoading(true);
      setError(null);

      try {
        const [contribs, commits] = await Promise.all([
          fetchContributors(parsed.owner, parsed.repo, token || undefined),
          fetchBranchCommits(parsed.owner, parsed.repo, branch, token || undefined, 100),
        ]);

        if (cancelled) return;

        // Map contributors to directories via commit history
        const contribMap = new Map<string, ContributorData>();
        for (const c of contribs) {
          contribMap.set(c.login, {
            ...c,
            directories: new Map(),
          });
        }

        // Analyze commits to find file ownership patterns
        buildContributorDirectories(commits, contribMap);

        if (cancelled) return;
        setContributors(Array.from(contribMap.values()).filter((c) => c.directories.size > 0));
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load contributors');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [repoUrl, token, branch]);

  // Build contributor <-> directory mapping from commits
  const buildContributorDirectories = useCallback((
    commits: GitHubCommit[],
    contribMap: Map<string, ContributorData>,
  ) => {
    // Use commit messages to infer directories (since file-level data requires per-commit API calls)
    // Group commits by author and analyze paths mentioned
    for (const commit of commits) {
      const login = commit.author?.login;
      if (!login) continue;

      const contributor = contribMap.get(login);
      if (!contributor) continue;

      // Extract directory hints from commit message
      const msg = commit.commit.message;
      const pathMatches = msg.match(/(?:^|\s)([\w-]+\/[\w.-]+)/g);
      if (pathMatches) {
        for (const match of pathMatches) {
          const dir = getTopDirectory(match.trim());
          contributor.directories.set(dir, (contributor.directories.get(dir) || 0) + 1);
        }
      }
    }

    // For contributors with no directory data from messages, assign based on general activity
    for (const [, contributor] of contribMap) {
      if (contributor.directories.size === 0 && contributor.contributions > 0) {
        // Assign to a "general" category
        contributor.directories.set('general', contributor.contributions);
      }
    }
  }, []);

  // Build bubble chart data
  const { nodes, edges } = useMemo(() => {
    if (contributors.length === 0) return { nodes: [], edges: [] };

    const dirSet = new Map<string, number>();
    for (const c of contributors) {
      for (const [dir, count] of c.directories) {
        dirSet.set(dir, (dirSet.get(dir) || 0) + count);
      }
    }

    const topContributors = contributors.slice(0, 30);
    const allDirs = Array.from(dirSet.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const maxContrib = Math.max(...topContributors.map((c) => c.contributions), 1);
    const maxDirCount = Math.max(...allDirs.map(([, c]) => c), 1);

    const cx = 500;
    const cy = 400;

    const bubbleNodes: BubbleNode[] = [];
    const bubbleEdges: BubbleEdge[] = [];

    // Place contributors in an inner ring - wider spread
    topContributors.forEach((c, i) => {
      const angle = (i / topContributors.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 220 + (i % 3) * 40;
      const sizeRatio = c.contributions / maxContrib;
      // Dynamic size: at least big enough for the label text (~6px per char) + padding
      const textSize = c.login.length * 5 + 16;
      const contribSize = Math.max(28, Math.sqrt(sizeRatio) * 55);

      bubbleNodes.push({
        id: `user:${c.login}`,
        type: 'contributor',
        label: c.login,
        avatar: c.avatar_url,
        size: Math.max(contribSize, textSize),
        x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
        y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        color: '#6366F1',
        contributions: c.contributions,
      });
    });

    // Place directories in outer ring - wider spread
    allDirs.forEach(([dir, count], i) => {
      const angle = (i / allDirs.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 420 + (i % 2) * 50;
      const sizeRatio = count / maxDirCount;
      // Dynamic size: fit text inside the circle
      const textSize = dir.length * 5 + 14;
      const dirSize = Math.max(24, Math.sqrt(sizeRatio) * 50);

      bubbleNodes.push({
        id: `dir:${dir}`,
        type: 'directory',
        label: dir,
        size: Math.max(dirSize, textSize),
        x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 30,
        y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
        color: DIR_COLORS[i % DIR_COLORS.length],
        fileCount: count,
      });
    });

    // Create edges
    for (const c of topContributors) {
      for (const [dir, weight] of c.directories) {
        if (allDirs.some(([d]) => d === dir)) {
          bubbleEdges.push({
            source: `user:${c.login}`,
            target: `dir:${dir}`,
            weight,
          });
        }
      }
    }

    return { nodes: bubbleNodes, edges: bubbleEdges };
  }, [contributors]);

  // Canvas rendering with simple force simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const w = rect.width;
    const h = rect.height;

    // Deep copy nodes for simulation
    const simNodes: BubbleNode[] = nodes.map((n) => ({
      ...n,
      x: (n.x / 1000) * w,
      y: (n.y / 800) * h,
    }));

    nodesRef.current = simNodes;
    edgesRef.current = edges;

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    let tick = 0;

    function simulate() {
      tick++;
      const alpha = Math.max(0.01, 1 - tick / 300);

      // Center gravity
      const cx = w / 2;
      const cy = h / 2;

      for (const node of simNodes) {
        node.vx += (cx - node.x) * 0.001 * alpha;
        node.vy += (cy - node.y) * 0.001 * alpha;
      }

      // Edge attraction
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 220;
        const force = (dist - targetDist) * 0.0015 * alpha;

        s.vx += (dx / dist) * force;
        s.vy += (dy / dist) * force;
        t.vx -= (dx / dist) * force;
        t.vy -= (dy / dist) * force;
      }

      // Repulsion
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i];
          const b = simNodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.size + b.size + 40;

          if (dist < minDist) {
            const force = ((minDist - dist) / dist) * 0.7;
            a.vx -= dx * force;
            a.vy -= dy * force;
            b.vx += dx * force;
            b.vy += dy * force;
          }
        }
      }

      // Apply velocity
      for (const node of simNodes) {
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;

        // Keep in bounds
        node.x = Math.max(node.size, Math.min(w - node.size, node.x));
        node.y = Math.max(node.size, Math.min(h - node.size, node.y));
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      // Draw edges
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = `rgba(99, 102, 241, ${Math.min(0.4, edge.weight * 0.08)})`;
        ctx.lineWidth = Math.max(1, Math.min(3, edge.weight * 0.5));
        ctx.stroke();
      }

      // Draw nodes
      for (const node of simNodes) {
        ctx.save();

        if (node.type === 'contributor') {
          // Pick gradient based on node index
          const idx = simNodes.indexOf(node);
          const [c1, c2] = CONTRIB_GRADIENTS[idx % CONTRIB_GRADIENTS.length];

          // Outer glow ring
          const glowGrad = ctx.createRadialGradient(
            node.x, node.y, node.size * 0.7,
            node.x, node.y, node.size * 1.6
          );
          glowGrad.addColorStop(0, c1 + '30');
          glowGrad.addColorStop(1, c1 + '00');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size * 1.6, 0, Math.PI * 2);
          ctx.fill();

          // Gradient-filled circle
          const circleGrad = ctx.createLinearGradient(
            node.x - node.size, node.y - node.size,
            node.x + node.size, node.y + node.size
          );
          circleGrad.addColorStop(0, c1);
          circleGrad.addColorStop(1, c2);
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
          ctx.fillStyle = circleGrad;
          ctx.fill();

          // Inner dark circle (donut effect)
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size * 0.72, 0, Math.PI * 2);
          ctx.fillStyle = '#0f0f1a';
          ctx.fill();

          // Initial letter inside
          const initial = node.label[0]?.toUpperCase() || '?';
          const initialSize = Math.max(12, node.size * 0.55);
          ctx.fillStyle = c1;
          ctx.font = `bold ${initialSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(initial, node.x, node.y);
          ctx.textBaseline = 'alphabetic';

          // Accent ring stroke
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
          ctx.strokeStyle = c1;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Label below
          const contribFontSize = Math.max(10, Math.min(14, node.size * 0.35));
          ctx.fillStyle = '#e2e8f0';
          ctx.font = `${contribFontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(node.label, node.x, node.y + node.size + 14);
        } else {
          // Directory bubble
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
          ctx.fillStyle = node.color + '30';
          ctx.fill();
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Label - dynamic font size to fit inside circle
          const dirFontSize = Math.max(9, Math.min(13, (node.size * 1.6) / Math.max(node.label.length, 1)));
          ctx.fillStyle = node.color;
          ctx.font = `bold ${dirFontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(node.label, node.x, node.y + dirFontSize * 0.35);
        }

        ctx.restore();
      }
    }

    function loop() {
      simulate();
      draw();
      if (tick < 400) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    }

    loop();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [nodes, edges]);

  // Hit test on mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found: BubbleNode | null = null;
    for (const node of nodesRef.current) {
      const dx = mx - node.x;
      const dy = my - node.y;
      if (dx * dx + dy * dy < node.size * node.size) {
        found = node;
        break;
      }
    }

    setHoveredNode(found);
    setMousePos({ x: e.clientX + 12, y: e.clientY + 12 });
    canvas.style.cursor = found ? 'pointer' : 'default';
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <Users size={48} strokeWidth={1} className={styles.pulse} />
          <p>Loading contributor data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <Users size={48} strokeWidth={1} />
          <p style={{ color: 'var(--error)' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>
          <Users size={16} />
          Contributors Network
        </span>
        <span className={styles.stats}>
          {contributors.length} contributors
        </span>
      </div>

      <div className={styles.canvasWrap} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredNode(null)}
        />
      </div>

      {/* Contributor list sidebar */}
      <div className={styles.sidebar}>
        {contributors.slice(0, 20).map((c, i) => (
          <div key={c.login} className={styles.contribRow}>
            <span className={styles.rank}>#{i + 1}</span>
            <StyledAvatar name={c.login} size={22} />
            <span className={styles.login}>{c.login}</span>
            <span className={styles.count}>{c.contributions} commits</span>
          </div>
        ))}
      </div>

      {hoveredNode && (
        <div
          className={styles.tooltip}
          style={{ left: mousePos.x, top: mousePos.y }}
        >
          <div className={styles.tooltipTitle}>{hoveredNode.label}</div>
          <div className={styles.tooltipMeta}>
            {hoveredNode.type === 'contributor' ? (
              <span>{hoveredNode.contributions} contributions</span>
            ) : (
              <span>{hoveredNode.fileCount} activities</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
