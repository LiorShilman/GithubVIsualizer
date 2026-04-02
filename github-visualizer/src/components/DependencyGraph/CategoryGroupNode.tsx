import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Folder } from 'lucide-react';

interface CategoryGroupData {
  label: string;
  color: string;
  count: number;
  [key: string]: unknown;
}

export const CategoryGroupNode = memo(function CategoryGroupNode({ data }: NodeProps) {
  const d = data as CategoryGroupData;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `${d.color}08`,
        border: `1.5px dashed ${d.color}40`,
        borderRadius: 16,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          fontSize: '0.78rem',
          fontWeight: 700,
          color: d.color,
          letterSpacing: '0.3px',
          textTransform: 'uppercase',
          opacity: 0.85,
        }}
      >
        <Folder size={14} />
        {d.label}
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 500,
            opacity: 0.6,
            textTransform: 'none',
          }}
        >
          ({d.count})
        </span>
      </div>
    </div>
  );
});
