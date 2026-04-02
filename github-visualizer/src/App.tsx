import { lazy, Suspense, useEffect } from 'react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { InputPanel } from '@/components/InputPanel/InputPanel.tsx';
import { StatsBar } from '@/components/StatsBar/StatsBar.tsx';
import { FileTree } from '@/components/FileTree/FileTree.tsx';
import { Tabs } from '@/components/shared/Tabs.tsx';
import { ErrorBanner } from '@/components/shared/ErrorBanner.tsx';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner.tsx';
import { SettingsPanel } from '@/components/SettingsPanel/SettingsPanel.tsx';

const DependencyGraph = lazy(() =>
  import('@/components/DependencyGraph/DependencyGraph.tsx').then((m) => ({
    default: m.DependencyGraph,
  }))
);

export default function App() {
  const status = useRepoStore((s) => s.status);
  const error = useRepoStore((s) => s.error);
  const activeTab = useRepoStore((s) => s.activeTab);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const darkMode = useRepoStore((s) => s.darkMode);
  const repoInfo = useRepoStore((s) => s.repoInfo);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <InputPanel />
      <SettingsPanel />

      {error && <ErrorBanner message={error} />}
      {status === 'loading' && <LoadingSpinner message="Fetching repository data..." />}

      {repoInfo && (
        <>
          <StatsBar />
          <Tabs active={activeTab} onChange={setActiveTab} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeTab === 'tree' ? (
              <FileTree />
            ) : (
              <Suspense fallback={<LoadingSpinner message="Loading graph..." />}>
                <DependencyGraph />
              </Suspense>
            )}
          </div>
        </>
      )}

      {status === 'idle' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          color: 'var(--text-muted)',
        }}>
          <p style={{ fontSize: '1.1rem' }}>GitHub Repository Visualizer</p>
          <p style={{ fontSize: '0.85rem' }}>Enter a GitHub repo URL above to get started</p>
        </div>
      )}
    </div>
  );
}
