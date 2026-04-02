import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitMerge, GitCommit, GitBranch } from 'lucide-react';

interface CommitNodeData {
  sha: string;
  message: string;
  author: string;
  avatar: string | null;
  date: string;
  branchName: string;
  color: string;
  isMerge: boolean;
  isHead: boolean;
  isFork: boolean;
  parentCount: number;
  [key: string]: unknown;
}

export const CommitNode = memo(function CommitNode({ data }: NodeProps) {
  const d = data as CommitNodeData;
  const shortSha = d.sha.slice(0, 7);
  const firstLine = d.message.split('\n')[0];
  const shortMessage = firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine;
  const timeAgo = formatTimeAgo(d.date);
  const dateStr = new Date(d.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const Icon = d.isMerge ? GitMerge : d.isFork ? GitBranch : GitCommit;

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: `1.5px solid ${d.isHead || d.isMerge || d.isFork ? d.color : 'var(--border)'}`,
        borderRadius: 10,
        padding: '10px 14px',
        width: 280,
        boxShadow: d.isHead
          ? `0 0 16px ${d.color}30, 0 4px 12px rgba(0,0,0,0.12)`
          : d.isMerge || d.isFork
          ? `0 0 8px ${d.color}20, 0 2px 8px rgba(0,0,0,0.08)`
          : '0 1px 4px rgba(0,0,0,0.06)',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: d.color, width: 8, height: 8, border: '2px solid var(--bg-primary)' }} />

      {/* Branch label for head commits */}
      {d.isHead && (
        <div
          style={{
            position: 'absolute',
            top: -12,
            left: 14,
            background: d.color,
            color: '#fff',
            fontSize: '0.62rem',
            fontWeight: 700,
            padding: '2px 10px',
            borderRadius: 8,
            letterSpacing: '0.4px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <GitBranch size={10} />
          {d.branchName}
        </div>
      )}

      {/* Fork indicator */}
      {d.isFork && !d.isHead && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: 14,
            background: `${d.color}20`,
            color: d.color,
            fontSize: '0.58rem',
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: 6,
            border: `1px solid ${d.color}40`,
          }}
        >
          fork point
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Icon */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: `${d.color}15`,
            border: `1.5px solid ${d.color}50`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: d.color,
            marginTop: 1,
          }}
        >
          <Icon size={14} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Commit message */}
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              lineHeight: 1.35,
              marginBottom: 4,
            }}
            title={d.message}
          >
            {shortMessage}
          </div>

          {/* Meta row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.65rem',
              color: 'var(--text-muted)',
              flexWrap: 'wrap',
            }}
          >
            <code
              style={{
                background: `${d.color}15`,
                padding: '1px 6px',
                borderRadius: 4,
                fontFamily: "'Fira Code', monospace",
                color: d.color,
                fontSize: '0.62rem',
                fontWeight: 600,
              }}
            >
              {shortSha}
            </code>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {d.avatar && (
                <img
                  src={d.avatar}
                  alt={d.author}
                  style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--border)' }}
                />
              )}
              {d.author}
            </span>
            <span style={{ opacity: 0.5 }} title={dateStr}>{timeAgo}</span>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: d.color, width: 8, height: 8, border: '2px solid var(--bg-primary)' }} />
    </div>
  );
});

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
