import React from 'react';
import {
  Folder,
  LayoutGrid,
  MessageSquare,
  Settings,
  TableProperties,
  Users,
} from 'lucide-react';
import { triggerRipple } from '@/src/hooks/useRipple';
import { useI18n } from '@/src/i18n/I18nContext';

export type NavTab = 'home' | 'forum' | 'classes' | 'grading' | 'library' | 'settings';

interface BottomNavProps {
  activeTab: NavTab;
  onChangeTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab }) => {
  const { t } = useI18n();

  // Order for RTL right-to-left (and LTR left-to-right):
  // Home, Forum, Classes (Student lists), Grading (Grading notebook), Library, Settings
  const items: Array<{ id: NavTab; label: string; Icon: React.FC<{ className?: string }> }> = [
    { id: 'home', label: t.nav.home, Icon: LayoutGrid },
    { id: 'forum', label: t.nav.forum, Icon: MessageSquare },
    { id: 'classes', label: t.nav.classes, Icon: Users },
    { id: 'grading', label: t.nav.grading, Icon: TableProperties },
    { id: 'library', label: t.nav.library, Icon: Folder },
    { id: 'settings', label: t.nav.settings, Icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-[var(--color-surface)] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.45)] border-t border-[var(--color-border)]/60 pb-safe">
      <div className="mx-auto max-w-4xl grid grid-cols-6 items-center h-[72px] px-1">
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
              className="ripple-surface min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors"
            >
              <span
                className={`px-3 py-1 rounded-full transition-colors flex items-center justify-center ${
                  active
                    ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                <Icon className="w-5 h-5" />
              </span>
              <span
                className={`text-[11px] leading-none truncate max-w-full px-0.5 ${
                  active
                    ? 'font-bold text-[var(--color-primary)]'
                    : 'font-semibold text-[var(--color-text-muted)]'
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
