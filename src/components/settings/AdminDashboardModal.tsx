import React, { useEffect, useState } from 'react';
import { KeyRound, Shield, Trash2, Users, X } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type {
  InviteCodeRecord,
  SectionNode,
  UserRecord,
  UserRole,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';

interface AdminDashboardModalProps {
  open: boolean;
  ctx: ServiceContext;
  currentUser: UserRecord;
  mainSections: SectionNode[];
  onClose: () => void;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  open,
  ctx,
  currentUser,
  mainSections,
  onClose,
}) => {
  const { t, pickLocalized } = useI18n();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [invites, setInvites] = useState<InviteCodeRecord[]>([]);
  const [daysValid, setDaysValid] = useState(30);
  const [maxUses, setMaxUses] = useState(10);
  const [inviteRole, setInviteRole] = useState<Exclude<UserRole, 'banned'>>('teacher_write');
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPass, setNewPass] = useState('');
  const [permUser, setPermUser] = useState<UserRecord | null>(null);

  const loadData = async () => {
    const [u, inv] = await Promise.all([
      services.auth.listUsers(),
      services.auth.listInviteCodes(ctx.schoolId),
    ]);
    setUsers(u);
    setInvites(inv);
  };

  useEffect(() => {
    if (open) loadData();
  }, [open, ctx.schoolId]);

  if (!open) return null;

  const onlineCount = users.filter((u) => u.isOnlineSimulated).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-3xl max-h-[90dvh] flex flex-col rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--color-primary)]" />
            <h3 className="text-base font-extrabold">{t.settings.adminDashboard}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[var(--color-background)] p-4">
              <div className="text-xs text-[var(--color-text-muted)]">
                {t.settings.registeredUsers}
              </div>
              <div className="text-2xl font-extrabold tabular-nums mt-1">{users.length}</div>
            </div>
            <div className="rounded-2xl bg-[var(--color-background)] p-4">
              <div className="text-xs text-[var(--color-text-muted)]">{t.settings.onlineUsers}</div>
              <div className="text-2xl font-extrabold tabular-nums mt-1 text-emerald-600">
                {onlineCount}
              </div>
            </div>
          </div>

          {/* Invite Code Generator */}
          <div className="rounded-2xl border border-[var(--color-border)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <KeyRound className="w-4 h-4 text-[var(--color-primary)]" />
              <span>{t.settings.generateInvite}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Exclude<UserRole, 'banned'>)}
                className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-semibold"
              >
                <option value="teacher_write">{t.settings.roleWrite}</option>
                <option value="teacher_read">{t.settings.roleRead}</option>
                <option value="primary_admin">{t.settings.roleAdmin}</option>
              </select>
              <input
                type="number"
                min={1}
                value={daysValid}
                onChange={(e) => setDaysValid(Number(e.target.value))}
                placeholder={t.settings.daysValid}
                className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs tabular-nums"
              />
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
                placeholder={t.settings.maxUses}
                className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs tabular-nums"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                await services.auth.createInviteCode(ctx, {
                  role: inviteRole,
                  daysValid,
                  maxUses,
                });
                await loadData();
              }}
              className="min-h-[40px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
            >
              {t.settings.generateInvite}
            </button>

            <div className="divide-y divide-[var(--color-border)]">
              {invites.map((inv) => (
                <div key={inv.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-mono-tabular font-bold text-[var(--color-primary)]">
                      {inv.code}
                    </span>
                    <span className="text-[var(--color-text-muted)] ms-2 tabular-nums">
                      ({inv.usedCount}/{inv.maxUses}) · {inv.expiresAt.slice(0, 10)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await services.auth.revokeInviteCode(inv.id);
                      await loadData();
                    }}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* User Management */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <Users className="w-4 h-4 text-[var(--color-primary)]" />
              <span>{t.settings.registeredUsers}</span>
            </div>

            {users.map((u) => (
              <div
                key={u.id}
                className="rounded-2xl border border-[var(--color-border)] p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold">
                      {u.displayName}{' '}
                      <span className="text-xs font-normal text-[var(--color-text-muted)]">
                        (@{u.username})
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {u.isOnlineSimulated ? 'Online (local)' : 'Offline'} · {u.subjectSpecialty}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      disabled={u.id === currentUser.id}
                      value={u.role}
                      onChange={async (e) => {
                        await services.auth.setUserRole(u.id, e.target.value as UserRole);
                        await loadData();
                      }}
                      className="min-h-[36px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-semibold"
                    >
                      <option value="primary_admin">{t.settings.roleAdmin}</option>
                      <option value="teacher_write">{t.settings.roleWrite}</option>
                      <option value="teacher_read">{t.settings.roleRead}</option>
                      <option value="banned">{t.settings.roleBanned}</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setPermUser(permUser?.id === u.id ? null : u)}
                      className="min-h-[36px] px-2.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold"
                    >
                      {t.settings.permView}/{t.settings.permWrite}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setResetUserId(u.id);
                        setNewPass('');
                      }}
                      className="min-h-[36px] px-2.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold"
                    >
                      {t.settings.resetPassword}
                    </button>

                    {u.id !== currentUser.id && (
                      <button
                        type="button"
                        onClick={async () => {
                          await services.auth.setUserRole(
                            u.id,
                            u.role === 'banned' ? 'teacher_write' : 'banned'
                          );
                          await loadData();
                        }}
                        className={`min-h-[36px] px-2.5 rounded-xl text-xs font-bold text-white ${
                          u.role === 'banned' ? 'bg-emerald-600' : 'bg-red-600'
                        }`}
                      >
                        {u.role === 'banned' ? t.settings.unbanUser : t.settings.banUser}
                      </button>
                    )}
                  </div>
                </div>

                {permUser?.id === u.id && (
                  <div className="pt-2 border-t border-[var(--color-border)] max-h-48 overflow-auto space-y-1.5">
                    {mainSections.map((sec) => {
                      const slug = sec.id.includes('__') ? sec.id.split('__')[1] : sec.id;
                      const effective = services.auth.getEffectivePermission(u, sec.id);
                      return (
                        <div
                          key={sec.id}
                          className="flex items-center justify-between gap-2 text-xs py-1"
                        >
                          <span className="truncate font-semibold">{pickLocalized(sec.names)}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            {(['view', 'write', 'comment'] as const).map((key) => (
                              <label key={key} className="inline-flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={effective[key]}
                                  onChange={async (e) => {
                                    await services.auth.setSectionPermission(u.id, slug, {
                                      ...effective,
                                      [key]: e.target.checked,
                                    });
                                    await loadData();
                                  }}
                                  className="accent-[var(--color-primary)]"
                                />
                                <span>
                                  {key === 'view'
                                    ? t.settings.permView
                                    : key === 'write'
                                    ? t.settings.permWrite
                                    : t.settings.permComment}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {resetUserId === u.id && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (newPass.length < 4) return;
                      await services.auth.changePassword(u.id, newPass);
                      setResetUserId(null);
                      setNewPass('');
                    }}
                    className="flex gap-2 pt-2"
                  >
                    <input
                      type="password"
                      required
                      minLength={4}
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      placeholder={t.auth.password}
                      className="flex-1 min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
                    />
                    <button
                      type="submit"
                      className="min-h-[38px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
                    >
                      {t.common.save}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
