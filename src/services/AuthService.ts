import type {
  InviteCodeRecord,
  SectionPermission,
  UserRecord,
  UserRole,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import {
  generateId,
  generateSaltHex,
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
} from './crypto';

const SESSION_META_KEY = 'active_session_user_id';

export class AuthService {
  constructor(private adapter: IDataAdapter) {}

  async getCurrentUser(): Promise<UserRecord | null> {
    const userId = await this.adapter.getMeta(SESSION_META_KEY);
    if (!userId) return null;
    const user = await this.adapter.getById('users', userId);
    if (!user || user.role === 'banned') return null;
    return user;
  }

  async login(
    username: string,
    password: string
  ): Promise<{ ok: true; user: UserRecord } | { ok: false; error: 'invalid_credentials' | 'banned' }> {
    const users = await this.adapter.getAll('users');
    const cleanName = username.trim().toLowerCase();
    const user = users.find(
      (u) =>
        u.username.toLowerCase() === cleanName ||
        u.displayName.toLowerCase() === cleanName
    );
    if (!user) return { ok: false, error: 'invalid_credentials' };
    if (user.role === 'banned') return { ok: false, error: 'banned' };

    const valid = await verifyPasswordPBKDF2(password, user.passwordSalt, user.passwordHash);
    if (!valid) return { ok: false, error: 'invalid_credentials' };

    const now = new Date().toISOString();
    const updated: UserRecord = {
      ...user,
      isOnlineSimulated: true,
      lastSeenAt: now,
      updatedAt: now,
    };
    await this.adapter.put('users', updated);
    await this.adapter.setMeta(SESSION_META_KEY, updated.id);
    return { ok: true, user: updated };
  }

  async logout(): Promise<void> {
    const user = await this.getCurrentUser();
    if (user) {
      await this.adapter.put('users', {
        ...user,
        isOnlineSimulated: false,
        lastSeenAt: new Date().toISOString(),
      });
    }
    await this.adapter.setMeta(SESSION_META_KEY, '');
  }

  async registerWithInviteCode(params: {
    username: string;
    displayName: string;
    subjectSpecialty: string;
    password: string;
    inviteCode: string;
    academicYearId: string;
  }): Promise<
    | { ok: true; user: UserRecord }
    | { ok: false; error: 'invalid_invite' | 'expired_invite' | 'username_taken' }
  > {
    const users = await this.adapter.getAll('users');
    const cleanUsername = params.username.trim().toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return { ok: false, error: 'username_taken' };
    }

    const codes = await this.adapter.getAll('inviteCodes');
    const codeRecord = codes.find(
      (c) => c.code.trim().toUpperCase() === params.inviteCode.trim().toUpperCase()
    );
    if (!codeRecord) return { ok: false, error: 'invalid_invite' };
    if (
      new Date(codeRecord.expiresAt).getTime() < Date.now() ||
      codeRecord.usedCount >= codeRecord.maxUses
    ) {
      return { ok: false, error: 'expired_invite' };
    }

    const salt = generateSaltHex();
    const hash = await hashPasswordPBKDF2(params.password, salt);
    const now = new Date().toISOString();
    const newUser: UserRecord = {
      id: generateId(),
      username: cleanUsername,
      displayName: params.displayName.trim(),
      subjectSpecialty: params.subjectSpecialty.trim(),
      passwordHash: hash,
      passwordSalt: salt,
      role: codeRecord.role,
      sectionPermissions: {},
      assignedClasses: [],
      isOnlineSimulated: true,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: 'system',
      schoolId: codeRecord.schoolId,
      academicYearId: params.academicYearId,
    };

    await this.adapter.put('users', newUser);
    await this.adapter.put('inviteCodes', {
      ...codeRecord,
      usedCount: codeRecord.usedCount + 1,
      updatedAt: now,
    });
    await this.adapter.setMeta(SESSION_META_KEY, newUser.id);
    return { ok: true, user: newUser };
  }

  async listUsers(): Promise<UserRecord[]> {
    return this.adapter.getAll('users');
  }

  async updateProfile(
    userId: string,
    patch: Partial<Pick<UserRecord, 'displayName' | 'subjectSpecialty' | 'assignedClasses'>>
  ): Promise<UserRecord | null> {
    const user = await this.adapter.getById('users', userId);
    if (!user) return null;
    const updated: UserRecord = {
      ...user,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.adapter.put('users', updated);
    return updated;
  }

  async changePassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.adapter.getById('users', userId);
    if (!user) return;
    const salt = generateSaltHex();
    const hash = await hashPasswordPBKDF2(newPassword, salt);
    await this.adapter.put('users', {
      ...user,
      passwordSalt: salt,
      passwordHash: hash,
      updatedAt: new Date().toISOString(),
    });
  }

  async setUserRole(userId: string, role: UserRole): Promise<void> {
    const user = await this.adapter.getById('users', userId);
    if (!user) return;
    await this.adapter.put('users', {
      ...user,
      role,
      isOnlineSimulated: role === 'banned' ? false : user.isOnlineSimulated,
      updatedAt: new Date().toISOString(),
    });
  }

  async setSectionPermission(
    userId: string,
    sectionKey: string,
    permission: SectionPermission
  ): Promise<void> {
    const user = await this.adapter.getById('users', userId);
    if (!user) return;
    await this.adapter.put('users', {
      ...user,
      sectionPermissions: {
        ...user.sectionPermissions,
        [sectionKey]: permission,
      },
      updatedAt: new Date().toISOString(),
    });
  }

  async toggleSimulatedOnline(userId: string): Promise<void> {
    const user = await this.adapter.getById('users', userId);
    if (!user) return;
    await this.adapter.put('users', {
      ...user,
      isOnlineSimulated: !user.isOnlineSimulated,
      lastSeenAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async listInviteCodes(schoolId: string): Promise<InviteCodeRecord[]> {
    const all = await this.adapter.getAll('inviteCodes');
    return all
      .filter((c) => c.schoolId === schoolId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createInviteCode(
    ctx: ServiceContext,
    params: { role: Exclude<UserRole, 'banned'>; daysValid: number; maxUses: number }
  ): Promise<InviteCodeRecord> {
    const now = new Date();
    const exp = new Date(now.getTime() + params.daysValid * 24 * 60 * 60 * 1000);
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    const record: InviteCodeRecord = {
      id: generateId(),
      code: `PORT-${randomPart}`,
      role: params.role,
      expiresAt: exp.toISOString(),
      maxUses: Math.max(1, params.maxUses),
      usedCount: 0,
      createdByUserId: ctx.ownerId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('inviteCodes', record);
    return record;
  }

  async revokeInviteCode(id: string): Promise<void> {
    await this.adapter.softDelete('inviteCodes', id);
  }

  /**
   * Resolves effective permissions for a user on a given section ID/slug.
   */
  getEffectivePermission(user: UserRecord, sectionId: string): SectionPermission {
    if (user.role === 'banned') {
      return { view: false, write: false, comment: false };
    }
    if (user.role === 'primary_admin') {
      return { view: true, write: true, comment: true };
    }
    // Check explicit per-section override (by full id or slug suffix e.g. sec_01)
    const slug = sectionId.includes('__') ? sectionId.split('__')[1] : sectionId;
    const override = user.sectionPermissions[sectionId] || user.sectionPermissions[slug];
    if (override) return override;

    if (user.role === 'teacher_write') {
      return { view: true, write: true, comment: true };
    }
    return { view: true, write: false, comment: true };
  }
}
