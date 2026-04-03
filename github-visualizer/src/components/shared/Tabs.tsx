import type { ActiveTab } from '@/types/index.ts';

interface TabsProps {
  active: ActiveTab;
  onChange: (tab: ActiveTab) => void;
}

export function Tabs({ active, onChange }: TabsProps) {
  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      <TabButton
        label="File Tree"
        value="tree"
        active={active}
        onClick={onChange}
      />
      <TabButton
        label="Dependency Graph"
        value="graph"
        active={active}
        onClick={onChange}
      />
      <TabButton
        label="Branch Tree"
        value="branches"
        active={active}
        onClick={onChange}
      />
      <TabButton
        label="Architecture"
        value="architecture"
        active={active}
        onClick={onChange}
      />
      <TabButton
        label="Heatmap"
        value="heatmap"
        active={active}
        onClick={onChange}
      />
      <TabButton
        label="Contributors"
        value="contributors"
        active={active}
        onClick={onChange}
      />
      <TabButton
        label="Health"
        value="health"
        active={active}
        onClick={onChange}
      />
      <TabButton
        label="Tech Radar"
        value="radar"
        active={active}
        onClick={onChange}
      />
      <TabButton
        label="Timeline"
        value="timeline"
        active={active}
        onClick={onChange}
      />
      <TabButton
        label="Search"
        value="search"
        active={active}
        onClick={onChange}
      />
    </div>
  );
}

function TabButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: ActiveTab;
  active: ActiveTab;
  onClick: (tab: ActiveTab) => void;
}) {
  const isActive = active === value;
  return (
    <button
      onClick={() => onClick(value)}
      style={{
        padding: '0.6rem 1.2rem',
        border: 'none',
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: isActive ? 600 : 400,
        fontSize: '0.85rem',
        cursor: 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}
