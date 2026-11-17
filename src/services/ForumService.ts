import type { ForumCommentRecord, ForumTopicRecord } from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export class ForumService {
  constructor(private adapter: IDataAdapter) {}

  async listTopics(academicYearId: string): Promise<ForumTopicRecord[]> {
    const all = await this.adapter.queryByYear('forumTopics', academicYearId);
    return all.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  async createTopic(
    ctx: ServiceContext,
    params: {
      title: string;
      body: string;
      authorName: string;
      category: string;
      attachmentFileIds?: string[];
      isPinned?: boolean;
    }
  ): Promise<ForumTopicRecord> {
    const now = new Date().toISOString();
    const record: ForumTopicRecord = {
      id: generateId(),
      title: params.title.trim(),
      body: params.body.trim(),
      authorId: ctx.ownerId,
      authorName: params.authorName,
      category: params.category.trim(),
      attachmentFileIds: params.attachmentFileIds ?? [],
      isPinned: params.isPinned ?? false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('forumTopics', record);
    return record;
  }

  async deleteTopic(topicId: string): Promise<void> {
    await this.adapter.softDelete('forumTopics', topicId);
  }

  async togglePinTopic(topicId: string): Promise<void> {
    const topic = await this.adapter.getById('forumTopics', topicId);
    if (!topic) return;
    await this.adapter.put('forumTopics', {
      ...topic,
      isPinned: !topic.isPinned,
      updatedAt: new Date().toISOString(),
    });
  }

  async listComments(topicId: string): Promise<ForumCommentRecord[]> {
    const all = await this.adapter.getAll('forumComments');
    return all
      .filter((c) => c.topicId === topicId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addComment(
    ctx: ServiceContext,
    params: {
      topicId: string;
      body: string;
      authorName: string;
      attachmentFileIds?: string[];
    }
  ): Promise<ForumCommentRecord> {
    const now = new Date().toISOString();
    const record: ForumCommentRecord = {
      id: generateId(),
      topicId: params.topicId,
      body: params.body.trim(),
      authorId: ctx.ownerId,
      authorName: params.authorName,
      attachmentFileIds: params.attachmentFileIds ?? [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('forumComments', record);
    return record;
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.adapter.softDelete('forumComments', commentId);
  }
}
