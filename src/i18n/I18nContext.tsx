import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { services } from '@/src/services';
import type { LanguageCode, LocalizedText } from '@/src/types/models';
import { ar, type TranslationDict } from './ar';
import { en } from './en';
import { fr } from './fr';

const DICTS: Record<LanguageCode, TranslationDict> = { ar, en, fr };

interface I18nContextValue {
  lang: LanguageCode;
  dir: 'rtl' | 'ltr';
  t: TranslationDict;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  pickLocalized: (names: LocalizedText) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<LanguageCode>('ar');
  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr';

  const applyDirToHtml = useCallback((l: LanguageCode) => {
    const d = l === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = l;
    document.documentElement.dir = d;
  }, []);

  useEffect(() => {
    applyDirToHtml('ar');
    services.adapter.getMeta('app_language').then((saved) => {
      if (saved === 'ar' || saved === 'en' || saved === 'fr') {
        setLang(saved);
        applyDirToHtml(saved);
      }
    });
  }, [applyDirToHtml]);

  const setLanguage = useCallback(
    async (next: LanguageCode) => {
      setLang(next);
      applyDirToHtml(next);
      await services.adapter.setMeta('app_language', next);
    },
    [applyDirToHtml]
  );

  const pickLocalized = useCallback(
    (names: LocalizedText) => names[lang] || names.ar || names.en || names.fr,
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, dir, t: DICTS[lang], setLanguage, pickLocalized }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
