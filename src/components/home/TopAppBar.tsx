import React from 'react';
import { Building2, Search } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { PWAInstallButton } from '@/src/components/common/PWAInstallButton';

interface TopAppBarProps {
  onOpenSearch: () => void;
  onOpenSchoolGateway: () => void;
  isArchiveYear?: boolean;
  yearLabel?: string;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  onOpenSearch,
  onOpenSchoolGateway,
  isArchiveYear = false,
  yearLabel,
}) => {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-30 bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-sm pt-safe">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-extrabold leading-tight truncate">{t.appName}</h1>
          <p className="text-[11px] opacity-85 truncate">
            {isArchiveYear && yearLabel ? `${t.common.readOnlyArchive} · ${yearLabel}` : t.appTagline}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={onOpenSchoolGateway}
            aria-label={t.school.pageTitle}
            title={t.school.pageTitle}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-white/15 transition-colors"
          >
            <Building2 className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={t.common.search}
            title={t.common.search}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-white/15 transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
