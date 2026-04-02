import { useState, useMemo } from 'react';
import { Loader2, Network } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { GraphCanvas } from './GraphCanvas.tsx';
import { CodeMap } from '@/components/CodeMap/CodeMap.tsx';
import styles from './DependencyGraph.module.css';

export function DependencyGraph() {
  const graphNodes = useRepoStore((s) => s.graphNodes);
  const graphEdges = useRepoStore((s) => s.graphEdges);
  const graphFilter = useRepoStore((s) => s.graphFilter);
  const setGraphFilter = useRepoStore((s) => s.setGraphFilter);
  const buildDependencyGraph = useRepoStore((s) => s.buildDependencyGraph);

  const [isBuilding, setIsBuilding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [codeMapFile, setCodeMapFile] = useState<string | null>(null);

  const handleBuild = async () => {
    setIsBuilding(true);
    try {
      await buildDependencyGraph();
    } finally {
      setIsBuilding(false);
    }
  };

  const filteredNodes = useMemo(() => {
    let nodes = graphNodes;

    if (graphFilter.extensions.length > 0) {
      nodes = nodes.filter((n) => graphFilter.extensions.includes(n.extension));
    }

    if (graphFilter.hideIsolated) {
      const connected = new Set<string>();
      for (const edge of graphEdges) {
        connected.add(edge.source);
        connected.add(edge.target);
      }
      nodes = nodes.filter((n) => connected.has(n.id));
    }

    return nodes.slice(0, graphFilter.maxNodes);
  }, [graphNodes, graphEdges, graphFilter]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return graphEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [filteredNodes, graphEdges]);

  const availableExtensions = useMemo(() => {
    const exts = new Set(graphNodes.map((n) => n.extension).filter(Boolean));
    return [...exts].sort();
  }, [graphNodes]);

  if (graphNodes.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Network size={48} strokeWidth={1} />
          <p>Build the dependency graph to visualize import relationships</p>
          <button
            className={styles.buildBtn}
            onClick={handleBuild}
            disabled={isBuilding}
          >
            {isBuilding ? (
              <span className={styles.buildingState}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Analyzing imports...
              </span>
            ) : (
              'Build Graph'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <span className={styles.controlLabel}>Filter:</span>
        <select
          className={styles.controlSelect}
          title="Filter by file type"
          value={graphFilter.extensions.join(',')}
          onChange={(e) =>
            setGraphFilter({
              extensions: e.target.value ? e.target.value.split(',') : [],
            })
          }
        >
          <option value="">All types</option>
          {availableExtensions.map((ext) => (
            <option key={ext} value={ext}>
              .{ext}
            </option>
          ))}
        </select>

        <label className={styles.controlCheckbox}>
          <input
            type="checkbox"
            checked={graphFilter.hideIsolated}
            onChange={(e) => setGraphFilter({ hideIsolated: e.target.checked })}
          />
          Hide isolated
        </label>

        <span className={styles.nodeCount}>
          {filteredNodes.length} nodes, {filteredEdges.length} edges
        </span>

        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <button
          className={styles.buildBtn}
          onClick={handleBuild}
          disabled={isBuilding}
        >
          {isBuilding ? 'Building...' : 'Rebuild'}
        </button>
      </div>

      <GraphCanvas
        nodes={filteredNodes}
        edges={filteredEdges}
        searchQuery={searchQuery}
        onOpenCodeMap={setCodeMapFile}
      />

      {codeMapFile && (
        <CodeMap
          filePath={codeMapFile}
          onClose={() => setCodeMapFile(null)}
        />
      )}
    </div>
  );
}
