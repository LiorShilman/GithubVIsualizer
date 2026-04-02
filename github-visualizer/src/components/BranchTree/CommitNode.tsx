import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

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
  [key: string]: unknown;
}

export const CommitNode = memo(function CommitNode({ data }: NodeProps) {
  const d = data as CommitNodeData;
  const shortSha = d.sha.slice(0, 7);
  const shortMessage = d.message.split('\n')[0].slice(0, 60);
  const timeAgo = formatTimeAgo(d.date);

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: `1.5px solid ${d.isHead ? d.color : 'var(--border)'}`,
        borderRadius: d.isMerge ? 12 : 8,
        padding: '8px 12px',
        minWidth: 200,
        maxWidth: 280,
        boxShadow: d.isHead
          ? `0 0 12px ${d.color}40, 0 2px 8px rgba(0,0,0,0.1)`
          : '0 2px 6px rgba(0,0,0,0.08)',
        position: 'relative',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: d.color, width: 6, height: 6, border: 'none' }} />

      {/* Branch label for head commits */}
      {d.isHead && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: 12,
            background: d.color,
            color: '#fff',
            fontSize: '0.6rem',
            fontWeight: 700,
            padding: '1px 8px',
            borderRadius: 6,
            letterSpacing: '0.3px',
          }}
        >
          {d.branchName}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Color dot */}
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: d.color,
            flexShrink: 0,
            marginTop: 3,
            border: d.isMerge ? '2px solid var(--bg-primary)' : 'none',
            boxShadow: d.isMerge ? `0 0 0 2px ${d.color}` : 'none',
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Commit message */}
          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.3,
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
              marginTop: 3,
              fontSize: '0.65rem',
              color: 'var(--text-muted)',
            }}
          >
            <code
              style={{
                background: 'var(--bg-secondary)',
                padding: '0 4px',
                borderRadius: 3,
                fontFamily: "'Fira Code', monospace",
                color: d.color,
                fontSize: '0.62rem',
              }}
            >
              {shortSha}
            </code>
            {d.avatar && (
              <img
                src={d.avatar}
                alt={d.author}
                style={{ width: 14, height: 14, borderRadius: '50%' }}
              />
            )}
            <span>{d.author}</span>
            <span style={{ opacity: 0.6 }}>{timeAgo}</span>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: d.color, width: 6, height: 6, border: 'none' }} />
    </div>
  );
});

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}
