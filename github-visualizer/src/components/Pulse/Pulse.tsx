import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity, GitPullRequest, CircleDot, Tag, Loader2,
  MessageSquare, GitMerge, Clock, ChevronDown, ChevronRight,
  ExternalLink, AlertCircle, CheckCircle2, FileCode2, Plus, Minus,
} from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import {
  parseRepoUrl, fetchPullRequests, fetchIssues, fetchReleases,
  fetchBranchCommits,
} from '@/services/github.ts';
import type { GitHubPR, GitHubIssue, GitHubRelease } from '@/services/github.ts';
import type { GitHubCommit } from '@/types/index.ts';
import styles from './Pulse.module.css';

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

type Section = 'prs' | 'issues' | 'releases' | 'activity';

/* ─── Main Component ─── */
export function Pulse() {
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const repoUrl = useRepoStore((s) => s.repoUrl);
  const token = useRepoStore((s) => s.token);

  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<Section>>(new Set());

  const handleLoad = useCallback(async () => {
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed || !repoInfo) return;
    setLoading(true);
    try {
      const [prData, issueData, releaseData, commitData] = await Promise.allSettled([
        fetchPullRequests(parsed.owner, parsed.repo, token || undefined, 'all'),
        fetchIssues(parsed.owner, parsed.repo, token || undefined, 'all'),
        fetchReleases(parsed.owner, parsed.repo, token || undefined),
        fetchBranchCommits(parsed.owner, parsed.repo, repoInfo.default_branch, token || undefined, 50),
      ]);
      if (prData.status === 'fulfilled') setPrs(prData.value);
      if (issueData.status === 'fulfilled') setIssues(issueData.value);
      if (releaseData.status === 'fulfilled') setReleases(releaseData.value);
      if (commitData.status === 'fulfilled') setCommits(commitData.value);
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load pulse data:', err);
    } finally {
      setLoading(false);
    }
  }, [repoUrl, repoInfo, token]);

  useEffect(() => {
    if (repoInfo && !loaded) handleLoad();
  }, [repoInfo, loaded, handleLoad]);

  const toggle = useCallback((s: Section) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }, []);

  // Stats
  const openPRs = useMemo(() => prs.filter((p) => p.state === 'open'), [prs]);
  const mergedPRs = useMemo(() => prs.filter((p) => p.merged_at), [prs]);
  const openIssues = useMemo(() => issues.filter((i) => i.state === 'open'), [issues]);
  const closedIssues = useMemo(() => issues.filter((i) => i.state === 'closed'), [issues]);

  // Activity sparkline: commits per day for last 14 days
  const sparkData = useMemo(() => {
    const now = new Date();
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (13 - i));
      return { date: d, count: 0 };
    });
    for (const c of commits) {
      const cDate = new Date(c.commit.author.date);
      const diff = Math.floor((now.getTime() - cDate.getTime()) / 86400000);
      if (diff >= 0 && diff < 14) {
        days[13 - diff].count++;
      }
    }
    return days;
  }, [commits]);

  const maxSpark = Math.max(...sparkData.map((d) => d.count), 1);

  // Unique contributors in recent commits
  const recentAuthors = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string; count: number }>();
    for (const c of commits.slice(0, 30)) {
      const name = c.author?.login || c.commit.author.name;
      const avatar = c.author?.avatar_url || '';
      const entry = map.get(name) || { name, avatar, count: 0 };
      entry.count++;
      map.set(name, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [commits]);

  const githubBase = repoInfo ? repoInfo.html_url : '#';

  if (loading && !loaded) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <p>Loading pulse data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* ─── Overview cards ─── */}
      <div className={styles.overview}>
        <div className={styles.overviewCard}>
          <div className={styles.cardIcon} style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E' }}>
            <GitPullRequest size={20} />
          </div>
          <div className={styles.cardBody}>
            <div className={styles.cardValue}>{openPRs.length}</div>
            <div className={styles.cardLabel}>Open PRs</div>
          </div>
          <div className={styles.cardSub}>{mergedPRs.length} merged</div>
        </div>

        <div className={styles.overviewCard}>
          <div className={styles.cardIcon} style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>
            <CircleDot size={20} />
          </div>
          <div className={styles.cardBody}>
            <div className={styles.cardValue}>{openIssues.length}</div>
            <div className={styles.cardLabel}>Open Issues</div>
          </div>
          <div className={styles.cardSub}>{closedIssues.length} closed</div>
        </div>

        <div className={styles.overviewCard}>
          <div className={styles.cardIcon} style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>
            <Tag size={20} />
          </div>
          <div className={styles.cardBody}>
            <div className={styles.cardValue}>{releases.length}</div>
            <div className={styles.cardLabel}>Releases</div>
          </div>
          <div className={styles.cardSub}>
            {releases[0] ? releases[0].tag_name : 'none'}
          </div>
        </div>

        <div className={styles.overviewCard}>
          <div className={styles.cardIcon} style={{ background: 'rgba(236,72,153,0.1)', color: '#EC4899' }}>
            <Activity size={20} />
          </div>
          <div className={styles.cardBody}>
            <div className={styles.cardValue}>{commits.length}</div>
            <div className={styles.cardLabel}>Recent Commits</div>
          </div>
          <div className={styles.cardSub}>{recentAuthors.length} authors</div>
        </div>
      </div>

      {/* ─── Sparkline ─── */}
      <div className={styles.sparkSection}>
        <div className={styles.sparkHeader}>
          <Activity size={14} />
          <span>Commit activity (last 14 days)</span>
          <span className={styles.sparkTotal}>
            {sparkData.reduce((s, d) => s + d.count, 0)} commits
          </span>
        </div>
        <div className={styles.sparkChart}>
          {sparkData.map((d, i) => (
            <div key={i} className={styles.sparkCol} title={`${d.date.toLocaleDateString()}: ${d.count} commits`}>
              <div
                className={styles.sparkBar}
                style={{
                  height: `${Math.max(4, (d.count / maxSpark) * 100)}%`,
                  background: d.count > 0 ? 'var(--accent)' : 'var(--border)',
                  opacity: d.count > 0 ? 0.7 + (d.count / maxSpark) * 0.3 : 0.3,
                }}
              />
              <span className={styles.sparkLabel}>
                {d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
            </div>
          ))}
        </div>
        {/* Recent authors */}
        <div className={styles.authorRow}>
          {recentAuthors.slice(0, 8).map((a) => (
            <div key={a.name} className={styles.authorChip} title={`${a.name}: ${a.count} commits`}>
              {a.avatar ? (
                <img src={a.avatar} alt={a.name} className={styles.authorImg} />
              ) : (
                <span className={styles.authorInitial}>{a.name[0]}</span>
              )}
              <span className={styles.authorName}>{a.name}</span>
              <span className={styles.authorCount}>{a.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Scrollable sections ─── */}
      <div className={styles.sections}>
        {/* ── Pull Requests ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader} onClick={() => toggle('prs')}>
            {collapsed.has('prs') ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <GitPullRequest size={15} style={{ color: '#22C55E' }} />
            <span className={styles.sectionTitle}>Pull Requests</span>
            <span className={styles.sectionBadge} style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
              {openPRs.length} open
            </span>
            <a href={`${githubBase}/pulls`} target="_blank" rel="noopener noreferrer" className={styles.sectionLink}
              onClick={(e) => e.stopPropagation()}>
              <ExternalLink size={11} />
            </a>
          </div>
          {!collapsed.has('prs') && (
            <div className={styles.sectionBody}>
              {prs.length === 0 ? (
                <div className={styles.emptyMsg}>No pull requests found</div>
              ) : prs.slice(0, 20).map((pr) => (
                <a key={pr.number} className={styles.prRow}
                  href={`${githubBase}/pull/${pr.number}`} target="_blank" rel="noopener noreferrer">
                  <div className={styles.prStatus}>
                    {pr.merged_at ? (
                      <GitMerge size={14} className={styles.prMerged} />
                    ) : pr.state === 'open' ? (
                      <GitPullRequest size={14} className={styles.prOpen} />
                    ) : (
                      <GitPullRequest size={14} className={styles.prClosed} />
                    )}
                  </div>
                  <div className={styles.prContent}>
                    <div className={styles.prTitle}>
                      {pr.title}
                      {pr.draft && <span className={styles.draftBadge}>Draft</span>}
                    </div>
                    <div className={styles.prMeta}>
                      <img src={pr.user.avatar_url} alt="" className={styles.prAvatar} />
                      <span>{pr.user.login}</span>
                      <span className={styles.prBranch}>{pr.head.ref}</span>
                      <span className={styles.prArrow}>&rarr;</span>
                      <span className={styles.prBranch}>{pr.base.ref}</span>
                      {pr.comments + pr.review_comments > 0 && (
                        <span className={styles.prComments}>
                          <MessageSquare size={10} /> {pr.comments + pr.review_comments}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.prStats}>
                    {(pr.additions > 0 || pr.deletions > 0) && (
                      <div className={styles.prDiff}>
                        <span className={styles.diffAdd}><Plus size={9} />{pr.additions}</span>
                        <span className={styles.diffDel}><Minus size={9} />{pr.deletions}</span>
                      </div>
                    )}
                    <div className={styles.prTime}>
                      <Clock size={9} /> {timeAgo(pr.updated_at)}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── Issues ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader} onClick={() => toggle('issues')}>
            {collapsed.has('issues') ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <CircleDot size={15} style={{ color: '#6366F1' }} />
            <span className={styles.sectionTitle}>Issues</span>
            <span className={styles.sectionBadge} style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1' }}>
              {openIssues.length} open
            </span>
            <a href={`${githubBase}/issues`} target="_blank" rel="noopener noreferrer" className={styles.sectionLink}
              onClick={(e) => e.stopPropagation()}>
              <ExternalLink size={11} />
            </a>
          </div>
          {!collapsed.has('issues') && (
            <div className={styles.sectionBody}>
              {issues.length === 0 ? (
                <div className={styles.emptyMsg}>No issues found</div>
              ) : issues.slice(0, 20).map((issue) => (
                <a key={issue.number} className={styles.issueRow}
                  href={`${githubBase}/issues/${issue.number}`} target="_blank" rel="noopener noreferrer">
                  <div className={styles.issueStatus}>
                    {issue.state === 'open' ? (
                      <AlertCircle size={14} className={styles.issueOpen} />
                    ) : (
                      <CheckCircle2 size={14} className={styles.issueClosed} />
                    )}
                  </div>
                  <div className={styles.issueContent}>
                    <div className={styles.issueTitle}>{issue.title}</div>
                    <div className={styles.issueMeta}>
                      <img src={issue.user.avatar_url} alt="" className={styles.prAvatar} />
                      <span>{issue.user.login}</span>
                      {issue.labels.map((l) => (
                        <span key={l.name} className={styles.label}
                          style={{ background: `#${l.color}20`, color: `#${l.color}`, borderColor: `#${l.color}40` }}>
                          {l.name}
                        </span>
                      ))}
                      {issue.comments > 0 && (
                        <span className={styles.prComments}>
                          <MessageSquare size={10} /> {issue.comments}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.prTime}>
                    <Clock size={9} /> {timeAgo(issue.updated_at)}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── Releases ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader} onClick={() => toggle('releases')}>
            {collapsed.has('releases') ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <Tag size={15} style={{ color: '#F59E0B' }} />
            <span className={styles.sectionTitle}>Releases</span>
            <span className={styles.sectionBadge} style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
              {releases.length}
            </span>
            <a href={`${githubBase}/releases`} target="_blank" rel="noopener noreferrer" className={styles.sectionLink}
              onClick={(e) => e.stopPropagation()}>
              <ExternalLink size={11} />
            </a>
          </div>
          {!collapsed.has('releases') && (
            <div className={styles.sectionBody}>
              {releases.length === 0 ? (
                <div className={styles.emptyMsg}>No releases found</div>
              ) : releases.map((rel) => (
                <div key={rel.tag_name} className={styles.releaseRow}>
                  <div className={styles.releaseIcon}>
                    <Tag size={14} style={{ color: rel.prerelease ? '#F59E0B' : '#22C55E' }} />
                  </div>
                  <div className={styles.releaseContent}>
                    <div className={styles.releaseTitle}>
                      <span className={styles.releaseTag}>{rel.tag_name}</span>
                      {rel.name && rel.name !== rel.tag_name && (
                        <span className={styles.releaseName}>{rel.name}</span>
                      )}
                      {rel.prerelease && <span className={styles.prereleaseBadge}>pre-release</span>}
                    </div>
                    <div className={styles.releaseMeta}>
                      <img src={rel.author.avatar_url} alt="" className={styles.prAvatar} />
                      <span>{rel.author.login}</span>
                      <Clock size={9} /> {timeAgo(rel.published_at)}
                      {rel.assets.length > 0 && (
                        <span className={styles.assetCount}>
                          <FileCode2 size={10} /> {rel.assets.length} assets
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent commits ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader} onClick={() => toggle('activity')}>
            {collapsed.has('activity') ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <Activity size={15} style={{ color: '#EC4899' }} />
            <span className={styles.sectionTitle}>Recent Commits</span>
            <span className={styles.sectionBadge} style={{ background: 'rgba(236,72,153,0.12)', color: '#EC4899' }}>
              {commits.length}
            </span>
          </div>
          {!collapsed.has('activity') && (
            <div className={styles.sectionBody}>
              {commits.slice(0, 25).map((c) => (
                <a key={c.sha} className={styles.commitRow}
                  href={`${githubBase}/commit/${c.sha}`} target="_blank" rel="noopener noreferrer">
                  <code className={styles.commitSha}>{c.sha.slice(0, 7)}</code>
                  <span className={styles.commitMsg}>{c.commit.message.split('\n')[0]}</span>
                  <div className={styles.commitMeta}>
                    {c.author?.avatar_url && (
                      <img src={c.author.avatar_url} alt="" className={styles.prAvatar} />
                    )}
                    <span>{c.author?.login || c.commit.author.name}</span>
                  </div>
                  <span className={styles.prTime}>
                    <Clock size={9} /> {timeAgo(c.commit.author.date)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
