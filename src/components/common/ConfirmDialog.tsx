import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel,
  danger = true,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-6 shadow-2xl border border-[var(--color-border)]">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              danger ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' : 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">{title}</h3>
            <p className="mt-1.5 text-sm text-[var(--color-text-muted)] leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold text-white ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--color-primary)] hover:opacity-95'
            }`}
          >
            {confirmLabel ?? t.common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
};
