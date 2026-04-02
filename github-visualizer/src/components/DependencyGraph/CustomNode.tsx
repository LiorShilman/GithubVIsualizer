import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText, FileCode, FileJson, FileType, Braces } from 'lucide-react';
import styles from './CustomNode.module.css';

interface CustomNodeData {
  label: string;
  extension: string;
  color: string;
  dirColor: string;
  importCount: number;
  exportCount: number;
  directory: string;
  isHighlighted: boolean;
  isDimmed: boolean;
  [key: string]: unknown;
}

function getFileIcon(ext: string, size: number) {
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx':
      return <FileCode size={size} />;
    case 'json':
      return <FileJson size={size} />;
    case 'css': case 'scss': case 'less':
      return <Braces size={size} />;
    case 'py': case 'rb': case 'go': case 'rs':
      return <FileType size={size} />;
    default:
      return <FileText size={size} />;
  }
}

export const CustomNode = memo(function CustomNode({ data }: NodeProps) {
  const d = data as CustomNodeData;
  const importance = Math.min(d.importCount, 10);
  const glowIntensity = importance * 0.08;

  return (
    <div
      className={`${styles.node} ${d.isHighlighted ? styles.highlighted : ''} ${d.isDimmed ? styles.dimmed : ''}`}
      style={{
        '--node-color': d.color,
        '--dir-color': d.dirColor,
        '--glow-intensity': glowIntensity,
      } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div className={styles.colorStripe} />

      <div className={styles.content}>
        <div className={styles.icon}>
          {getFileIcon(d.extension, 16)}
        </div>
        <div className={styles.info}>
          <span className={styles.label}>{d.label}</span>
          <span className={styles.dir}>{d.directory || '/'}</span>
        </div>
        {d.importCount > 0 && (
          <div className={styles.badge} title={`Imported by ${d.importCount} files`}>
            {d.importCount}
          </div>
        )}
      </div>

      {d.importCount > 2 && (
        <div className={styles.pulseRing} />
      )}

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
});
