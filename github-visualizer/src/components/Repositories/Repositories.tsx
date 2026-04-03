import { useEffect, useState, useMemo, useCallback } from 'react';
import { FolderGit2, Star, GitFork, Search, RefreshCw } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { fetchUserRepos } from '@/services/github.ts';
import type { GitHubUserRepo } from '@/services/github.ts';
import { StyledAvatar } from '@/components/shared/StyledAvatar.tsx';
import styles from './Repositories.module.css';

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Python: '#3572A5',
  Java: '#B07219',
  'C#': '#178600',
  'C++': '#F34B7D',
  C: '#555555',
  Go: '#00ADD8',
  Rust: '#DEA584',
  Ruby: '#CC342D',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  HTML: '#E34C26',
  CSS: '#563D7C',
  Shell: '#89E051',
  Vue: '#41B883',
  Svelte: '#FF3E00',
};

type SortMode = 'updated' | 'stars' | 'name';

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

  const loadRepos = useCallback(() => {
    if (!githubUser) return;

    setLoading(true);
    setError(null);

    fetchUserRepos(githubUser, token || undefined)
      .then((data) => {
        setRepos(data);
        setLoading(false);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg === 'Failed to fetch'
          ? `Network error — cannot reach GitHub API. Check your connection or try again.`
          : msg
        );
        setLoading(false);
      });
  }, [githubUser, token]);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const r of repos) {
      if (r.language) set.add(r.language);
    }
    return Array.from(set).sort();
  }, [repos]);

  const filtered = useMemo(() => {
    let list = repos;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q))
      );
    }

    if (langFilter !== 'all') {
      list = list.filter((r) => r.language === langFilter);
    }

    switch (sort) {
      case 'stars':
        list = [...list].sort((a, b) => b.stargazers_count - a.stargazers_count);
        break;
      case 'name':
        list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        break;
      default: // 'updated' - already sorted from API
        break;
    }

    return list;
  }, [repos, search, langFilter, sort]);

  const handleRepoClick = (repo: GitHubUserRepo) => {
    const url = `github.com/${repo.full_name}`;
    setRepoUrl(url);
    localStorage.setItem('last_repo_url', url);
    loadRepo();
  };

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
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <StyledAvatar name={githubUser} size={48} />
        <div>
          <div className={styles.username}>{githubUser}</div>
          <div className={styles.repoCount}>{repos.length} repositories</div>
        </div>
      </div>

      <div className={styles.filterBar}>
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          title="Filter by language"
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
        >
          <option value="all">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          title="Sort by"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
        >
          <option value="updated">Recently updated</option>
          <option value="stars">Most stars</option>
          <option value="name">Name</option>
        </select>
      </div>

      <div className={styles.grid}>
        {filtered.map((repo) => (
          <div
            key={repo.full_name}
            className={styles.card}
            onClick={() => handleRepoClick(repo)}
          >
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
                  <span
                    className={styles.langDot}
                    style={{ background: LANG_COLORS[repo.language] || '#8b8b8b' }}
                  />
                  {repo.language}
                </span>
              )}
              {repo.stargazers_count > 0 && (
                <span className={styles.metaItem}>
                  <Star size={11} />
                  {repo.stargazers_count}
                </span>
              )}
              {repo.forks_count > 0 && (
                <span className={styles.metaItem}>
                  <GitFork size={11} />
                  {repo.forks_count}
                </span>
              )}
              <span>{new Date(repo.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className={styles.emptyState}>
          <p>No repositories match your filters</p>
        </div>
      )}
    </div>
  );
}
