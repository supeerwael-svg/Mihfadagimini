import React, { useEffect, useState } from 'react';
import {
  MessageCircle,
  MessageSquare,
  Pin,
  Plus,
  Send,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type {
  ChatMessageRecord,
  ChatRoomRecord,
  ForumCommentRecord,
  ForumTopicRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { EmptyState } from '@/src/components/common/EmptyState';

interface ForumAndChatViewProps {
  ctx: ServiceContext;
  user: UserRecord;
  canComment: boolean;
  canWrite: boolean;
}

export const ForumAndChatView: React.FC<ForumAndChatViewProps> = ({
  ctx,
  user,
  canComment,
  canWrite,
}) => {
  const { t } = useI18n();
  const [subTab, setSubTab] = useState<'topics' | 'chat'>('topics');

  // Topics
  const [topics, setTopics] = useState<ForumTopicRecord[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<ForumTopicRecord | null>(null);
  const [comments, setComments] = useState<ForumCommentRecord[]>([]);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicBody, setTopicBody] = useState('');
  const [topicCat, setTopicCat] = useState('');
  const [commentText, setCommentText] = useState('');

  // Chat
  const [rooms, setRooms] = useState<ChatRoomRecord[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoomRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [msgText, setMsgText] = useState('');
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDesc, setRoomDesc] = useState('');
  const [allUsers, setAllUsers] = useState<UserRecord[]>([]);
  const [inviteUserId, setInviteUserId] = useState('');

  const loadTopics = async () => {
    const list = await services.forum.listTopics(ctx.academicYearId);
    setTopics(list);
  };

  const loadRooms = async () => {
    const [list, users] = await Promise.all([
      services.chat.listRooms(ctx.academicYearId),
      services.auth.listUsers(),
    ]);
    setRooms(list);
    setAllUsers(users);
    if (!selectedRoom && list.length > 0) setSelectedRoom(list[0]);
  };

  useEffect(() => {
    loadTopics();
    loadRooms();
  }, [ctx.academicYearId]);

  useEffect(() => {
    if (!selectedTopic) {
      setComments([]);
      return;
    }
    services.forum.listComments(selectedTopic.id).then(setComments);
  }, [selectedTopic]);

  useEffect(() => {
    if (!selectedRoom) {
      setMessages([]);
      return;
    }
    services.chat.listMessages(selectedRoom.id).then(setMessages);
  }, [selectedRoom]);

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicTitle.trim() || !topicBody.trim()) return;
    await services.forum.createTopic(ctx, {
      title: topicTitle,
      body: topicBody,
      authorName: user.displayName,
      category: topicCat || t.forum.topicsTab,
    });
    setTopicTitle('');
    setTopicBody('');
    setTopicCat('');
    setShowNewTopic(false);
    await loadTopics();
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopic || !commentText.trim() || !canComment) return;
    await services.forum.addComment(ctx, {
      topicId: selectedTopic.id,
      body: commentText,
      authorName: user.displayName,
    });
    setCommentText('');
    const list = await services.forum.listComments(selectedTopic.id);
    setComments(list);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    const room = await services.chat.createRoom(ctx, { name: roomName, description: roomDesc });
    setRoomName('');
    setRoomDesc('');
    setShowNewRoom(false);
    await loadRooms();
    setSelectedRoom(room);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom || !msgText.trim() || !canComment) return;
    await services.chat.sendMessage(ctx, {
      roomId: selectedRoom.id,
      senderName: user.displayName,
      text: msgText,
    });
    setMsgText('');
    const list = await services.chat.listMessages(selectedRoom.id);
    setMessages(list);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setSubTab('topics')}
          className={`min-h-[44px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            subTab === 'topics'
              ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>{t.forum.topicsTab}</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('chat')}
          className={`min-h-[44px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            subTab === 'chat'
              ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span>{t.forum.chatTab}</span>
        </button>
      </div>

      {subTab === 'topics' ? (
        selectedTopic ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedTopic(null)}
              className="min-h-[40px] px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold"
            >
              {t.common.back}
            </button>

            <article className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-2">
              <div className="text-xs text-[var(--color-text-muted)]">
                <span className="font-bold text-[var(--color-primary)]">{selectedTopic.category}</span>
                <span> · </span>
                <span>{selectedTopic.authorName}</span>
                <span> · </span>
                <span className="tabular-nums">{selectedTopic.createdAt.slice(0, 10)}</span>
              </div>
              <h3 className="text-base font-extrabold text-[var(--color-text)]">
                {selectedTopic.title}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap">
                {selectedTopic.body}
              </p>
            </article>

            <div className="space-y-2">
              <h4 className="text-xs font-extrabold text-[var(--color-text-muted)]">
                {t.forum.comments} ({comments.length})
              </h4>
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 flex items-start justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-[var(--color-text)]">
                      {c.authorName}{' '}
                      <span className="font-normal text-[var(--color-text-muted)] tabular-nums">
                        · {c.createdAt.slice(0, 16).replace('T', ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{c.body}</p>
                  </div>
                  {(user.role === 'primary_admin' || c.authorId === user.id) && (
                    <button
                      type="button"
                      onClick={async () => {
                        await services.forum.deleteComment(c.id);
                        setComments(await services.forum.listComments(selectedTopic.id));
                      }}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canComment ? (
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={t.forum.addComment}
                  className="flex-1 min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[46px] px-4 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 text-xs text-[var(--color-text-muted)]">
                {t.forum.noPermissionComment}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {canWrite && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewTopic((v) => !v)}
                  className="min-h-[42px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.forum.newTopic}</span>
                </button>
              </div>
            )}

            {showNewTopic && (
              <form
                onSubmit={handleCreateTopic}
                className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3"
              >
                <input
                  type="text"
                  required
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  placeholder={t.forum.topicTitle}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm"
                />
                <input
                  type="text"
                  value={topicCat}
                  onChange={(e) => setTopicCat(e.target.value)}
                  placeholder={t.forum.category}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-xs"
                />
                <textarea
                  rows={3}
                  required
                  value={topicBody}
                  onChange={(e) => setTopicBody(e.target.value)}
                  placeholder={t.forum.topicBody}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3.5 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewTopic(false)}
                    className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="min-h-[40px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
                  >
                    {t.common.save}
                  </button>
                </div>
              </form>
            )}

            {topics.length === 0 ? (
              <EmptyState title={t.forum.topicsTab} />
            ) : (
              topics.map((topic) => (
                <div
                  key={topic.id}
                  className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 flex items-start justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTopic(topic)}
                    className="flex-1 text-start min-w-0"
                  >
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <span className="font-bold text-[var(--color-primary)]">{topic.category}</span>
                      <span>·</span>
                      <span>{topic.authorName}</span>
                      {topic.isPinned && <Pin className="w-3.5 h-3.5 text-[var(--color-primary)]" />}
                    </div>
                    <h3 className="text-sm font-extrabold text-[var(--color-text)] mt-1">
                      {topic.title}
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">
                      {topic.body}
                    </p>
                  </button>

                  {user.role === 'primary_admin' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await services.forum.deleteTopic(topic.id);
                        await loadTopics();
                      }}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoom(r)}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold ${
                    selectedRoom?.id === r.id
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => setShowNewRoom((v) => !v)}
                className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.forum.newRoom}</span>
              </button>
            )}
          </div>

          {showNewRoom && (
            <form
              onSubmit={handleCreateRoom}
              className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-2.5"
            >
              <input
                type="text"
                required
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder={t.forum.roomName}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
              />
              <input
                type="text"
                value={roomDesc}
                onChange={(e) => setRoomDesc(e.target.value)}
                placeholder={t.forum.roomDesc}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewRoom(false)}
                  className="min-h-[38px] px-3 rounded-xl text-xs font-bold"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="min-h-[38px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
                >
                  {t.common.add}
                </button>
              </div>
            </form>
          )}

          {selectedRoom && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--color-border)]">
                <div>
                  <h3 className="text-sm font-extrabold">{selectedRoom.name}</h3>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {selectedRoom.description}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      className="min-h-[36px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
                    >
                      <option value="">{t.forum.inviteMember}</option>
                      {allUsers
                        .filter((u) => !selectedRoom.memberIds.includes(u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName}
                          </option>
                        ))}
                    </select>
                    {inviteUserId && (
                      <button
                        type="button"
                        onClick={async () => {
                          await services.chat.inviteMemberToRoom(selectedRoom.id, inviteUserId);
                          setInviteUserId('');
                          await loadRooms();
                        }}
                        className="min-h-[36px] px-2.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-72 overflow-auto">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-2xl p-3 text-xs ${
                      m.senderId === user.id
                        ? 'bg-[var(--color-primary-light)] text-[var(--color-text)] ms-6'
                        : 'bg-[var(--color-background)] text-[var(--color-text)] me-6'
                    }`}
                  >
                    <div className="font-bold text-[11px] text-[var(--color-primary)]">
                      {m.senderName}
                    </div>
                    <div className="mt-0.5 text-sm">{m.text}</div>
                  </div>
                ))}
              </div>

              {canComment ? (
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder={t.forum.sendMessage}
                    className="flex-1 min-h-[44px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t.forum.noPermissionComment}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
