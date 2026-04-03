import { lazy, Suspense, useEffect } from 'react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { InputPanel } from '@/components/InputPanel/InputPanel.tsx';
import { StatsBar } from '@/components/StatsBar/StatsBar.tsx';
import { FileTree } from '@/components/FileTree/FileTree.tsx';
import { Tabs } from '@/components/shared/Tabs.tsx';
import { ErrorBanner } from '@/components/shared/ErrorBanner.tsx';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner.tsx';


const DependencyGraph = lazy(() =>
  import('@/components/DependencyGraph/DependencyGraph.tsx').then((m) => ({
    default: m.DependencyGraph,
  }))
);

const BranchTree = lazy(() =>
  import('@/components/BranchTree/BranchTree.tsx').then((m) => ({
    default: m.BranchTree,
  }))
);

const Architecture = lazy(() =>
  import('@/components/Architecture/Architecture.tsx').then((m) => ({
    default: m.Architecture,
  }))
);

const Heatmap = lazy(() =>
  import('@/components/Heatmap/Heatmap.tsx').then((m) => ({
    default: m.Heatmap,
  }))
);

const Contributors = lazy(() =>
  import('@/components/Contributors/Contributors.tsx').then((m) => ({
    default: m.Contributors,
  }))
);

const HealthDashboard = lazy(() =>
  import('@/components/HealthDashboard/HealthDashboard.tsx').then((m) => ({
    default: m.HealthDashboard,
  }))
);

const TechRadar = lazy(() =>
  import('@/components/TechRadar/TechRadar.tsx').then((m) => ({
    default: m.TechRadar,
  }))
);

const Timeline = lazy(() =>
  import('@/components/Timeline/Timeline.tsx').then((m) => ({
    default: m.Timeline,
  }))
);

const SmartSearch = lazy(() =>
  import('@/components/SmartSearch/SmartSearch.tsx').then((m) => ({
    default: m.SmartSearch,
  }))
);

const Repositories = lazy(() =>
  import('@/components/Repositories/Repositories.tsx').then((m) => ({
    default: m.Repositories,
  }))
);

export default function App() {
  const status = useRepoStore((s) => s.status);
  const error = useRepoStore((s) => s.error);
  const activeTab = useRepoStore((s) => s.activeTab);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const darkMode = useRepoStore((s) => s.darkMode);
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const githubUser = useRepoStore((s) => s.githubUser);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <InputPanel />

      {error && <ErrorBanner message={error} />}
      {status === 'loading' && <LoadingSpinner message="Fetching repository data..." />}

      {repoInfo && (
        <>
          <StatsBar />
          <Tabs active={activeTab} onChange={setActiveTab} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeTab === 'tree' ? (
              <FileTree />
            ) : activeTab === 'graph' ? (
              <Suspense fallback={<LoadingSpinner message="Loading graph..." />}>
                <DependencyGraph />
              </Suspense>
            ) : activeTab === 'branches' ? (
              <Suspense fallback={<LoadingSpinner message="Loading branches..." />}>
                <BranchTree />
              </Suspense>
            ) : activeTab === 'architecture' ? (
              <Suspense fallback={<LoadingSpinner message="Analyzing architecture..." />}>
                <Architecture />
              </Suspense>
            ) : activeTab === 'heatmap' ? (
              <Suspense fallback={<LoadingSpinner message="Loading heatmap..." />}>
                <Heatmap />
              </Suspense>
            ) : activeTab === 'contributors' ? (
              <Suspense fallback={<LoadingSpinner message="Loading contributors..." />}>
                <Contributors />
              </Suspense>
            ) : activeTab === 'health' ? (
              <Suspense fallback={<LoadingSpinner message="Analyzing health..." />}>
                <HealthDashboard />
              </Suspense>
            ) : activeTab === 'radar' ? (
              <Suspense fallback={<LoadingSpinner message="Loading tech radar..." />}>
                <TechRadar />
              </Suspense>
            ) : activeTab === 'timeline' ? (
              <Suspense fallback={<LoadingSpinner message="Loading timeline..." />}>
                <Timeline />
              </Suspense>
            ) : (
              <Suspense fallback={<LoadingSpinner message="Loading search..." />}>
                <SmartSearch />
              </Suspense>
            )}
          </div>
        </>
      )}

      {status === 'idle' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {githubUser ? (
            <Suspense fallback={<LoadingSpinner message="Loading repositories..." />}>
              <Repositories />
            </Suspense>
          ) : (
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              color: 'var(--text-muted)',
            }}>
              <p style={{ fontSize: '1.1rem' }}>GitHub Repository Visualizer</p>
              <p style={{ fontSize: '0.85rem' }}>Enter a GitHub repo URL above to get started</p>
              <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Or set your GitHub username in Settings to browse your repos</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
