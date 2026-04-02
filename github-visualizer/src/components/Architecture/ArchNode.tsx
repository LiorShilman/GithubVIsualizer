import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Monitor, Server, Database, Shield, Zap, HardDrive,
  Cloud, RefreshCw, FlaskConical, Plug,
} from 'lucide-react';

interface ArchNodeData {
  label: string;
  tech: string;
  icon: string;
  componentType: string;
  color: string;
  fileCount: number;
  [key: string]: unknown;
}

const TYPE_ICONS: Record<string, typeof Monitor> = {
  frontend: Monitor,
  backend: Server,
  database: Database,
  api: Plug,
  auth: Shield,
  cache: Zap,
  storage: HardDrive,
  external: Cloud,
  ci: RefreshCw,
  testing: FlaskConical,
};

export const TYPE_COLORS: Record<string, string> = {
  frontend: '#3B82F6',
  backend: '#10B981',
  database: '#F59E0B',
  api: '#8B5CF6',
  auth: '#EF4444',
  cache: '#F97316',
  storage: '#6366F1',
  external: '#06B6D4',
  ci: '#84CC16',
  testing: '#EC4899',
};

export const ArchNode = memo(function ArchNode({ data }: NodeProps) {
  const d = data as ArchNodeData;
  const Icon = TYPE_ICONS[d.componentType] || Server;
  const color = d.color;

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: `2px solid ${color}`,
        borderRadius: 16,
        padding: '20px 24px',
        minWidth: 200,
        textAlign: 'center',
        boxShadow: `0 0 20px ${color}25, 0 4px 16px rgba(0,0,0,0.12)`,
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color, width: 8, height: 8, border: '2px solid var(--bg-primary)' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: color, width: 8, height: 8, border: '2px solid var(--bg-primary)' }} />

      {/* Glow ring */}
      <div
        style={{
          position: 'absolute',
          inset: -4,
          borderRadius: 20,
          border: `2px solid ${color}30`,
          animation: 'archPulse 3s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />

      {/* Icon */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: `${color}15`,
          border: `2px solid ${color}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 10px',
          color,
        }}
      >
        <Icon size={24} />
      </div>

      {/* Emoji icon */}
      <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{d.icon}</div>

      {/* Label */}
      <div
        style={{
          fontSize: '0.9rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 2,
        }}
      >
        {d.label}
      </div>

      {/* Tech badge */}
      <div
        style={{
          display: 'inline-block',
          fontSize: '0.65rem',
          fontWeight: 600,
          color,
          background: `${color}15`,
          border: `1px solid ${color}30`,
          padding: '2px 10px',
          borderRadius: 10,
          marginBottom: 4,
        }}
      >
        {d.tech}
      </div>

      {/* File count */}
      <div
        style={{
          fontSize: '0.62rem',
          color: 'var(--text-muted)',
          marginTop: 4,
        }}
      >
        {d.fileCount} files
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: color, width: 8, height: 8, border: '2px solid var(--bg-primary)' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: color, width: 8, height: 8, border: '2px solid var(--bg-primary)' }} />
    </div>
  );
});
