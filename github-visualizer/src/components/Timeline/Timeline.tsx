import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Clock, Play, Pause, SkipBack, SkipForward, GitCommit } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { parseRepoUrl, fetchBranchCommits } from '@/services/github.ts';
import type { GitHubCommit } from '@/types/index.ts';
import { StyledAvatar } from '@/components/shared/StyledAvatar.tsx';
import styles from './Timeline.module.css';

interface TimelineEntry {
  sha: string;
  message: string;
  author: string;
  avatar: string;
  date: Date;
}

/* ---- Particle burst effect for commit transitions ---- */
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: string;
  shape: 'circle' | 'star' | 'ring';
}

function spawnBurst(canvas: HTMLCanvasElement, color: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.offsetWidth * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  ctx.scale(dpr, dpr);

  const cx = canvas.offsetWidth / 2;
  const cy = canvas.offsetHeight / 2;
  const shapes: Particle['shape'][] = ['circle', 'star', 'ring'];

  const particles: Particle[] = Array.from({ length: 28 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4;
    return {
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1, maxLife: 0.6 + Math.random() * 0.6,
      size: 2 + Math.random() * 5,
      color,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    };
  });

  let raf = 0;
  const dt = 0.028;
  const c = ctx; // non-null alias

  function drawStar(x: number, y: number, r: number) {
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  }

  function frame() {
    c.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    let alive = false;

    for (const p of particles) {
      p.life -= dt / p.maxLife;
      if (p.life <= 0) continue;
      alive = true;

      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.vx *= 0.99;

      const alpha = Math.max(0, p.life);
      c.globalAlpha = alpha;
      c.fillStyle = p.color;
      c.strokeStyle = p.color;

      if (p.shape === 'circle') {
        c.beginPath();
        c.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        c.fill();
      } else if (p.shape === 'star') {
        drawStar(p.x, p.y, p.size * alpha * 1.2);
      } else {
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(p.x, p.y, p.size * alpha * 1.5, 0, Math.PI * 2);
        c.stroke();
      }
    }

    c.globalAlpha = 1;
    if (alive) raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  setTimeout(() => cancelAnimationFrame(raf), 2000);
}

const AUTHOR_COLORS = [
  '#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#84CC16', '#F97316', '#A855F7',
];

export function Timeline() {
  const repoUrl = useRepoStore((s) => s.repoUrl);
  const token = useRepoStore((s) => s.token);
  const branch = useRepoStore((s) => s.branch);

  const [commits, setCommits] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1500);
  const intervalRef = useRef<number>(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const burstCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevIndexRef = useRef<number>(-1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const parsed = parseRepoUrl(repoUrl);
      if (!parsed) return;

      setLoading(true);
      try {
        const raw: GitHubCommit[] = await fetchBranchCommits(
          parsed.owner, parsed.repo, branch, token || undefined, 100
        );

        if (cancelled) return;

        const entries: TimelineEntry[] = raw
          .map((c) => ({
            sha: c.sha.slice(0, 7),
            message: c.commit.message.split('\n')[0],
            author: c.author?.login || c.commit.author.name,
            avatar: c.author?.avatar_url || '',
            date: new Date(c.commit.author.date),
          }))
          .reverse();

        setCommits(entries);
        setCurrentIndex(entries.length - 1);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [repoUrl, token, branch]);

  // Author color map
  const authorColors = useMemo(() => {
    const map = new Map<string, string>();
    const unique = [...new Set(commits.map((c) => c.author))];
    unique.forEach((a, i) => map.set(a, AUTHOR_COLORS[i % AUTHOR_COLORS.length]));
    return map;
  }, [commits]);

  // Build per-day commit count for energy bars
  const dayCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of commits) {
      const key = c.date.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [commits]);
  const maxDayCount = Math.max(...Array.from(dayCountMap.values()), 1);

  // Activity sparkline data - commits per day
  const activityData = useMemo(() => {
    if (commits.length === 0) return [];
    const dayMap = new Map<string, number>();
    for (const c of commits) {
      const key = c.date.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) || 0) + 1);
    }
    const entries = Array.from(dayMap.entries()).sort();
    const max = Math.max(...entries.map(([, v]) => v), 1);
    return entries.map(([day, count]) => ({ day, count, ratio: count / max }));
  }, [commits]);

  // Auto-play
  useEffect(() => {
    if (playing && commits.length > 0) {
      intervalRef.current = window.setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= commits.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, speed);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, speed, commits.length]);

  // Scroll active commit into view
  useEffect(() => {
    const el = timelineRef.current?.querySelector(`[data-index="${currentIndex}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentIndex]);

  // Trigger particle burst on commit change
  useEffect(() => {
    if (prevIndexRef.current !== -1 && prevIndexRef.current !== currentIndex && burstCanvasRef.current && commits.length > 0) {
      const color = authorColors.get(commits[currentIndex]?.author) || '#6366F1';
      spawnBurst(burstCanvasRef.current, color);
    }
    prevIndexRef.current = currentIndex;
  }, [currentIndex, commits, authorColors]);

  const handlePlay = useCallback(() => {
    if (currentIndex >= commits.length - 1) {
      setCurrentIndex(0);
    }
    setPlaying((p) => !p);
  }, [currentIndex, commits.length]);

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentIndex(Number(e.target.value));
    setPlaying(false);
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Clock size={48} strokeWidth={1} className={styles.pulse} />
          <p>Loading commit history...</p>
        </div>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Clock size={48} strokeWidth={1} />
          <p>No commits found</p>
        </div>
      </div>
    );
  }

  const current = commits[currentIndex];
  const progress = commits.length > 1 ? (currentIndex / (commits.length - 1)) * 100 : 100;
  const currentColor = authorColors.get(current.author) || '#6366F1';

  // Group commits by month
  const months = new Map<string, { entries: TimelineEntry[]; startIdx: number }>();
  commits.forEach((c, i) => {
    const key = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, '0')}`;
    if (!months.has(key)) months.set(key, { entries: [], startIdx: i });
    months.get(key)!.entries.push(c);
  });

  // Time ago helper
  function timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>
          <Clock size={16} />
          Animated Timeline
        </span>
        <span className={styles.stats}>{commits.length} commits</span>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button className={styles.controlBtn} onClick={() => { setCurrentIndex(0); setPlaying(false); }}>
          <SkipBack size={16} />
        </button>
        <button className={`${styles.controlBtn} ${playing ? styles.controlBtnActive : ''}`} onClick={handlePlay}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className={styles.controlBtn} onClick={() => { setCurrentIndex(commits.length - 1); setPlaying(false); }}>
          <SkipForward size={16} />
        </button>

        <input
          type="range"
          min="0"
          max={commits.length - 1}
          value={currentIndex}
          onChange={handleSlider}
          className={styles.slider}
        />

        <select
          className={styles.speedSelect}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value={2500}>0.5x</option>
          <option value={1500}>1x</option>
          <option value={800}>2x</option>
          <option value={400}>4x</option>
        </select>

        <span className={styles.counter}>{currentIndex + 1} / {commits.length}</span>
      </div>

      {/* Activity sparkline */}
      <div className={styles.sparkline}>
        {activityData.map((d, i) => (
          <div
            key={i}
            className={styles.sparkBar}
            style={{
              height: `${Math.max(4, d.ratio * 100)}%`,
              background: i <= Math.round((currentIndex / commits.length) * activityData.length)
                ? 'var(--accent)'
                : 'var(--border)',
            }}
            title={`${d.day}: ${d.count} commits`}
          />
        ))}
      </div>

      {/* Current commit hero card */}
      <div className={styles.currentCommit}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.commitCard} style={{ borderLeftColor: currentColor }}>
          <canvas ref={burstCanvasRef} className={styles.burstCanvas} />
          <StyledAvatar name={current.author} size={42} />
          <div className={styles.commitInfo}>
            <div className={styles.commitMsg}>{current.message}</div>
            <div className={styles.commitMeta}>
              <span className={styles.authorBadge} style={{ background: currentColor + '20', color: currentColor }}>
                {current.author}
              </span>
              <span className={styles.shaBadge}>{current.sha}</span>
              <span>{timeAgo(current.date)}</span>
              <span>{current.date.toLocaleDateString()} {current.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline visualization */}
      <div className={styles.timeline} ref={timelineRef}>
        {Array.from(months.entries()).map(([monthKey, { entries, startIdx }]) => (
          <div key={monthKey} className={styles.monthGroup}>
            <div className={styles.monthLabel}>
              <span className={styles.monthBadge}>
                {new Date(monthKey + '-01').toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
              </span>
              <span className={styles.monthCount}>{entries.length} commits</span>
            </div>
            <div className={styles.monthEntries}>
              {entries.map((entry, i) => {
                const globalIdx = startIdx + i;
                const isActive = globalIdx === currentIndex;
                const isPast = globalIdx <= currentIndex;
                const color = authorColors.get(entry.author) || '#6366F1';

                const dayKey = entry.date.toISOString().slice(0, 10);
                const dayCount = dayCountMap.get(dayKey) || 1;
                const energyRatio = dayCount / maxDayCount;

                return (
                  <div
                    key={entry.sha}
                    data-index={globalIdx}
                    className={`${styles.timelineNode} ${isActive ? styles.active : ''} ${isPast ? styles.past : ''}`}
                    onClick={() => { setCurrentIndex(globalIdx); setPlaying(false); }}
                  >
                    <div className={styles.nodeDot} style={isPast ? { background: color, borderColor: color } : undefined}>
                      {isActive && <GitCommit size={10} className={styles.dotIcon} />}
                    </div>

                    {/* Energy bar showing commit density */}
                    <div className={styles.energyBar} style={{ opacity: isPast ? 1 : 0.3 }}>
                      <div
                        className={styles.energyFill}
                        style={{
                          height: `${Math.max(15, energyRatio * 100)}%`,
                          background: color,
                        }}
                      />
                    </div>

                    <StyledAvatar name={entry.author} size={26} />

                    <div className={styles.nodeContent}>
                      <span className={styles.nodeMsg}>{entry.message}</span>
                      <div className={styles.nodeMetaRow}>
                        <span className={styles.nodeAuthor} style={{ color }}>{entry.author}</span>
                        <span className={styles.nodeSha}>{entry.sha}</span>
                        <span className={styles.nodeTime}>{timeAgo(entry.date)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
