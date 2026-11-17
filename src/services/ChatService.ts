import type { ChatMessageRecord, ChatRoomRecord } from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export class ChatService {
  constructor(private adapter: IDataAdapter) {}

  async listRooms(academicYearId: string): Promise<ChatRoomRecord[]> {
    const all = await this.adapter.queryByYear('chatRooms', academicYearId);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createRoom(
    ctx: ServiceContext,
    params: { name: string; description: string; memberIds?: string[] }
  ): Promise<ChatRoomRecord> {
    const now = new Date().toISOString();
    const room: ChatRoomRecord = {
      id: generateId(),
      name: params.name.trim(),
      description: params.description.trim(),
      memberIds: Array.from(new Set([ctx.ownerId, ...(params.memberIds ?? [])])),
      invitedCodes: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('chatRooms', room);
    return room;
  }

  async inviteMemberToRoom(roomId: string, userIdOrCode: string): Promise<void> {
    const room = await this.adapter.getById('chatRooms', roomId);
    if (!room) return;
    const isUuid = userIdOrCode.includes('-');
    await this.adapter.put('chatRooms', {
      ...room,
      memberIds: isUuid ? Array.from(new Set([...room.memberIds, userIdOrCode])) : room.memberIds,
      invitedCodes: !isUuid ? Array.from(new Set([...room.invitedCodes, userIdOrCode])) : room.invitedCodes,
      updatedAt: new Date().toISOString(),
    });
  }

  async listMessages(roomId: string): Promise<ChatMessageRecord[]> {
    const all = await this.adapter.getAll('chatMessages');
    return all
      .filter((m) => m.roomId === roomId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async sendMessage(
    ctx: ServiceContext,
    params: {
      roomId: string;
      senderName: string;
      text: string;
      attachmentFileId?: string | null;
    }
  ): Promise<ChatMessageRecord> {
    const now = new Date().toISOString();
    const msg: ChatMessageRecord = {
      id: generateId(),
      roomId: params.roomId,
      senderId: ctx.ownerId,
      senderName: params.senderName,
      text: params.text.trim(),
      attachmentFileId: params.attachmentFileId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('chatMessages', msg);
    return msg;
  }
}
