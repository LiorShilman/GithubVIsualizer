import { Star, GitFork, FileText, Code } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import styles from './StatsBar.module.css';

export function StatsBar() {
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const languages = useRepoStore((s) => s.languages);
  const tree = useRepoStore((s) => s.tree);

  if (!repoInfo) return null;

  const fileCount = tree.filter((n) => n.type === 'blob').length;

  const totalBytes = languages
    ? Object.values(languages).reduce((a, b) => a + b, 0)
    : 0;

  const langEntries = languages
    ? Object.entries(languages)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
    : [];

  return (
    <div className={styles.container}>
      <div className={styles.stats}>
        <span className={styles.stat}>
          <Star size={14} /> {formatNumber(repoInfo.stargazers_count)}
        </span>
        <span className={styles.stat}>
          <GitFork size={14} /> {formatNumber(repoInfo.forks_count)}
        </span>
        <span className={styles.stat}>
          <FileText size={14} /> {fileCount} files
        </span>
        {repoInfo.language && (
          <span className={styles.stat}>
            <Code size={14} /> {repoInfo.language}
          </span>
        )}
      </div>

      {langEntries.length > 0 && (
        <div className={styles.langBar}>
          {langEntries.map(([lang, bytes]) => {
            const pct = ((bytes / totalBytes) * 100).toFixed(1);
            return (
              <div
                key={lang}
                className={styles.langSegment}
                style={{ width: `${pct}%` }}
                title={`${lang}: ${pct}%`}
              />
            );
          })}
        </div>
      )}

      {langEntries.length > 0 && (
        <div className={styles.langLabels}>
          {langEntries.map(([lang, bytes]) => {
            const pct = ((bytes / totalBytes) * 100).toFixed(1);
            return (
              <span key={lang} className={styles.langLabel}>
                {lang} {pct}%
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
