import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import {
  parseRepoUrl, fetchContributors, fetchBranchCommits, fetchCommitDetail,
  fetchContributorStats,
} from '@/services/github.ts';
import type { GitHubContributor, CommitDetail } from '@/types/index.ts';
import type { ContributorStats } from '@/services/github.ts';
import styles from './Contributors.module.css';

/* ── Entity types ── */
interface CodeEntity {
  type: 'component' | 'service' | 'store' | 'hook' | 'utility' | 'type' | 'config' | 'style' | 'other';
  name: string;
  key: string; // unique id
}

const ENTITY_COLORS: Record<CodeEntity['type'], string> = {
  component: '#6366F1',
  service:   '#22C55E',
  store:     '#F59E0B',
  hook:      '#EC4899',
  utility:   '#06B6D4',
  type:      '#8B5CF6',
  config:    '#F97316',
  style:     '#14B8A6',
  other:     '#64748B',
};

const ENTITY_LABELS: Record<CodeEntity['type'], string> = {
  component: 'Component',
  service:   'Service',
  store:     'Store',
  hook:      'Hook',
  utility:   'Utility',
  type:      'Type',
  config:    'Config',
  style:     'Style',
  other:     'Other',
};

/* ── Extract entity from a file path ── */
function extractEntity(filepath: string): CodeEntity | null {
  const parts = filepath.split('/');
  const fileName = parts[parts.length - 1];
  const baseName = fileName.replace(/\.\w+$/, '').replace('.module', '');

  // Skip non-meaningful files
  if (fileName === '.gitignore' || fileName === '.eslintrc' || fileName.startsWith('.')) return null;

  // src/components/ComponentName/...
  const compIdx = parts.indexOf('components');
  if (compIdx >= 0 && parts.length > compIdx + 1) {
    return { type: 'component', name: parts[compIdx + 1], key: `component:${parts[compIdx + 1]}` };
  }

  // src/services/filename.ts
  const svcIdx = parts.indexOf('services');
  if (svcIdx >= 0 && parts.length > svcIdx + 1) {
    return { type: 'service', name: baseName, key: `service:${baseName}` };
  }

  // src/store/filename.ts
  const storeIdx = parts.indexOf('store');
  if (storeIdx >= 0 && parts.length > storeIdx + 1) {
    return { type: 'store', name: baseName, key: `store:${baseName}` };
  }

  // src/hooks/filename.ts or useXxx pattern
  const hookIdx = parts.indexOf('hooks');
  if (hookIdx >= 0 || (baseName.startsWith('use') && baseName.length > 3)) {
    return { type: 'hook', name: baseName, key: `hook:${baseName}` };
  }

  // src/utils/filename.ts
  const utilIdx = parts.indexOf('utils');
  if (utilIdx >= 0 && parts.length > utilIdx + 1) {
    return { type: 'utility', name: baseName, key: `utility:${baseName}` };
  }

  // src/types/...
  if (parts.includes('types')) {
    return { type: 'type', name: 'types', key: 'type:types' };
  }

  // CSS/style files at top level
  if (fileName.endsWith('.css') || fileName.endsWith('.scss')) {
    return { type: 'style', name: baseName, key: `style:${baseName}` };
  }

  // Config files at root
  if (parts.length <= 2 && (
    fileName.endsWith('.json') || fileName.endsWith('.js') || fileName.endsWith('.ts') ||
    fileName.endsWith('.cjs') || fileName.endsWith('.mjs') || fileName === 'Dockerfile'
  )) {
    return { type: 'config', name: fileName, key: `config:${fileName}` };
  }

  return null;
}

/* ── Contributor gradients ── */
const CONTRIB_GRADIENTS = [
  ['#6366F1', '#A855F7'],
  ['#EC4899', '#F43F5E'],
  ['#14B8A6', '#06B6D4'],
  ['#F59E0B', '#EF4444'],
  ['#8B5CF6', '#6366F1'],
  ['#06B6D4', '#22C55E'],
  ['#F97316', '#F59E0B'],
  ['#E11D48', '#EC4899'],
  ['#10B981', '#14B8A6'],
  ['#A855F7', '#EC4899'],
];

/* ── Bubble types ── */
interface BubbleNode {
  id: string;
  type: 'contributor' | 'entity';
  entityType?: CodeEntity['type'];
  label: string;
  avatar?: string;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  contributions?: number;
  changes?: number;
  additions?: number;
  deletions?: number;
}

interface BubbleEdge {
  source: string;
  target: string;
  weight: number;
}

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function Contributors() {
  const repoUrl = useRepoStore((s) => s.repoUrl);
  const token = useRepoStore((s) => s.token);
  const branch = useRepoStore((s) => s.branch);

  const [contribs, setContribs] = useState<GitHubContributor[]>([]);
  const [contribStatsData, setContribStatsData] = useState<ContributorStats[]>([]);
  const [entityMap, setEntityMap] = useState<Map<string, { entity: CodeEntity; byAuthor: Map<string, number> }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Loading contributors...');
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<BubbleNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const nodesRef = useRef<BubbleNode[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const parsed = parseRepoUrl(repoUrl);
      if (!parsed) return;

      setLoading(true);
      setError(null);

      try {
        setLoadingMsg('Fetching contributors...');
        const [contribList, commits, stats] = await Promise.all([
          fetchContributors(parsed.owner, parsed.repo, token || undefined),
          fetchBranchCommits(parsed.owner, parsed.repo, branch, token || undefined, 100),
          fetchContributorStats(parsed.owner, parsed.repo, token || undefined).catch(() => []),
        ]);

        if (cancelled) return;
        setContribs(contribList);
        if (Array.isArray(stats)) {
          setContribStatsData(stats.sort((a, b) => b.total - a.total));
        }

        // Fetch commit details for up to 30 recent commits to get file-level data
        setLoadingMsg('Analyzing file ownership...');
        const commitShas = commits.slice(0, 30).map((c) => c.sha);
        const details: CommitDetail[] = [];

        // Batch in groups of 5 to avoid hammering API
        for (let i = 0; i < commitShas.length; i += 5) {
          if (cancelled) return;
          const batch = commitShas.slice(i, i + 5);
          const results = await Promise.all(
            batch.map((sha) =>
              fetchCommitDetail(parsed.owner, parsed.repo, sha, token || undefined).catch(() => null)
            )
          );
          for (const r of results) {
            if (r) details.push(r);
          }
        }

        if (cancelled) return;

        // Build entity → author mapping
        const eMap = new Map<string, { entity: CodeEntity; byAuthor: Map<string, number> }>();

        for (const detail of details) {
          const login = detail.author?.login;
          if (!login || !detail.files) continue;

          for (const file of detail.files) {
            const entity = extractEntity(file.filename);
            if (!entity) continue;

            let entry = eMap.get(entity.key);
            if (!entry) {
              entry = { entity, byAuthor: new Map() };
              eMap.set(entity.key, entry);
            }
            entry.byAuthor.set(login, (entry.byAuthor.get(login) || 0) + file.changes);
          }
        }

        setEntityMap(eMap);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [repoUrl, token, branch]);

  // Build graph
  const { nodes, edges } = useMemo(() => {
    if (contribs.length === 0 || entityMap.size === 0) return { nodes: [], edges: [] };

    // Find contributors who appear in entity data
    const activeLogins = new Set<string>();
    for (const [, entry] of entityMap) {
      for (const login of entry.byAuthor.keys()) activeLogins.add(login);
    }

    const topContribs = contribs
      .filter((c) => activeLogins.has(c.login))
      .slice(0, 15);

    // Get stats per contributor
    const statsMap = new Map(contribStatsData.map((s) => [s.author.login, s]));

    const maxContrib = Math.max(...topContribs.map((c) => c.contributions), 1);

    // Sort entities by total changes
    const sortedEntities = Array.from(entityMap.entries())
      .map(([key, entry]) => {
        let totalChanges = 0;
        for (const v of entry.byAuthor.values()) totalChanges += v;
        return { key, ...entry, totalChanges };
      })
      .sort((a, b) => b.totalChanges - a.totalChanges)
      .slice(0, 25);

    const maxEntityChanges = Math.max(...sortedEntities.map((e) => e.totalChanges), 1);

    const cx = 500, cy = 400;
    const bubbleNodes: BubbleNode[] = [];
    const bubbleEdges: BubbleEdge[] = [];

    // Contributors — inner ring
    topContribs.forEach((c, i) => {
      const angle = (i / topContribs.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 180 + (i % 3) * 30;
      const sizeRatio = c.contributions / maxContrib;
      const nodeSize = Math.max(30, Math.sqrt(sizeRatio) * 55);

      const stat = statsMap.get(c.login);
      const totalAdd = stat ? stat.weeks.reduce((s, w) => s + w.a, 0) : 0;
      const totalDel = stat ? stat.weeks.reduce((s, w) => s + w.d, 0) : 0;

      bubbleNodes.push({
        id: `user:${c.login}`,
        type: 'contributor',
        label: c.login,
        avatar: c.avatar_url,
        size: nodeSize,
        x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
        y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
        color: '#6366F1',
        contributions: c.contributions,
        additions: totalAdd,
        deletions: totalDel,
      });
    });

    // Entities — outer ring
    sortedEntities.forEach((entry, i) => {
      const angle = (i / sortedEntities.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 380 + (i % 2) * 40;
      const sizeRatio = entry.totalChanges / maxEntityChanges;
      const labelLen = entry.entity.name.length;
      const textSize = labelLen * 4.5 + 14;
      const entitySize = Math.max(22, Math.sqrt(sizeRatio) * 45);

      bubbleNodes.push({
        id: entry.key,
        type: 'entity',
        entityType: entry.entity.type,
        label: entry.entity.name,
        size: Math.max(entitySize, textSize),
        x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
        y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
        color: ENTITY_COLORS[entry.entity.type],
        changes: entry.totalChanges,
      });

      // Create edges to contributors
      for (const [login, weight] of entry.byAuthor) {
        if (topContribs.some((c) => c.login === login)) {
          bubbleEdges.push({
            source: `user:${login}`,
            target: entry.key,
            weight,
          });
        }
      }
    });

    return { nodes: bubbleNodes, edges: bubbleEdges };
  }, [contribs, entityMap, contribStatsData]);

  // Canvas rendering with force simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const w = rect.width;
    const h = rect.height;

    const simNodes: BubbleNode[] = nodes.map((n) => ({
      ...n,
      x: (n.x / 1000) * w,
      y: (n.y / 800) * h,
    }));

    nodesRef.current = simNodes;
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    let tick = 0;

    function simulate() {
      tick++;
      const alpha = Math.max(0.01, 1 - tick / 300);
      const cx = w / 2, cy = h / 2;

      for (const node of simNodes) {
        node.vx += (cx - node.x) * 0.001 * alpha;
        node.vy += (cy - node.y) * 0.001 * alpha;
      }

      // Edge attraction
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;
        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 200;
        const force = (dist - targetDist) * 0.0012 * alpha;
        s.vx += (dx / dist) * force;
        s.vy += (dy / dist) * force;
        t.vx -= (dx / dist) * force;
        t.vy -= (dy / dist) * force;
      }

      // Repulsion
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i], b = simNodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.size + b.size + 30;
          if (dist < minDist) {
            const force = ((minDist - dist) / dist) * 0.6;
            a.vx -= dx * force; a.vy -= dy * force;
            b.vx += dx * force; b.vy += dy * force;
          }
        }
      }

      for (const node of simNodes) {
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(node.size + 10, Math.min(w - node.size - 10, node.x));
        node.y = Math.max(node.size + 10, Math.min(h - node.size - 10, node.y));
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

        const maxWeight = Math.max(...edges.map((e) => e.weight), 1);
        const norm = edge.weight / maxWeight;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = `rgba(${t.color === '#6366F1' ? '99,102,241' : hexToRgb(t.color)}, ${0.1 + norm * 0.35})`;
        ctx.lineWidth = Math.max(1, norm * 3);
        ctx.stroke();
      }

      // Draw nodes
      for (const node of simNodes) {
        ctx.save();

        if (node.type === 'contributor') {
          const idx = simNodes.indexOf(node);
          const [c1, c2] = CONTRIB_GRADIENTS[idx % CONTRIB_GRADIENTS.length];

          // Outer glow
          const glowGrad = ctx.createRadialGradient(node.x, node.y, node.size * 0.7, node.x, node.y, node.size * 1.5);
          glowGrad.addColorStop(0, c1 + '25');
          glowGrad.addColorStop(1, c1 + '00');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size * 1.5, 0, Math.PI * 2);
          ctx.fill();

          // Gradient ring
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

          // Inner dark circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size * 0.72, 0, Math.PI * 2);
          ctx.fillStyle = '#0f0f1a';
          ctx.fill();

          // Initial letter
          const initial = node.label[0]?.toUpperCase() || '?';
          const initialSize = Math.max(12, node.size * 0.5);
          ctx.fillStyle = c1;
          ctx.font = `bold ${initialSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(initial, node.x, node.y);

          // Ring stroke
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
          ctx.strokeStyle = c1;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Name label below
          const fontSize = Math.max(10, Math.min(13, node.size * 0.32));
          ctx.fillStyle = '#e2e8f0';
          ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(node.label, node.x, node.y + node.size + 6);

          // Contribution count below name
          if (node.contributions) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = `500 ${Math.max(9, fontSize - 2)}px system-ui, sans-serif`;
            ctx.fillText(`${node.contributions} commits`, node.x, node.y + node.size + 6 + fontSize + 2);
          }
        } else {
          // Entity bubble
          const col = node.color;

          // Filled background
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
          ctx.fillStyle = col + '20';
          ctx.fill();

          // Border
          ctx.strokeStyle = col + '90';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Type badge above
          const badgeText = ENTITY_LABELS[node.entityType || 'other'];
          const badgeFontSize = Math.max(8, Math.min(10, node.size * 0.28));
          ctx.fillStyle = col;
          ctx.font = `700 ${badgeFontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText.toUpperCase(), node.x, node.y - node.size * 0.22);

          // Entity name
          const nameFontSize = Math.max(9, Math.min(13, (node.size * 1.5) / Math.max(node.label.length, 1)));
          ctx.fillStyle = '#e2e8f0';
          ctx.font = `600 ${nameFontSize}px system-ui, sans-serif`;
          ctx.fillText(node.label, node.x, node.y + node.size * 0.18);
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
    return () => { cancelAnimationFrame(animFrameRef.current); };
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
      const dx = mx - node.x, dy = my - node.y;
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
          <Loader2 size={32} className={styles.spinner} />
          <p>{loadingMsg}</p>
          <p className={styles.loadingSub}>Analyzing commit history for file ownership</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <Users size={48} strokeWidth={1} />
          <p className={styles.errorColor}>{error}</p>
        </div>
      </div>
    );
  }

  // Legend data
  const entityTypes = new Set<CodeEntity['type']>();
  for (const [, entry] of entityMap) entityTypes.add(entry.entity.type);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>
          <Users size={16} />
          Contributors & Code Ownership
        </span>
        <span className={styles.stats}>
          {contribs.length} contributors · {entityMap.size} code entities
        </span>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        {Array.from(entityTypes).map((t) => (
          <span key={t} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ backgroundColor: ENTITY_COLORS[t] }} />
            {ENTITY_LABELS[t]}
          </span>
        ))}
      </div>

      <div className={styles.canvasWrap} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredNode(null)}
        />
      </div>

      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarTitle}>Top Contributors</div>
        {contribStatsData.slice(0, 15).map((c, i) => {
          const totalAdd = c.weeks.reduce((s, w) => s + w.a, 0);
          const totalDel = c.weeks.reduce((s, w) => s + w.d, 0);
          return (
            <div key={c.author.login} className={styles.contribRow}>
              <span className={styles.rank}>#{i + 1}</span>
              <img src={c.author.avatar_url} alt="" className={styles.avatar} />
              <div className={styles.contribInfo}>
                <span className={styles.login}>{c.author.login}</span>
                <span className={styles.contribMeta}>
                  {c.total} commits
                  <span className={styles.addStat}>+{formatNum(totalAdd)}</span>
                  <span className={styles.delStat}>-{formatNum(totalDel)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {hoveredNode && (
        <div className={styles.tooltip} style={{ left: mousePos.x, top: mousePos.y }}>
          <div className={styles.tooltipTitle}>{hoveredNode.label}</div>
          {hoveredNode.type === 'contributor' ? (
            <div className={styles.tooltipMeta}>
              <span>{hoveredNode.contributions} commits</span>
              {hoveredNode.additions != null && (
                <>
                  <span className={styles.tooltipAdd}>+{formatNum(hoveredNode.additions)}</span>
                  <span className={styles.tooltipDel}>-{formatNum(hoveredNode.deletions || 0)}</span>
                </>
              )}
            </div>
          ) : (
            <div className={styles.tooltipMeta}>
              <span className={styles.tooltipBadge}>
                {ENTITY_LABELS[hoveredNode.entityType || 'other']}
              </span>
              <span>{hoveredNode.changes} changes</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Helper to convert hex to rgb string */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}
