import React, { useState } from 'react';
import { BookOpenCheck, KeyRound, Lock, User, UserPlus } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { LanguageCode, UserRecord } from '@/src/types/models';
import { PWAInstallButton } from '@/src/components/common/PWAInstallButton';

interface LoginScreenProps {
  academicYearId: string;
  onAuthenticated: (user: UserRecord) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  academicYearId,
  onAuthenticated,
}) => {
  const { t, lang, setLanguage } = useI18n();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await services.auth.login(username, password);
      if (res.ok) {
        onAuthenticated(res.user);
      } else {
        setError(res.error === 'banned' ? t.auth.bannedError : t.auth.invalidCredentials);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await services.auth.registerWithInviteCode({
        username,
        displayName: displayName || username,
        subjectSpecialty: specialty,
        password,
        inviteCode,
        academicYearId,
      });
      if (res.ok) {
        onAuthenticated(res.user);
      } else {
        if (res.error === 'invalid_invite') setError(t.auth.invalidInvite);
        else if (res.error === 'expired_invite') setError(t.auth.expiredInvite);
        else setError(t.auth.usernameTaken);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col justify-center bg-[var(--color-background)] px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
            {(['ar', 'en', 'fr'] as LanguageCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-bold transition-colors ${
                  lang === code
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {code === 'ar' ? 'العربية' : code === 'en' ? 'EN' : 'FR'}
              </button>
            ))}
          </div>
          <PWAInstallButton compact />
        </div>

        <div
          className="rounded-[28px] p-6 text-[var(--color-on-primary)] shadow-lg mb-5"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
          }}
        >
          <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-4">
            <BookOpenCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold">{t.auth.welcomeTitle}</h1>
          <p className="mt-1.5 text-sm opacity-90 leading-relaxed">{t.auth.welcomeSubtitle}</p>
        </div>

        <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[var(--color-background)] mb-5">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError('');
              }}
              className={`min-h-[44px] rounded-xl text-sm font-bold transition-colors ${
                tab === 'login'
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                  : 'text-[var(--color-text-muted)]'
              }`}
            >
              {t.auth.loginTab}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError('');
              }}
              className={`min-h-[44px] rounded-xl text-sm font-bold transition-colors ${
                tab === 'register'
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                  : 'text-[var(--color-text-muted)]'
              }`}
            >
              {t.auth.registerTab}
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-3 text-xs font-semibold text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
                  {t.auth.username}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3.5" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full min-h-[48px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] ps-10 pe-4 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="admin"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
                  {t.auth.password}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-[48px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] ps-10 pe-4 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[48px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-sm hover:opacity-95 transition-opacity disabled:opacity-60"
              >
                {busy ? t.common.loading : t.auth.loginBtn}
              </button>

              <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
                <p className="text-xs text-[var(--color-text-muted)]">{t.auth.demoHint}</p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('admin');
                      setPassword('123456');
                    }}
                    className="min-h-[40px] rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold px-3 text-start"
                  >
                    {t.auth.quickFillAdmin}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('teacher1');
                      setPassword('123456');
                    }}
                    className="min-h-[40px] rounded-xl border border-[var(--color-border)] text-[var(--color-text)] text-xs font-semibold px-3 text-start"
                  >
                    {t.auth.quickFillTeacher}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                  {t.auth.inviteCode}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3.5" />
                  <input
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="EDU-2026"
                    className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] ps-10 pe-4 text-sm text-[var(--color-text)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                  {t.auth.displayName}
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 text-sm text-[var(--color-text)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                    {t.auth.username}
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm text-[var(--color-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                    {t.auth.specialty}
                  </label>
                  <input
                    type="text"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm text-[var(--color-text)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                  {t.auth.password}
                </label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 text-sm text-[var(--color-text)]"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[48px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold text-sm flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{t.auth.registerBtn}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
