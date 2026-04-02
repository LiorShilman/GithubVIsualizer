import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      padding: '3rem',
      color: 'var(--text-muted)',
      fontSize: '0.9rem',
    }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
      {message}
    </div>
  );
}
