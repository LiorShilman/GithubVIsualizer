import { AlertTriangle, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.6rem 1rem',
      background: '#fdeded',
      borderBottom: '1px solid #f5c6c6',
      color: '#c0392b',
      fontSize: '0.85rem',
    }}>
      <AlertTriangle size={16} />
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#c0392b', padding: '2px',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
