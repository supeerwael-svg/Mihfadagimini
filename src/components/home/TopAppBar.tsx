import React from 'react';
import { Lightbulb } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';

interface TopAppBarProps {
  isArchiveYear?: boolean;
  yearLabel?: string;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  isArchiveYear = false,
  yearLabel,
}) => {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-30 bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-[0_3px_14px_rgba(15,23,42,0.16)] pt-safe">
      <div className="mx-auto max-w-6xl px-4 min-h-[84px] sm:min-h-[88px] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-2xl font-extrabold leading-tight tracking-tight truncate">
            {t.appName}
          </h1>
          {isArchiveYear && yearLabel && (
            <p className="text-[11px] font-medium opacity-85 truncate mt-0.5 tabular-nums">
              {t.common.readOnlyArchive} · {yearLabel}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 min-w-0 shrink">
          <Lightbulb className="w-4 h-4 text-amber-300 fill-amber-300/90 shrink-0" />
          <span className="text-xs font-semibold opacity-95 truncate max-w-[165px] sm:max-w-xs">
            {t.appTagline}
          </span>
        </div>
      </div>
    </header>
  );
};
