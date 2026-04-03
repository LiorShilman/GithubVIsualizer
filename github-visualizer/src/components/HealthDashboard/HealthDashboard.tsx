import { useMemo } from 'react';
import { ShieldCheck, FileText, FolderTree, Code2, Scale, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { getExtension } from '@/utils/fileIcons.ts';
import styles from './HealthDashboard.module.css';

interface HealthMetric {
  label: string;
  score: number; // 0-100
  icon: React.ReactNode;
  details: string;
  status: 'good' | 'warn' | 'bad';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HealthDashboard() {
  const tree = useRepoStore((s) => s.tree);
  const languages = useRepoStore((s) => s.languages);
  const repoInfo = useRepoStore((s) => s.repoInfo);

  const analysis = useMemo(() => {
    const files = tree.filter((n) => n.type === 'blob');
    const dirs = tree.filter((n) => n.type === 'tree');

    // File stats
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const avgFileSize = totalFiles > 0 ? totalSize / totalFiles : 0;

    // Extension breakdown
    const extCounts = new Map<string, number>();
    const extSizes = new Map<string, number>();
    for (const f of files) {
      const name = f.path.split('/').pop() || '';
      const ext = getExtension(name);
      extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
      extSizes.set(ext, (extSizes.get(ext) || 0) + (f.size || 0));
    }

    // Directory depth
    const depths = files.map((f) => f.path.split('/').length - 1);
    const maxDepth = Math.max(...depths, 0);
    const avgDepth = depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;

    // Check for important files
    const filePaths = new Set(files.map((f) => f.path.toLowerCase()));
    const hasReadme = filePaths.has('readme.md') || filePaths.has('readme.rst') || filePaths.has('readme.txt') || filePaths.has('readme');
    const hasLicense = filePaths.has('license') || filePaths.has('license.md') || filePaths.has('license.txt') || filePaths.has('licence');
    const hasGitignore = filePaths.has('.gitignore');
    const hasCI = [...filePaths].some((p) =>
      p.includes('.github/workflows/') || p.includes('.gitlab-ci') ||
      p.includes('jenkinsfile') || p.includes('.circleci/') || p.includes('.travis.yml')
    );
    const hasTests = [...filePaths].some((p) =>
      p.includes('test') || p.includes('spec') || p.includes('__tests__')
    );
    const hasPackageJson = filePaths.has('package.json');
    const hasDocker = filePaths.has('dockerfile') || filePaths.has('docker-compose.yml') || filePaths.has('docker-compose.yaml');
    const hasEditorConfig = filePaths.has('.editorconfig');
    const hasLinter = [...filePaths].some((p) =>
      p.includes('.eslint') || p.includes('.prettier') || p.includes('.stylelint') ||
      p.includes('pylintrc') || p.includes('.flake8') || p.includes('.rubocop')
    );
    const hasContributing = filePaths.has('contributing.md') || filePaths.has('contributing');
    const hasChangelog = filePaths.has('changelog.md') || filePaths.has('changelog') || filePaths.has('changes.md');
    const hasTypings = [...filePaths].some((p) => p.endsWith('.d.ts') || p.includes('tsconfig'));

    // Large files (>500KB)
    const largeFiles = files.filter((f) => (f.size || 0) > 500 * 1024);

    // Very deep nesting (>8 levels)
    const deepFiles = files.filter((f) => f.path.split('/').length > 8);

    return {
      totalFiles, totalSize, avgFileSize, maxDepth, avgDepth,
      extCounts, extSizes, dirs: dirs.length,
      hasReadme, hasLicense, hasGitignore, hasCI, hasTests,
      hasPackageJson, hasDocker, hasEditorConfig, hasLinter,
      hasContributing, hasChangelog, hasTypings,
      largeFiles, deepFiles,
    };
  }, [tree]);

  const metrics = useMemo<HealthMetric[]>(() => {
    const m: HealthMetric[] = [];

    // Documentation score
    const docChecks = [analysis.hasReadme, analysis.hasLicense, analysis.hasContributing, analysis.hasChangelog];
    const docScore = Math.round((docChecks.filter(Boolean).length / docChecks.length) * 100);
    m.push({
      label: 'Documentation',
      score: docScore,
      icon: <FileText size={20} />,
      details: [
        analysis.hasReadme ? 'README ✓' : 'README ✗',
        analysis.hasLicense ? 'LICENSE ✓' : 'LICENSE ✗',
        analysis.hasContributing ? 'CONTRIBUTING ✓' : 'CONTRIBUTING ✗',
        analysis.hasChangelog ? 'CHANGELOG ✓' : 'CHANGELOG ✗',
      ].join(', '),
      status: docScore >= 75 ? 'good' : docScore >= 50 ? 'warn' : 'bad',
    });

    // Project structure
    const structChecks = [analysis.hasGitignore, analysis.hasEditorConfig, analysis.hasLinter, analysis.hasTypings];
    const structScore = Math.round((structChecks.filter(Boolean).length / structChecks.length) * 100);
    m.push({
      label: 'Project Structure',
      score: structScore,
      icon: <FolderTree size={20} />,
      details: [
        analysis.hasGitignore ? '.gitignore ✓' : '.gitignore ✗',
        analysis.hasEditorConfig ? 'EditorConfig ✓' : 'EditorConfig ✗',
        analysis.hasLinter ? 'Linter ✓' : 'Linter ✗',
        analysis.hasTypings ? 'Type defs ✓' : 'Type defs ✗',
      ].join(', '),
      status: structScore >= 75 ? 'good' : structScore >= 50 ? 'warn' : 'bad',
    });

    // CI/CD & Testing
    const ciChecks = [analysis.hasCI, analysis.hasTests, analysis.hasDocker];
    const ciScore = Math.round((ciChecks.filter(Boolean).length / ciChecks.length) * 100);
    m.push({
      label: 'CI/CD & Testing',
      score: ciScore,
      icon: <ShieldCheck size={20} />,
      details: [
        analysis.hasCI ? 'CI/CD ✓' : 'CI/CD ✗',
        analysis.hasTests ? 'Tests ✓' : 'Tests ✗',
        analysis.hasDocker ? 'Docker ✓' : 'Docker ✗',
      ].join(', '),
      status: ciScore >= 67 ? 'good' : ciScore >= 33 ? 'warn' : 'bad',
    });

    // Code organization
    const hasLargeFiles = analysis.largeFiles.length > 0;
    const hasDeepNesting = analysis.deepFiles.length > 5;
    const tooManyTopLevel = analysis.extCounts.size > 30;
    const orgIssues = [hasLargeFiles, hasDeepNesting, tooManyTopLevel].filter(Boolean).length;
    const orgScore = Math.round(((3 - orgIssues) / 3) * 100);
    m.push({
      label: 'Code Organization',
      score: orgScore,
      icon: <Code2 size={20} />,
      details: [
        hasLargeFiles ? `${analysis.largeFiles.length} large files` : 'No large files',
        hasDeepNesting ? `${analysis.deepFiles.length} deeply nested` : 'Good nesting depth',
        tooManyTopLevel ? 'Many file types' : 'Focused file types',
      ].join(', '),
      status: orgScore >= 67 ? 'good' : orgScore >= 33 ? 'warn' : 'bad',
    });

    return m;
  }, [analysis]);

  const overallScore = Math.round(metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length);
  const overallStatus = overallScore >= 70 ? 'good' : overallScore >= 40 ? 'warn' : 'bad';

  // Top extensions by count
  const topExtensions = Array.from(analysis.extCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const langEntries = languages
    ? Object.entries(languages).sort((a, b) => b[1] - a[1])
    : [];
  const totalLangBytes = langEntries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>
          <ShieldCheck size={16} />
          Repository Health Dashboard
        </span>
        <span className={styles.repoName}>{repoInfo?.full_name}</span>
      </div>

      <div className={styles.content}>
        {/* Overall score */}
        <div className={styles.overallCard}>
          <div className={`${styles.scoreRing} ${styles[overallStatus]}`}>
            <svg viewBox="0 0 100 100" className={styles.ringChart}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${overallScore * 2.64} ${264 - overallScore * 2.64}`}
                strokeDashoffset="66"
                className={styles.ringProgress}
              />
            </svg>
            <span className={styles.scoreValue}>{overallScore}</span>
          </div>
          <div className={styles.overallLabel}>
            Overall Health Score
            <span className={`${styles.statusBadge} ${styles[overallStatus]}`}>
              {overallStatus === 'good' ? 'Healthy' : overallStatus === 'warn' ? 'Needs Work' : 'At Risk'}
            </span>
          </div>
        </div>

        {/* Metric cards */}
        <div className={styles.metricsGrid}>
          {metrics.map((metric) => (
            <div key={metric.label} className={`${styles.metricCard} ${styles[metric.status]}`}>
              <div className={styles.metricHeader}>
                {metric.icon}
                <span>{metric.label}</span>
                <span className={styles.metricScore}>{metric.score}%</span>
              </div>
              <div className={styles.metricBar}>
                <div
                  className={styles.metricBarFill}
                  style={{ width: `${metric.score}%` }}
                />
              </div>
              <div className={styles.metricDetails}>{metric.details}</div>
            </div>
          ))}
        </div>

        {/* Stats grid */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <Scale size={16} />
            <div className={styles.statValue}>{analysis.totalFiles}</div>
            <div className={styles.statLabel}>Total Files</div>
          </div>
          <div className={styles.statCard}>
            <FolderTree size={16} />
            <div className={styles.statValue}>{analysis.dirs}</div>
            <div className={styles.statLabel}>Directories</div>
          </div>
          <div className={styles.statCard}>
            <Code2 size={16} />
            <div className={styles.statValue}>{formatSize(analysis.totalSize)}</div>
            <div className={styles.statLabel}>Total Size</div>
          </div>
          <div className={styles.statCard}>
            <FileText size={16} />
            <div className={styles.statValue}>{formatSize(analysis.avgFileSize)}</div>
            <div className={styles.statLabel}>Avg File Size</div>
          </div>
        </div>

        <div className={styles.bottomRow}>
          {/* Language breakdown */}
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Language Breakdown</h3>
            {langEntries.map(([lang, bytes]) => {
              const pct = ((bytes / totalLangBytes) * 100).toFixed(1);
              return (
                <div key={lang} className={styles.langRow}>
                  <span className={styles.langName}>{lang}</span>
                  <div className={styles.langBar}>
                    <div
                      className={styles.langBarFill}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={styles.langPct}>{pct}%</span>
                </div>
              );
            })}
          </div>

          {/* File types */}
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Top File Extensions</h3>
            {topExtensions.map(([ext, count]) => (
              <div key={ext} className={styles.langRow}>
                <span className={styles.langName}>.{ext || '(none)'}</span>
                <span className={styles.langPct}>{count} files</span>
              </div>
            ))}
          </div>

          {/* Checklist */}
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Project Checklist</h3>
            {[
              { label: 'README', ok: analysis.hasReadme },
              { label: 'LICENSE', ok: analysis.hasLicense },
              { label: '.gitignore', ok: analysis.hasGitignore },
              { label: 'CI/CD Pipeline', ok: analysis.hasCI },
              { label: 'Tests', ok: analysis.hasTests },
              { label: 'Linter Config', ok: analysis.hasLinter },
              { label: 'Docker', ok: analysis.hasDocker },
              { label: 'Contributing Guide', ok: analysis.hasContributing },
              { label: 'Changelog', ok: analysis.hasChangelog },
              { label: 'Type Definitions', ok: analysis.hasTypings },
            ].map((item) => (
              <div key={item.label} className={styles.checkItem}>
                {item.ok ? (
                  <CheckCircle2 size={14} className={styles.checkOk} />
                ) : (
                  <XCircle size={14} className={styles.checkMissing} />
                )}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Warnings */}
        {(analysis.largeFiles.length > 0 || analysis.deepFiles.length > 0) && (
          <div className={styles.warningsPanel}>
            <h3 className={styles.panelTitle}>
              <AlertTriangle size={16} />
              Warnings
            </h3>
            {analysis.largeFiles.map((f) => (
              <div key={f.path} className={styles.warningItem}>
                Large file: <strong>{f.path}</strong> ({formatSize(f.size || 0)})
              </div>
            ))}
            {analysis.deepFiles.slice(0, 5).map((f) => (
              <div key={f.path} className={styles.warningItem}>
                Deep nesting ({f.path.split('/').length} levels): <strong>{f.path}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
