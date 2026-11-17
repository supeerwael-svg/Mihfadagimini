import React from 'react';
import { CalendarDays, Home, Library, MessageSquare, Settings } from 'lucide-react';
import { triggerRipple } from '@/src/hooks/useRipple';
import { useI18n } from '@/src/i18n/I18nContext';

export type NavTab = 'home' | 'library' | 'journal' | 'forum' | 'settings';

interface BottomNavProps {
  activeTab: NavTab;
  onChangeTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab }) => {
  const { t } = useI18n();

  const items: Array<{ id: NavTab; label: string; Icon: React.FC<{ className?: string }> }> = [
    { id: 'home', label: t.nav.home, Icon: Home },
    { id: 'library', label: t.nav.library, Icon: Library },
    { id: 'journal', label: t.nav.journal, Icon: CalendarDays },
    { id: 'forum', label: t.nav.forum, Icon: MessageSquare },
    { id: 'settings', label: t.nav.settings, Icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-[var(--color-surface)]/95 backdrop-blur-md border-t border-[var(--color-border)] pb-safe">
      <div className="mx-auto max-w-4xl grid grid-cols-5 items-center h-16 px-2">
        {items.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                triggerRipple(e);
                onChangeTab(id);
              }}
              className="ripple-surface min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors"
            >
              <span
                className={`px-3.5 py-1 rounded-full transition-colors ${
                  active
                    ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                <Icon className="w-5 h-5" />
              </span>
              <span
                className={`text-[10px] font-bold truncate max-w-full px-1 ${
                  active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
