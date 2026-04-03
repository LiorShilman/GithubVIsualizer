import { type FormEvent } from 'react';
import { Loader2, FolderGit2 } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { SettingsPanel } from '@/components/SettingsPanel/SettingsPanel.tsx';
import styles from './InputPanel.module.css';

export function InputPanel() {
  const repoUrl = useRepoStore((s) => s.repoUrl);
  const token = useRepoStore((s) => s.token);
  const status = useRepoStore((s) => s.status);
  const rateLimit = useRepoStore((s) => s.rateLimit);
  const githubUser = useRepoStore((s) => s.githubUser);
  const setRepoUrl = useRepoStore((s) => s.setRepoUrl);
  const setToken = useRepoStore((s) => s.setToken);
  const loadRepo = useRepoStore((s) => s.loadRepo);
  const resetToHome = useRepoStore((s) => s.resetToHome);

  const isLoading = status === 'loading';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isLoading && repoUrl.trim()) {
      localStorage.setItem('last_repo_url', repoUrl.trim());
      loadRepo();
    }
  };

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <input
        className={styles.urlInput}
        type="text"
        placeholder="github.com/owner/repo"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        disabled={isLoading}
      />
      <input
        className={styles.tokenInput}
        type="password"
        placeholder="GitHub Token (optional)"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={isLoading}
      />
      <button className={styles.loadBtn} type="submit" disabled={isLoading || !repoUrl.trim()}>
        {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Load'}
      </button>
      {githubUser && status !== 'idle' && (
        <button
          type="button"
          className={styles.reposBtn}
          onClick={resetToHome}
          title="My Repositories"
        >
          <FolderGit2 size={15} />
          My Repos
        </button>
      )}
      <span className={`${styles.rateLimit} ${rateLimit.remaining < 10 ? styles.rateLow : ''}`}>
        {rateLimit.remaining} / {rateLimit.limit} req
      </span>
      <SettingsPanel />
    </form>
  );
}
