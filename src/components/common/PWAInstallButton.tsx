import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';
import { useI18n } from '@/src/i18n/I18nContext';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { t } = useI18n();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          compact
            ? 'min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] hover:bg-white/25 transition-colors whitespace-nowrap shrink-0'
            : 'min-h-[48px] w-full flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-primary)] hover:opacity-95 transition-opacity'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{t.common.installApp}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] hover:bg-white/25 transition-colors whitespace-nowrap shrink-0'
              : 'min-h-[48px] w-full flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text)]'
          }
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>{t.common.installIOS}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-6 shadow-xl border border-[var(--color-border)]">
              <h3 className="text-lg font-bold text-[var(--color-text)]">{t.common.installIOS}</h3>
              <p className="mt-3 text-sm text-[var(--color-text-muted)] leading-relaxed">
                {t.common.iosStep1}
                <br />
                {t.common.iosStep2}
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 min-h-[44px] w-full rounded-xl bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-[var(--color-on-primary)]"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
