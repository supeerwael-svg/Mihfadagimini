import React, { useEffect, useState } from 'react';
import { Edit3, Merge, Plus, Tag, Trash2, X } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import { TAG_COLOR_PALETTE, type TagWithStats } from '@/src/services/LibraryService';
import type { ServiceContext } from '@/src/types/services';

interface TagManagerModalProps {
  open: boolean;
  ctx: ServiceContext;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

export const TagManagerModal: React.FC<TagManagerModalProps> = ({
  open,
  ctx,
  onClose,
  onChanged,
}) => {
  const { t } = useI18n();
  const [tags, setTags] = useState<TagWithStats[]>([]);
  const [newName, setNewName] = useState('');
  const [parentName, setParentName] = useState('');
  const [color, setColor] = useState(TAG_COLOR_PALETTE[0]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');

  const loadTags = async () => {
    const list = await services.library.listTags(ctx.academicYearId);
    setTags(list);
  };

  useEffect(() => {
    if (open) loadTags();
  }, [open, ctx.academicYearId]);

  if (!open) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await services.library.upsertTag(ctx, {
      name: newName,
      parentName: parentName.trim() || null,
      color,
    });
    setNewName('');
    setParentName('');
    await loadTags();
    await onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-extrabold">
            <Tag className="w-5 h-5 text-[var(--color-primary)]" />
            <span>{t.library.manageTags}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <form
            onSubmit={handleCreate}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-2.5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t.common.addTag}
                className="min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-bold"
              />
              <input
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder={t.library.parentTagOptional}
                className="min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {TAG_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 ${
                      color === c ? 'border-[var(--color-text)] scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                type="submit"
                className="min-h-[40px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>{t.common.add}</span>
              </button>
            </div>
          </form>

          <div className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
            {tags.map((tg) => (
              <div key={tg.name} className="p-3 space-y-2 bg-[var(--color-surface)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tg.color }}
                    />
                    <span className="text-xs font-bold text-[var(--color-text)] truncate">
                      #{tg.name}
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--color-text-muted)] tabular-nums">
                      ({tg.count})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setRenaming(tg.name);
                        setRenameVal(tg.name);
                        setMerging(null);
                      }}
                      title={t.library.renameTag}
                      className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)]"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {tags.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setMerging(tg.name);
                          setMergeTarget(tags.find((o) => o.name !== tg.name)?.name ?? '');
                          setRenaming(null);
                        }}
                        title={t.library.mergeTags}
                        className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)]"
                      >
                        <Merge className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await services.library.deleteTag(ctx.academicYearId, tg.name);
                        await loadTags();
                        await onChanged();
                      }}
                      className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {renaming === tg.name && (
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      className="flex-1 min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await services.library.renameTag(ctx.academicYearId, tg.name, renameVal);
                        setRenaming(null);
                        await loadTags();
                        await onChanged();
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
                    >
                      {t.common.save}
                    </button>
                  </div>
                )}

                {merging === tg.name && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] font-bold text-[var(--color-text-muted)] shrink-0">
                      {t.library.mergeInto}:
                    </span>
                    <select
                      value={mergeTarget}
                      onChange={(e) => setMergeTarget(e.target.value)}
                      className="flex-1 min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
                    >
                      {tags
                        .filter((o) => o.name !== tg.name)
                        .map((o) => (
                          <option key={o.name} value={o.name}>
                            #{o.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={async () => {
                        await services.library.mergeTags(ctx.academicYearId, tg.name, mergeTarget);
                        setMerging(null);
                        await loadTags();
                        await onChanged();
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
                    >
                      {t.common.confirm}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
