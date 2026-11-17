import React from 'react';
import { FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, action }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60">
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center mb-3">
        <FolderOpen className="w-6 h-6" />
      </div>
      <p className="text-sm font-bold text-[var(--color-text)]">{title}</p>
      {subtitle && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)] max-w-xs">{subtitle}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
