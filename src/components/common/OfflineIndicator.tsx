import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useI18n } from '@/src/i18n/I18nContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t } = useI18n();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-amber-600 text-white px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>{t.common.offlineMode}</span>
    </div>
  );
};
