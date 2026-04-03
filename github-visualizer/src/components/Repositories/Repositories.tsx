import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  FolderGit2, Star, GitFork, Search, RefreshCw,
  ChevronDown, ChevronRight, LayoutGrid, Layers,
} from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { fetchUserRepos } from '@/services/github.ts';
import type { GitHubUserRepo } from '@/services/github.ts';
import { StyledAvatar } from '@/components/shared/StyledAvatar.tsx';
import styles from './Repositories.module.css';

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178C6', JavaScript: '#F7DF1E', Python: '#3572A5',
  Java: '#B07219', 'C#': '#178600', 'C++': '#F34B7D', C: '#555555',
  Go: '#00ADD8', Rust: '#DEA584', Ruby: '#CC342D', PHP: '#4F5D95',
  Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', HTML: '#E34C26',
  CSS: '#563D7C', Shell: '#89E051', Vue: '#41B883', Svelte: '#FF3E00',
  Lua: '#000080', Scala: '#C22D40', R: '#198CE7', Perl: '#0298C3',
  Haskell: '#5e5086', Elixir: '#6E4A7E', Clojure: '#DB5855',
  Zig: '#EC915C', Nim: '#FFE953', OCaml: '#3BE133',
};

function getLangColor(lang: string | null): string {
  if (!lang) return '#8b8b8b';
  return LANG_COLORS[lang] || '#8b8b8b';
}

type SortMode = 'updated' | 'stars' | 'name';
type ViewMode = 'grouped' | 'grid';

interface LangGroup {
  lang: string;
  color: string;
  repos: GitHubUserRepo[];
  totalStars: number;
}

export function Repositories() {
  const githubUser = useRepoStore((s) => s.githubUser);
  const token = useRepoStore((s) => s.token);
  const setRepoUrl = useRepoStore((s) => s.setRepoUrl);
  const loadRepo = useRepoStore((s) => s.loadRepo);

  const [repos, setRepos] = useState<GitHubUserRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('updated');
  const [langFilter, setLangFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [collapsedLangs, setCollapsedLangs] = useState<Set<string>>(new Set());

  const loadRepos = useCallback(() => {
    if (!githubUser) return;
    setLoading(true);
    setError(null);
    fetchUserRepos(githubUser, token || undefined)
      .then((data) => { setRepos(data); setLoading(false); })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg === 'Failed to fetch'
          ? 'Network error — cannot reach GitHub API. Check your connection or try again.'
          : msg);
        setLoading(false);
      });
  }, [githubUser, token]);

  useEffect(() => { loadRepos(); }, [loadRepos]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const r of repos) { if (r.language) set.add(r.language); }
    return Array.from(set).sort();
  }, [repos]);

  const filtered = useMemo(() => {
    let list = repos;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)
      );
    }
    if (langFilter !== 'all') {
      list = list.filter((r) => r.language === langFilter);
    }
    switch (sort) {
      case 'stars': list = [...list].sort((a, b) => b.stargazers_count - a.stargazers_count); break;
      case 'name': list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break;
      default: break;
    }
    return list;
  }, [repos, search, langFilter, sort]);

  // Language distribution
  const langDistribution = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const lang = r.language || 'Other';
      map.set(lang, (map.get(lang) || 0) + 1);
    }
    const arr = Array.from(map.entries())
      .map(([lang, count]) => ({ lang, count, color: getLangColor(lang === 'Other' ? null : lang) }))
      .sort((a, b) => b.count - a.count);
    const total = arr.reduce((s, e) => s + e.count, 0);
    return { items: arr, total };
  }, [filtered]);

  // Group repos by language
  const langGroups = useMemo<LangGroup[]>(() => {
    const map = new Map<string, GitHubUserRepo[]>();
    for (const r of filtered) {
      const lang = r.language || 'Other';
      const arr = map.get(lang) || [];
      arr.push(r);
      map.set(lang, arr);
    }
    return Array.from(map.entries())
      .map(([lang, repos]) => ({
        lang,
        color: getLangColor(lang === 'Other' ? null : lang),
        repos,
        totalStars: repos.reduce((s, r) => s + r.stargazers_count, 0),
      }))
      .sort((a, b) => b.repos.length - a.repos.length);
  }, [filtered]);

  const handleRepoClick = (repo: GitHubUserRepo) => {
    const url = `github.com/${repo.full_name}`;
    setRepoUrl(url);
    localStorage.setItem('last_repo_url', url);
    loadRepo();
  };

  const toggleLang = useCallback((lang: string) => {
    setCollapsedLangs((prev) => {
      const next = new Set(prev);
      if (next.has(lang)) next.delete(lang); else next.add(lang);
      return next;
    });
  }, []);

  if (!githubUser) {
    return (
      <div className={styles.emptyState}>
        <FolderGit2 size={48} strokeWidth={1} />
        <p>Set your GitHub username in Settings to see your repositories</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <FolderGit2 size={48} strokeWidth={1} className={styles.pulse} />
        <p>Loading repositories for {githubUser}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.emptyState}>
        <FolderGit2 size={48} strokeWidth={1} />
        <p style={{ color: 'var(--error)', textAlign: 'center', maxWidth: 400 }}>{error}</p>
        <button className={styles.retryBtn} onClick={loadRepos}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const RepoCard = ({ repo }: { repo: GitHubUserRepo }) => {
    const color = getLangColor(repo.language);
    return (
      <div className={styles.card} onClick={() => handleRepoClick(repo)}>
        {/* Language accent stripe */}
        <div className={styles.cardStripe} style={{ background: color }} />
        <div className={styles.cardContent}>
          <div className={styles.cardName}>
            <FolderGit2 size={14} />
            {repo.name}
            {repo.fork && <span className={styles.forkBadge}>fork</span>}
            {repo.private && <span className={styles.privateBadge}>private</span>}
          </div>
          {repo.description && (
            <div className={styles.cardDesc}>{repo.description}</div>
          )}
          <div className={styles.cardMeta}>
            {repo.language && (
              <span className={styles.metaItem}>
                <span className={styles.langDot} style={{ background: color }} />
                {repo.language}
              </span>
            )}
            {repo.stargazers_count > 0 && (
              <span className={styles.metaItem}>
                <Star size={11} /> {repo.stargazers_count}
              </span>
            )}
            {repo.forks_count > 0 && (
              <span className={styles.metaItem}>
                <GitFork size={11} /> {repo.forks_count}
              </span>
            )}
            <span className={styles.metaDate}>
              {new Date(repo.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <StyledAvatar name={githubUser} size={48} />
        <div>
          <div className={styles.username}>{githubUser}</div>
          <div className={styles.repoCount}>{repos.length} repositories</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.filterSelect} title="Filter by language"
          value={langFilter} onChange={(e) => setLangFilter(e.target.value)}>
          <option value="all">All languages</option>
          {languages.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className={styles.filterSelect} title="Sort by"
          value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
          <option value="updated">Recently updated</option>
          <option value="stars">Most stars</option>
          <option value="name">Name</option>
        </select>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${viewMode === 'grouped' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('grouped')} title="Group by language"
          ><Layers size={14} /></button>
          <button
            className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('grid')} title="Grid view"
          ><LayoutGrid size={14} /></button>
        </div>
      </div>

      {/* Language distribution bar */}
      {langDistribution.total > 0 && (
        <div className={styles.langOverview}>
          <div className={styles.distBar}>
            {langDistribution.items.map(({ lang, count, color }) => (
              <div
                key={lang}
                className={styles.distSegment}
                style={{ width: `${(count / langDistribution.total) * 100}%`, background: color }}
                title={`${lang}: ${count} repos`}
                onClick={() => setLangFilter(lang === 'Other' ? 'all' : lang)}
              />
            ))}
          </div>
          <div className={styles.distLegend}>
            {langDistribution.items.slice(0, 10).map(({ lang, count, color }) => (
              <span key={lang} className={styles.distLabel}
                onClick={() => setLangFilter(lang === 'Other' ? 'all' : lang)}>
                <span className={styles.distDot} style={{ background: color }} />
                {lang} <small>{count}</small>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div className={styles.resultsArea}>
        {viewMode === 'grouped' ? (
          /* Grouped by language */
          langGroups.map((group) => {
            const isCollapsed = collapsedLangs.has(group.lang);
            return (
              <div key={group.lang} className={styles.langGroup}>
                <div className={styles.langHeader} onClick={() => toggleLang(group.lang)}>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className={styles.langHeaderDot} style={{ background: group.color }} />
                  <span className={styles.langHeaderName} style={{ color: group.color }}>
                    {group.lang}
                  </span>
                  <span className={styles.langHeaderCount}>
                    {group.repos.length} {group.repos.length === 1 ? 'repo' : 'repos'}
                  </span>
                  {group.totalStars > 0 && (
                    <span className={styles.langHeaderStars}>
                      <Star size={10} /> {group.totalStars}
                    </span>
                  )}
                  {/* Mini progress showing proportion */}
                  <div className={styles.langHeaderBar}>
                    <div
                      className={styles.langHeaderBarFill}
                      style={{
                        width: `${(group.repos.length / filtered.length) * 100}%`,
                        background: group.color,
                      }}
                    />
                  </div>
                </div>
                {!isCollapsed && (
                  <div className={styles.langGrid}>
                    {group.repos.map((repo) => (
                      <RepoCard key={repo.full_name} repo={repo} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* Flat grid */
          <div className={styles.grid}>
            {filtered.map((repo) => (
              <RepoCard key={repo.full_name} repo={repo} />
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 && (
        <div className={styles.emptyState}>
          <p>No repositories match your filters</p>
        </div>
      )}
    </div>
  );
}
