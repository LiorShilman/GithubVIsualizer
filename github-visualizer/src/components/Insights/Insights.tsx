import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3, Loader2, Calendar, Code2, Users, TrendingUp,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import {
  parseRepoUrl, fetchPunchCard, fetchCodeFrequency,
  fetchCommitActivity, fetchContributorStats,
} from '@/services/github.ts';
import type {
  PunchCardEntry, CodeFreqEntry, WeeklyActivity, ContributorStats,
} from '@/services/github.ts';
import styles from './Insights.module.css';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`
);

function formatNum(n: number): string {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function Insights() {
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const repoUrl = useRepoStore((s) => s.repoUrl);
  const token = useRepoStore((s) => s.token);

  const [punchCard, setPunchCard] = useState<PunchCardEntry[]>([]);
  const [codeFreq, setCodeFreq] = useState<CodeFreqEntry[]>([]);
  const [commitActivity, setCommitActivity] = useState<WeeklyActivity[]>([]);
  const [contribStats, setContribStats] = useState<ContributorStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback(async () => {
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed || !repoInfo) return;
    setLoading(true);
    try {
      // GitHub stats API may return 202 (computing) — retry once
      const tryFetch = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
        try {
          const res = await fn();
          if (Array.isArray(res) && res.length === 0) {
            // May be computing, retry after delay
            await new Promise((r) => setTimeout(r, 2000));
            return fn();
          }
          return res;
        } catch { return null; }
      };

      const [pc, cf, ca, cs] = await Promise.all([
        tryFetch(() => fetchPunchCard(parsed.owner, parsed.repo, token || undefined)),
        tryFetch(() => fetchCodeFrequency(parsed.owner, parsed.repo, token || undefined)),
        tryFetch(() => fetchCommitActivity(parsed.owner, parsed.repo, token || undefined)),
        tryFetch(() => fetchContributorStats(parsed.owner, parsed.repo, token || undefined)),
      ]);

      if (Array.isArray(pc)) setPunchCard(pc);
      if (Array.isArray(cf)) setCodeFreq(cf);
      if (Array.isArray(ca)) setCommitActivity(ca);
      if (Array.isArray(cs)) setContribStats(cs.sort((a, b) => b.total - a.total));
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setLoading(false);
    }
  }, [repoUrl, repoInfo, token]);

  useEffect(() => {
    if (repoInfo && !loaded) handleLoad();
  }, [repoInfo, loaded, handleLoad]);

  // ─── Punch card matrix ───
  const punchMatrix = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const [day, hour, count] of punchCard) {
      grid[day][hour] = count;
      if (count > max) max = count;
    }
    return { grid, max };
  }, [punchCard]);

  // ─── Code frequency (last 26 weeks) ───
  const codeFreqRecent = useMemo(() => {
    const recent = codeFreq.slice(-26);
    const maxVal = Math.max(...recent.map(([, a, d]) => Math.max(Math.abs(a), Math.abs(d))), 1);
    return { data: recent, max: maxVal };
  }, [codeFreq]);

  // ─── Total stats ───
  const totalStats = useMemo(() => {
    const totalAdditions = codeFreq.reduce((s, [, a]) => s + a, 0);
    const totalDeletions = codeFreq.reduce((s, [,, d]) => s + Math.abs(d), 0);
    const totalCommits = commitActivity.reduce((s, w) => s + w.total, 0);
    const recentWeeks = commitActivity.slice(-4);
    const recentCommits = recentWeeks.reduce((s, w) => s + w.total, 0);
    const prevWeeks = commitActivity.slice(-8, -4);
    const prevCommits = prevWeeks.reduce((s, w) => s + w.total, 0);
    const trend = prevCommits > 0 ? ((recentCommits - prevCommits) / prevCommits) * 100 : 0;
    return { totalAdditions, totalDeletions, totalCommits, recentCommits, trend };
  }, [codeFreq, commitActivity]);

  // ─── Weekly commit sparkline ───
  const weeklyData = useMemo(() => {
    const recent = commitActivity.slice(-12);
    const max = Math.max(...recent.map((w) => w.total), 1);
    return { data: recent, max };
  }, [commitActivity]);

  // ─── Busiest day/hour ───
  const busiestSlot = useMemo(() => {
    let maxD = 0, maxH = 0, maxC = 0;
    for (const [d, h, c] of punchCard) {
      if (c > maxC) { maxD = d; maxH = h; maxC = c; }
    }
    return { day: DAYS[maxD], hour: HOURS[maxH], count: maxC };
  }, [punchCard]);

  if (loading && !loaded) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <p>Computing insights...</p>
          <p className={styles.loadingSub}>GitHub may need a moment to prepare stats</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* ─── Stat cards ─── */}
      <div className={styles.statCards}>
        <div className={styles.statCard}>
          <Code2 size={18} className={styles.statIcon} style={{ color: '#22C55E' }} />
          <div className={styles.statInfo}>
            <div className={styles.statValue} style={{ color: '#22C55E' }}>+{formatNum(totalStats.totalAdditions)}</div>
            <div className={styles.statLabel}>Lines added</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <Code2 size={18} className={styles.statIcon} style={{ color: '#EF4444' }} />
          <div className={styles.statInfo}>
            <div className={styles.statValue} style={{ color: '#EF4444' }}>-{formatNum(totalStats.totalDeletions)}</div>
            <div className={styles.statLabel}>Lines removed</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <BarChart3 size={18} className={styles.statIcon} style={{ color: '#6366F1' }} />
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{formatNum(totalStats.totalCommits)}</div>
            <div className={styles.statLabel}>Total commits</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <TrendingUp size={18} className={styles.statIcon} style={{ color: totalStats.trend >= 0 ? '#22C55E' : '#EF4444' }} />
          <div className={styles.statInfo}>
            <div className={styles.statValue} style={{ color: totalStats.trend >= 0 ? '#22C55E' : '#EF4444' }}>
              {totalStats.trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(totalStats.trend).toFixed(0)}%
            </div>
            <div className={styles.statLabel}>4-week trend</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <Users size={18} className={styles.statIcon} style={{ color: '#EC4899' }} />
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{contribStats.length}</div>
            <div className={styles.statLabel}>Contributors</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <Calendar size={18} className={styles.statIcon} style={{ color: '#F59E0B' }} />
          <div className={styles.statInfo}>
            <div className={styles.statValue}>{busiestSlot.day} {busiestSlot.hour}</div>
            <div className={styles.statLabel}>Peak time</div>
          </div>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        {/* ─── Punch card heatmap ─── */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>
            <Calendar size={14} /> Commit Punch Card
          </div>
          <div className={styles.chartSub}>When do commits happen?</div>
          <div className={styles.punchCard}>
            {/* Hour labels */}
            <div className={styles.punchRow}>
              <div className={styles.punchDayLabel} />
              {HOURS.map((h, i) => (
                <div key={i} className={styles.punchHourLabel}>{i % 3 === 0 ? h : ''}</div>
              ))}
            </div>
            {/* Grid */}
            {DAYS.map((day, d) => (
              <div key={day} className={styles.punchRow}>
                <div className={styles.punchDayLabel}>{day}</div>
                {Array.from({ length: 24 }, (_, h) => {
                  const val = punchMatrix.grid[d][h];
                  const intensity = punchMatrix.max > 0 ? val / punchMatrix.max : 0;
                  return (
                    <div
                      key={h}
                      className={styles.punchCell}
                      title={`${day} ${HOURS[h]}: ${val} commits`}
                      style={{
                        background: val > 0
                          ? `rgba(99, 102, 241, ${0.15 + intensity * 0.75})`
                          : 'rgba(128,128,128,0.06)',
                        transform: val > 0 ? `scale(${0.7 + intensity * 0.3})` : 'scale(0.7)',
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ─── Code frequency chart ─── */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>
            <Code2 size={14} /> Code Frequency
          </div>
          <div className={styles.chartSub}>Additions & deletions per week (last 6 months)</div>
          <div className={styles.codeFreqChart}>
            {codeFreqRecent.data.map(([ts, adds, dels], i) => {
              const addH = (adds / codeFreqRecent.max) * 100;
              const delH = (Math.abs(dels) / codeFreqRecent.max) * 100;
              const date = new Date(ts * 1000);
              return (
                <div key={i} className={styles.freqCol}
                  title={`${date.toLocaleDateString()}\n+${adds} / ${dels}`}>
                  <div className={styles.freqBarUp}>
                    <div className={styles.freqFillUp} style={{ height: `${Math.max(2, addH)}%` }} />
                  </div>
                  <div className={styles.freqBarDown}>
                    <div className={styles.freqFillDown} style={{ height: `${Math.max(2, delH)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.freqLegend}>
            <span className={styles.freqLegendAdd}>Additions</span>
            <span className={styles.freqLegendDel}>Deletions</span>
          </div>
        </div>

        {/* ─── Weekly activity ─── */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>
            <BarChart3 size={14} /> Weekly Commits
          </div>
          <div className={styles.chartSub}>Last 12 weeks</div>
          <div className={styles.weeklyChart}>
            {weeklyData.data.map((w, i) => {
              const h = (w.total / weeklyData.max) * 100;
              const date = new Date(w.week * 1000);
              return (
                <div key={i} className={styles.weekCol}
                  title={`Week of ${date.toLocaleDateString()}: ${w.total} commits`}>
                  <div className={styles.weekBar}
                    style={{ height: `${Math.max(4, h)}%`, opacity: 0.5 + (h / 100) * 0.5 }} />
                  <span className={styles.weekLabel}>
                    {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Top contributors ─── */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>
            <Users size={14} /> Top Contributors
          </div>
          <div className={styles.chartSub}>By total commits</div>
          <div className={styles.contribList}>
            {contribStats.slice(0, 10).map((c, i) => {
              const maxCommits = contribStats[0]?.total || 1;
              const pct = (c.total / maxCommits) * 100;
              // Recent activity: last 4 weeks
              const recent4 = c.weeks.slice(-4);
              const recentTotal = recent4.reduce((s, w) => s + w.c, 0);
              const recentAdd = recent4.reduce((s, w) => s + w.a, 0);
              const recentDel = recent4.reduce((s, w) => s + w.d, 0);
              return (
                <div key={c.author.login} className={styles.contribRow}>
                  <span className={styles.contribRank}>#{i + 1}</span>
                  <img src={c.author.avatar_url} alt="" className={styles.contribAvatar} />
                  <div className={styles.contribInfo}>
                    <div className={styles.contribName}>{c.author.login}</div>
                    <div className={styles.contribBarTrack}>
                      <div className={styles.contribBarFill} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className={styles.contribStats}>
                    <span className={styles.contribTotal}>{c.total} commits</span>
                    <span className={styles.contribRecent}>
                      {recentTotal > 0 && (
                        <>
                          <span className={styles.contribAdd}>+{formatNum(recentAdd)}</span>
                          <span className={styles.contribDel}>-{formatNum(recentDel)}</span>
                        </>
                      )}
                    </span>
                  </div>
                  {/* Mini sparkline */}
                  <div className={styles.contribSpark}>
                    {c.weeks.slice(-12).map((w, wi) => (
                      <div key={wi} className={styles.contribSparkBar}
                        style={{
                          height: `${Math.max(2, (w.c / Math.max(...c.weeks.slice(-12).map(ww => ww.c), 1)) * 100)}%`,
                          opacity: w.c > 0 ? 0.5 + (w.c / Math.max(...c.weeks.slice(-12).map(ww => ww.c), 1)) * 0.5 : 0.15,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
