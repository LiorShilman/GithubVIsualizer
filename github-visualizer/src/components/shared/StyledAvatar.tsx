const GRADIENTS = [
  ['#6366F1', '#A855F7'],
  ['#EC4899', '#F43F5E'],
  ['#14B8A6', '#06B6D4'],
  ['#F59E0B', '#EF4444'],
  ['#8B5CF6', '#6366F1'],
  ['#06B6D4', '#22C55E'],
  ['#F97316', '#F59E0B'],
  ['#E11D48', '#EC4899'],
  ['#10B981', '#14B8A6'],
  ['#A855F7', '#EC4899'],
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface StyledAvatarProps {
  name: string;
  size: number;
  style?: React.CSSProperties;
  className?: string;
}

export function StyledAvatar({ name, size, style, className }: StyledAvatarProps) {
  const idx = hashName(name) % GRADIENTS.length;
  const [c1, c2] = GRADIENTS[idx];
  const initial = name[0]?.toUpperCase() || '?';
  const fontSize = Math.max(8, size * 0.38);
  const innerSize = size * 0.7;

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: `0 0 ${size * 0.4}px ${c1}30`,
        ...style,
      }}
    >
      <div
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: '50%',
          background: '#0f0f1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: c1,
            fontSize,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {initial}
        </span>
      </div>
    </div>
  );
}
