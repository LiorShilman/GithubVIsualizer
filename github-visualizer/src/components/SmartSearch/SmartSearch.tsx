import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, FileText, FolderOpen, X, Filter } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { getExtension, getExtensionColor } from '@/utils/fileIcons.ts';
import styles from './SmartSearch.module.css';

interface SearchResult {
  path: string;
  name: string;
  extension: string;
  directory: string;
  size: number;
  matchType: 'name' | 'path' | 'extension' | 'directory';
  score: number;
}

type FilterMode = 'all' | 'code' | 'config' | 'docs' | 'assets';

const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'cs', 'rb', 'php', 'swift', 'kt', 'scala', 'vue', 'svelte']);
const CONFIG_EXTS = new Set(['json', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'env', 'xml', 'lock']);
const DOC_EXTS = new Set(['md', 'txt', 'rst', 'adoc', 'html', 'htm']);
const ASSET_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'mp4', 'mp3', 'woff', 'woff2', 'ttf', 'eot']);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function highlightMatch(text: string, query: string): React.ReactNode[] {
  if (!query) return [text];
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;

  let idx = lower.indexOf(qLower);
  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <span key={idx} className={styles.highlight}>
        {text.slice(idx, idx + query.length)}
      </span>
    );
    lastIdx = idx + query.length;
    idx = lower.indexOf(qLower, lastIdx);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

export function SmartSearch() {
  const tree = useRepoStore((s) => s.tree);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const setSelectedFile = useRepoStore((s) => s.setSelectedFile);

  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const files = useMemo(() => {
    return tree
      .filter((n) => n.type === 'blob')
      .map((n) => {
        const parts = n.path.split('/');
        const name = parts[parts.length - 1];
        return {
          path: n.path,
          name,
          extension: getExtension(name),
          directory: parts.slice(0, -1).join('/') || '/',
          size: n.size || 0,
        };
      });
  }, [tree]);

  const results = useMemo<SearchResult[]>(() => {
    let filtered = files;

    // Apply filter mode
    if (filterMode !== 'all') {
      const extSet = filterMode === 'code' ? CODE_EXTS
        : filterMode === 'config' ? CONFIG_EXTS
        : filterMode === 'docs' ? DOC_EXTS
        : ASSET_EXTS;
      filtered = filtered.filter((f) => extSet.has(f.extension));
    }

    if (!query.trim()) {
      // Show all files sorted by size when no query
      return filtered
        .map((f) => ({ ...f, matchType: 'path' as const, score: f.size }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 200);
    }

    const q = query.toLowerCase();
    const scored: SearchResult[] = [];

    for (const file of filtered) {
      let score = 0;
      let matchType: SearchResult['matchType'] = 'path';

      const nameLower = file.name.toLowerCase();
      const pathLower = file.path.toLowerCase();

      // Exact name match
      if (nameLower === q) {
        score = 1000;
        matchType = 'name';
      }
      // Name starts with query
      else if (nameLower.startsWith(q)) {
        score = 800;
        matchType = 'name';
      }
      // Name contains query
      else if (nameLower.includes(q)) {
        score = 600;
        matchType = 'name';
      }
      // Extension match
      else if (file.extension.toLowerCase() === q || (`.${file.extension}`).toLowerCase() === q) {
        score = 400;
        matchType = 'extension';
      }
      // Path contains query
      else if (pathLower.includes(q)) {
        score = 300;
        matchType = 'path';
      }
      // Fuzzy: all chars in order
      else {
        let qi = 0;
        for (let pi = 0; pi < pathLower.length && qi < q.length; pi++) {
          if (pathLower[pi] === q[qi]) qi++;
        }
        if (qi === q.length) {
          score = 100;
          matchType = 'path';
        }
      }

      if (score > 0) {
        scored.push({ ...file, matchType, score });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, 200);
  }, [files, query, filterMode]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((p) => Math.min(p + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((p) => Math.max(p - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      const r = results[selectedIdx];
      setSelectedFile(r.path);
      setActiveTab('tree');
    }
  }, [results, selectedIdx, setSelectedFile, setActiveTab]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIdx]);

  const handleResultClick = useCallback((result: SearchResult) => {
    setSelectedFile(result.path);
    setActiveTab('tree');
  }, [setSelectedFile, setActiveTab]);

  // Extension stats for current results
  const extStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of results) {
      map.set(r.extension, (map.get(r.extension) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [results]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>
          <Search size={16} />
          Smart Search
        </span>
        <span className={styles.stats}>{files.length} files indexed</span>
      </div>

      {/* Search bar */}
      <div className={styles.searchBar}>
        <Search size={16} className={styles.searchIcon} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search files by name, path, or extension..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
        {query && (
          <button className={styles.clearBtn} onClick={() => setQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <Filter size={14} />
        {(['all', 'code', 'config', 'docs', 'assets'] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            className={`${styles.filterBtn} ${filterMode === mode ? styles.filterActive : ''}`}
            onClick={() => setFilterMode(mode)}
          >
            {mode}
          </button>
        ))}

        <div className={styles.extTags}>
          {extStats.map(([ext, count]) => (
            <span
              key={ext}
              className={styles.extTag}
              style={{ borderColor: getExtensionColor(ext) }}
              onClick={() => setQuery(`.${ext}`)}
            >
              .{ext} <small>{count}</small>
            </span>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className={styles.results} ref={listRef}>
        <div className={styles.resultCount}>
          {results.length} result{results.length !== 1 ? 's' : ''}
          {query && ` for "${query}"`}
        </div>

        {results.map((result, i) => (
          <div
            key={result.path}
            data-idx={i}
            className={`${styles.resultRow} ${i === selectedIdx ? styles.selected : ''}`}
            onClick={() => handleResultClick(result)}
            onMouseEnter={() => setSelectedIdx(i)}
          >
            <div
              className={styles.extDot}
              style={{ background: getExtensionColor(result.extension) }}
            />
            <div className={styles.resultInfo}>
              <div className={styles.resultName}>
                <FileText size={14} />
                {highlightMatch(result.name, query)}
              </div>
              <div className={styles.resultPath}>
                <FolderOpen size={11} />
                {highlightMatch(result.directory, query)}
              </div>
            </div>
            <span className={styles.resultSize}>{formatSize(result.size)}</span>
            <span
              className={styles.resultExt}
              style={{ color: getExtensionColor(result.extension) }}
            >
              .{result.extension}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
