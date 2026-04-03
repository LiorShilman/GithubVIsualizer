import { useMemo, useState, useCallback } from 'react';
import { Flame, FolderOpen } from 'lucide-react';
import { useRepoStore } from '@/store/useRepoStore.ts';
import { getExtension, getExtensionColor } from '@/utils/fileIcons.ts';
import styles from './Heatmap.module.css';

type SizeMode = 'size' | 'extension';
type ColorMode = 'size' | 'extension' | 'depth';
type GroupMode = 'none' | 'directory' | 'extension';

interface FileCell {
  path: string;
  name: string;
  extension: string;
  directory: string;
  topDir: string;
  size: number;
  depth: number;
}

interface FileGroup {
  label: string;
  files: FileCell[];
  totalSize: number;
  color: string;
}

// Color gradient from cold to hot
function getHeatColor(ratio: number): string {
  const stops = [
    { r: 0, g: 255, b: 170 },    // bright cyan-green
    { r: 0, g: 220, b: 255 },    // electric cyan
    { r: 255, g: 230, b: 0 },    // vivid yellow
    { r: 255, g: 100, b: 0 },    // bright orange
    { r: 255, g: 0, b: 60 },     // hot red-pink
  ];

  const t = Math.max(0, Math.min(1, ratio)) * (stops.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = stops[Math.min(i, stops.length - 1)];
  const b = stops[Math.min(i + 1, stops.length - 1)];

  const r = Math.round(a.r + (b.r - a.r) * f);
  const g = Math.round(a.g + (b.g - a.g) * f);
  const bl = Math.round(a.b + (b.b - a.b) * f);

  return `rgb(${r},${g},${bl})`;
}

function getDepthColor(depth: number): string {
  return getHeatColor(Math.min(depth / 8, 1));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const GROUP_COLORS = [
  '#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#84CC16', '#F97316', '#A855F7',
  '#10B981', '#E11D48', '#0EA5E9', '#D946EF', '#22C55E',
];

function getTopDir(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 1) return '/';
  if (parts[0] === 'src' && parts.length > 2) return parts[1];
  return parts[0];
}

export function Heatmap() {
  const tree = useRepoStore((s) => s.tree);
  const showConfig = useRepoStore((s) => s.showConfig);

  const [sizeMode, setSizeMode] = useState<SizeMode>('size');
  const [colorMode, setColorMode] = useState<ColorMode>('size');
  const [groupMode, setGroupMode] = useState<GroupMode>('directory');
  const [tooltip, setTooltip] = useState<{ cell: FileCell; x: number; y: number } | null>(null);

  const CONFIG_PATTERNS = /\.(json|yml|yaml|toml|ini|cfg|conf|lock|env|editorconfig|gitignore|prettierrc|eslintrc)/i;

  const files = useMemo<FileCell[]>(() => {
    return tree
      .filter((n) => n.type === 'blob' && n.size && n.size > 0)
      .filter((n) => showConfig || !CONFIG_PATTERNS.test(n.path))
      .map((n) => {
        const parts = n.path.split('/');
        return {
          path: n.path,
          name: parts[parts.length - 1],
          extension: getExtension(parts[parts.length - 1]),
          directory: parts.slice(0, -1).join('/') || '/',
          topDir: getTopDir(n.path),
          size: n.size || 0,
          depth: parts.length - 1,
        };
      })
      .sort((a, b) => b.size - a.size);
  }, [tree, showConfig]);

  const groups = useMemo<FileGroup[]>(() => {
    if (groupMode === 'none') {
      return [{ label: 'All Files', files, totalSize: files.reduce((s, f) => s + f.size, 0), color: '#6366F1' }];
    }

    const map = new Map<string, FileCell[]>();
    for (const file of files) {
      const key = groupMode === 'directory' ? file.topDir : (file.extension || 'other');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(file);
    }

    const sorted = Array.from(map.entries())
      .map(([label, files], i) => ({
        label,
        files: files.sort((a, b) => b.size - a.size),
        totalSize: files.reduce((s, f) => s + f.size, 0),
        color: GROUP_COLORS[i % GROUP_COLORS.length],
      }))
      .sort((a, b) => b.totalSize - a.totalSize);

    return sorted;
  }, [files, groupMode]);

  const maxSize = useMemo(() => Math.max(...files.map((f) => f.size), 1), [files]);
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const getCellColor = useCallback(
    (cell: FileCell): string => {
      switch (colorMode) {
        case 'size':
          return getHeatColor(cell.size / maxSize);
        case 'extension':
          return getExtensionColor(cell.extension);
        case 'depth':
          return getDepthColor(cell.depth);
        default:
          return '#6366F1';
      }
    },
    [colorMode, maxSize]
  );

  const getCellSize = useCallback(
    (cell: FileCell): number => {
      switch (sizeMode) {
        case 'size': {
          const ratio = cell.size / maxSize;
          return Math.max(32, Math.sqrt(ratio) * 180);
        }
        case 'extension':
          return 60;
        default:
          return 60;
      }
    },
    [sizeMode, maxSize]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, cell: FileCell) => {
      setTooltip({ cell, x: e.clientX + 12, y: e.clientY + 12 });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (files.length === 0) {
    return (
      <div className={styles.container}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <Flame size={48} strokeWidth={1} />
          <p>No files to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <span className={styles.title}>
          <Flame size={16} />
          File Heatmap
        </span>

        <select
          className={styles.controlSelect}
          title="Group by"
          value={groupMode}
          onChange={(e) => setGroupMode(e.target.value as GroupMode)}
        >
          <option value="directory">Group by directory</option>
          <option value="extension">Group by extension</option>
          <option value="none">No grouping</option>
        </select>

        <select
          className={styles.controlSelect}
          title="Cell size"
          value={sizeMode}
          onChange={(e) => setSizeMode(e.target.value as SizeMode)}
        >
          <option value="size">Size by file size</option>
          <option value="extension">Equal size</option>
        </select>

        <select
          className={styles.controlSelect}
          title="Color by"
          value={colorMode}
          onChange={(e) => setColorMode(e.target.value as ColorMode)}
        >
          <option value="size">Color by size (heat)</option>
          <option value="extension">Color by type</option>
          <option value="depth">Color by depth</option>
        </select>

        <div className={styles.gradientBar}>
          <span>Small</span>
          <div className={styles.gradient} />
          <span>Large</span>
        </div>

        <span className={styles.stats}>
          {files.length} files · {formatSize(totalSize)}
        </span>
      </div>

      <div className={styles.treemap}>
        {groups.map((group) => (
          <div key={group.label} className={styles.group}>
            {groupMode !== 'none' && (
              <div className={styles.groupHeader} style={{ borderLeftColor: group.color }}>
                <FolderOpen size={14} style={{ color: group.color }} />
                <span className={styles.groupLabel} style={{ color: group.color }}>
                  {groupMode === 'extension' ? `.${group.label}` : group.label}
                </span>
                <span className={styles.groupStats}>
                  {group.files.length} files · {formatSize(group.totalSize)}
                </span>
              </div>
            )}
            <div className={styles.groupCells}>
              {group.files.map((cell) => {
                const dim = getCellSize(cell);
                const color = getCellColor(cell);

                return (
                  <div
                    key={cell.path}
                    className={styles.cell}
                    style={{
                      width: dim,
                      height: dim,
                      background: color,
                    }}
                    onMouseMove={(e) => handleMouseMove(e, cell)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {dim > 45 && (
                      <span className={styles.cellName}>{cell.name}</span>
                    )}
                    {dim > 60 && (
                      <span className={styles.cellSize}>{formatSize(cell.size)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className={styles.tooltipPath}>{tooltip.cell.path}</div>
          <div className={styles.tooltipMeta}>
            <span>Size: {formatSize(tooltip.cell.size)}</span>
            <span>Type: .{tooltip.cell.extension || 'unknown'}</span>
            <span>Depth: {tooltip.cell.depth} levels</span>
            <span>Dir: {tooltip.cell.directory}</span>
          </div>
        </div>
      )}
    </div>
  );
}
