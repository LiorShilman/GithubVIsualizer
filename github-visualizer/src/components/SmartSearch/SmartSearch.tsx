import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Search, FileText, FolderOpen, X, Filter, Code, Image,
  ExternalLink, ChevronDown, ChevronRight,
  LayoutGrid, List, Folder, PanelRightClose,
} from 'lucide-react';
import { codeToHtml } from 'shiki';
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

interface DirGroup {
  dir: string;
  files: SearchResult[];
  totalSize: number;
}

type FilterMode = 'all' | 'code' | 'config' | 'docs' | 'assets';
type ViewMode = 'grouped' | 'grid';

const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'cs', 'rb', 'php', 'swift', 'kt', 'scala', 'vue', 'svelte']);
const CONFIG_EXTS = new Set(['json', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'env', 'xml', 'lock']);
const DOC_EXTS = new Set(['md', 'txt', 'rst', 'adoc', 'html', 'htm']);
const ASSET_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'mp4', 'mp3', 'woff', 'woff2', 'ttf', 'eot']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp']);

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  css: 'css', scss: 'scss', html: 'html', vue: 'vue',
  json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  php: 'php', dart: 'dart', lua: 'lua', sql: 'sql',
  toml: 'toml', xml: 'xml', svg: 'xml',
};

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
    parts.push(<span key={idx} className={styles.highlight}>{text.slice(idx, idx + query.length)}</span>);
    lastIdx = idx + query.length;
    idx = lower.indexOf(qLower, lastIdx);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getFileTypeIcon(ext: string) {
  if (IMAGE_EXTS.has(ext)) return Image;
  if (CODE_EXTS.has(ext)) return Code;
  return FileText;
}

export function SmartSearch() {
  const tree = useRepoStore((s) => s.tree);
  const repoInfo = useRepoStore((s) => s.repoInfo);
  const branch = useRepoStore((s) => s.branch);
  const loadFileContent = useRepoStore((s) => s.loadFileContent);
  const fileContents = useRepoStore((s) => s.fileContents);
  const loadingFiles = useRepoStore((s) => s.loadingFiles);

  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState('');
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const files = useMemo(() => {
    return tree
      .filter((n) => n.type === 'blob')
      .map((n) => {
        const parts = n.path.split('/');
        const name = parts[parts.length - 1];
        return {
          path: n.path, name,
          extension: getExtension(name),
          directory: parts.slice(0, -1).join('/') || '/',
          size: n.size || 0,
        };
      });
  }, [tree]);

  const results = useMemo<SearchResult[]>(() => {
    let filtered = files;
    if (filterMode !== 'all') {
      const extSet = filterMode === 'code' ? CODE_EXTS
        : filterMode === 'config' ? CONFIG_EXTS
        : filterMode === 'docs' ? DOC_EXTS : ASSET_EXTS;
      filtered = filtered.filter((f) => extSet.has(f.extension));
    }
    if (!query.trim()) {
      return filtered
        .map((f) => ({ ...f, matchType: 'path' as const, score: f.size }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 300);
    }
    const q = query.toLowerCase();
    const scored: SearchResult[] = [];
    for (const file of filtered) {
      let score = 0;
      let matchType: SearchResult['matchType'] = 'path';
      const nameLower = file.name.toLowerCase();
      const pathLower = file.path.toLowerCase();
      if (nameLower === q) { score = 1000; matchType = 'name'; }
      else if (nameLower.startsWith(q)) { score = 800; matchType = 'name'; }
      else if (nameLower.includes(q)) { score = 600; matchType = 'name'; }
      else if (file.extension.toLowerCase() === q || `.${file.extension}`.toLowerCase() === q) { score = 400; matchType = 'extension'; }
      else if (pathLower.includes(q)) { score = 300; matchType = 'path'; }
      else {
        let qi = 0;
        for (let pi = 0; pi < pathLower.length && qi < q.length; pi++) {
          if (pathLower[pi] === q[qi]) qi++;
        }
        if (qi === q.length) { score = 100; matchType = 'path'; }
      }
      if (score > 0) scored.push({ ...file, matchType, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 300);
  }, [files, query, filterMode]);

  const dirGroups = useMemo<DirGroup[]>(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.directory) || [];
      arr.push(r);
      map.set(r.directory, arr);
    }
    return Array.from(map.entries())
      .map(([dir, files]) => ({
        dir,
        files: files.sort((a, b) => a.name.localeCompare(b.name)),
        totalSize: files.reduce((s, f) => s + f.size, 0),
      }))
      .sort((a, b) => b.files.length - a.files.length);
  }, [results]);

  const extDistribution = useMemo(() => {
    const map = new Map<string, { count: number; size: number }>();
    for (const r of results) {
      const e = map.get(r.extension) || { count: 0, size: 0 };
      e.count++;
      e.size += r.size;
      map.set(r.extension, e);
    }
    const arr = Array.from(map.entries())
      .map(([ext, { count, size }]) => ({ ext, count, size }))
      .sort((a, b) => b.count - a.count);
    const total = arr.reduce((s, e) => s + e.count, 0);
    return { items: arr.slice(0, 12), total };
  }, [results]);

  const totalSize = useMemo(() => results.reduce((s, r) => s + r.size, 0), [results]);

  // Viewer: load content + highlight
  useEffect(() => {
    if (!viewingFile) { setHighlightedHtml(''); return; }
    const ext = getExtension(viewingFile);
    if (IMAGE_EXTS.has(ext)) return;
    const content = fileContents.get(viewingFile);
    if (!content) { loadFileContent(viewingFile); return; }
    const displayContent = content.split('\n').slice(0, 500).join('\n');
    const lang = EXT_TO_LANG[ext] || 'text';
    let cancelled = false;
    codeToHtml(displayContent, { lang, theme: 'github-dark' })
      .then((html) => { if (!cancelled) setHighlightedHtml(html); })
      .catch(() => { if (!cancelled) setHighlightedHtml(`<pre><code>${escapeHtml(displayContent)}</code></pre>`); });
    return () => { cancelled = true; };
  }, [viewingFile, fileContents, loadFileContent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && viewingFile) setViewingFile(null);
  }, [viewingFile]);

  const handleResultClick = useCallback((result: SearchResult) => {
    setViewingFile(result.path);
    if (!IMAGE_EXTS.has(getExtension(result.path))) loadFileContent(result.path);
  }, [loadFileContent]);

  const toggleDir = useCallback((dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir); else next.add(dir);
      return next;
    });
  }, []);

  const getImageUrl = (path: string) => {
    if (!repoInfo) return '';
    return `https://raw.githubusercontent.com/${repoInfo.full_name}/${branch}/${path}`;
  };

  const githubUrl = (path: string) => {
    if (!repoInfo) return '#';
    return `${repoInfo.html_url}/blob/${branch}/${path}`;
  };

  // Preview panel data
  const previewExt = viewingFile ? getExtension(viewingFile) : '';
  const previewIsImage = viewingFile ? IMAGE_EXTS.has(previewExt) : false;
  const previewContent = viewingFile ? fileContents.get(viewingFile) : undefined;
  const previewIsLoading = viewingFile ? loadingFiles.has(viewingFile) : false;
  const previewFileName = viewingFile ? (viewingFile.split('/').pop() || viewingFile) : '';

  return (
    <div className={styles.container} onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}><Search size={16} /> Smart Search</span>
        <span className={styles.stats}>{files.length} files &middot; {formatSize(totalSize)}</span>
      </div>

      {/* Search bar */}
      <div className={styles.searchBar}>
        <Search size={16} className={styles.searchIcon} />
        <input
          ref={inputRef} type="text"
          placeholder="Search files by name, path, or extension..."
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
        {query && (
          <button className={styles.clearBtn} onClick={() => setQuery('')} title="Clear search">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters + view toggle */}
      <div className={styles.filters}>
        <Filter size={14} />
        {(['all', 'code', 'config', 'docs', 'assets'] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            className={`${styles.filterBtn} ${filterMode === mode ? styles.filterActive : ''}`}
            onClick={() => setFilterMode(mode)}
          >{mode}</button>
        ))}
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${viewMode === 'grouped' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('grouped')} title="Grouped by folder"
          ><List size={14} /></button>
          <button
            className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('grid')} title="Grid view"
          ><LayoutGrid size={14} /></button>
        </div>
      </div>

      {/* Visual overview: extension distribution bar */}
      <div className={styles.overview}>
        <div className={styles.distBar}>
          {extDistribution.items.map(({ ext, count }) => (
            <div
              key={ext}
              className={styles.distSegment}
              style={{
                width: `${(count / extDistribution.total) * 100}%`,
                background: getExtensionColor(ext),
              }}
              title={`.${ext}: ${count} files`}
              onClick={() => setQuery(`.${ext}`)}
            />
          ))}
        </div>
        <div className={styles.distLegend}>
          {extDistribution.items.slice(0, 8).map(({ ext, count }) => (
            <span key={ext} className={styles.distLabel} onClick={() => setQuery(`.${ext}`)}>
              <span className={styles.distDot} style={{ background: getExtensionColor(ext) }} />
              .{ext} <small>{count}</small>
            </span>
          ))}
          {results.length > 0 && (
            <span className={styles.distTotal}>
              {results.length} results &middot; {dirGroups.length} folders
            </span>
          )}
        </div>
      </div>

      {/* ─── Split layout: results + preview ─── */}
      <div className={`${styles.splitContainer} ${viewingFile ? styles.splitOpen : ''}`}>
        {/* Left: results list */}
        <div className={styles.resultsPane}>
          <div className={styles.results}>
            {viewMode === 'grouped' ? (
              dirGroups.map((group) => {
                const isCollapsed = collapsedDirs.has(group.dir);
                return (
                  <div key={group.dir} className={styles.dirGroup}>
                    <div className={styles.dirHeader} onClick={() => toggleDir(group.dir)}>
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      <Folder size={14} className={styles.dirIcon} />
                      <span className={styles.dirName}>{group.dir === '/' ? 'Root' : group.dir}</span>
                      <span className={styles.dirMeta}>
                        {group.files.length} files &middot; {formatSize(group.totalSize)}
                      </span>
                      <div className={styles.dirExts}>
                        {[...new Set(group.files.map((f) => f.extension))].slice(0, 5).map((ext) => (
                          <span key={ext} className={styles.dirExtBadge} style={{ color: getExtensionColor(ext), borderColor: `${getExtensionColor(ext)}40` }}>
                            .{ext}
                          </span>
                        ))}
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div className={styles.dirFiles}>
                        {group.files.map((result) => {
                          const TypeIcon = getFileTypeIcon(result.extension);
                          const isImage = IMAGE_EXTS.has(result.extension);
                          const color = getExtensionColor(result.extension);
                          const isActive = viewingFile === result.path;
                          return (
                            <div
                              key={result.path}
                              className={`${styles.fileRow} ${isActive ? styles.fileRowActive : ''}`}
                              onClick={() => handleResultClick(result)}
                            >
                              <div className={styles.fileIcon} style={{ color }}>
                                <TypeIcon size={15} />
                              </div>
                              <span className={styles.fileName}>
                                {highlightMatch(result.name, query)}
                              </span>
                              <span className={styles.fileExt} style={{ color }}>.{result.extension}</span>
                              <span className={styles.fileSize}>{formatSize(result.size)}</span>
                              {isImage && <span className={styles.previewBadge}>img</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className={styles.grid}>
                {results.map((result) => {
                  const TypeIcon = getFileTypeIcon(result.extension);
                  const isImage = IMAGE_EXTS.has(result.extension);
                  const color = getExtensionColor(result.extension);
                  const isActive = viewingFile === result.path;
                  return (
                    <div
                      key={result.path}
                      className={`${styles.gridCard} ${isActive ? styles.gridCardActive : ''}`}
                      onClick={() => handleResultClick(result)}
                    >
                      <div className={styles.gridCardIcon} style={{ background: `${color}12`, color }}>
                        <TypeIcon size={22} />
                      </div>
                      <div className={styles.gridCardName}>{highlightMatch(result.name, query)}</div>
                      <div className={styles.gridCardPath}>
                        <FolderOpen size={9} /> {result.directory}
                      </div>
                      <div className={styles.gridCardFooter}>
                        <span className={styles.gridCardExt} style={{ color, borderColor: `${color}30` }}>.{result.extension}</span>
                        <span className={styles.gridCardSize}>{formatSize(result.size)}</span>
                        {isImage && <span className={styles.previewBadge}>img</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: preview panel */}
        {viewingFile && (
          <div className={styles.previewPane}>
            {/* Preview header */}
            <div className={styles.previewHeader}>
              <span className={styles.previewDot} style={{ background: getExtensionColor(previewExt) }} />
              <span className={styles.previewFileName}>{previewFileName}</span>
              <span className={styles.previewPath}>{viewingFile}</span>
              <a className={styles.previewGithubLink} href={githubUrl(viewingFile)} target="_blank" rel="noopener noreferrer" title="Open on GitHub">
                <ExternalLink size={12} />
              </a>
              <button className={styles.previewCloseBtn} onClick={() => setViewingFile(null)} title="Close preview (Esc)">
                <PanelRightClose size={14} />
              </button>
            </div>

            {/* Preview content */}
            <div className={styles.previewContent}>
              {previewIsImage ? (
                <div className={styles.imagePreview}>
                  <img src={getImageUrl(viewingFile)} alt={previewFileName} className={styles.previewImage} />
                  <div className={styles.imageInfo}>{previewFileName} &middot; .{previewExt}</div>
                </div>
              ) : previewIsLoading ? (
                <div className={styles.previewLoading}>Loading file...</div>
              ) : previewContent ? (
                <div className={styles.codeContent}>
                  <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                </div>
              ) : (
                <div className={styles.previewLoading}>Failed to load file</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
