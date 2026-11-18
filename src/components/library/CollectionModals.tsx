import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, FolderHeart, Plus, Sliders, Trash2, X } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import { getFileTitle } from '@/src/services/FilesService';
import { TAG_COLOR_PALETTE } from '@/src/services/LibraryService';
import type {
  FileRecord,
  LibraryCollectionRecord,
  SmartCollectionConfig,
  SubjectRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { formatFileSize } from '@/src/utils/fileFormat';

interface AddToCollectionModalProps {
  open: boolean;
  ctx: ServiceContext;
  fileIds: string[];
  onClose: () => void;
  onChanged: () => void;
}

export const AddToCollectionModal: React.FC<AddToCollectionModalProps> = ({
  open,
  ctx,
  fileIds,
  onClose,
  onChanged,
}) => {
  const { t } = useI18n();
  const [collections, setCollections] = useState<LibraryCollectionRecord[]>([]);
  const [newName, setNewName] = useState('');

  const load = async () => {
    const list = await services.library.listCollections(ctx.academicYearId);
    setCollections(list);
  };

  useEffect(() => {
    if (open) load();
  }, [open, ctx.academicYearId]);

  if (!open || fileIds.length === 0) return null;

  const handleToggle = async (col: LibraryCollectionRecord) => {
    const allIncluded = fileIds.every((id) => col.fileIds.includes(id));
    if (allIncluded) {
      for (const id of fileIds) {
        await services.library.removeFileFromCollection(col.id, id);
      }
    } else {
      await services.library.addFilesToCollection(col.id, fileIds);
    }
    await load();
    onChanged();
  };

  const handleCreateQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await services.library.createCollection(ctx, {
      name: newName,
      fileIds,
    });
    setNewName('');
    await load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <FolderHeart className="w-5 h-5 text-[var(--color-primary)]" />
            <span>{t.library.addToCollection}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          <form onSubmit={handleCreateQuick} className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.library.newCollection}
              className="flex-1 min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-bold"
            />
            <button
              type="submit"
              className="min-h-[42px] px-3.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>{t.common.add}</span>
            </button>
          </form>

          <div className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
            {collections.map((col) => {
              const allIncluded = fileIds.every((id) => col.fileIds.includes(id));
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => handleToggle(col)}
                  className="w-full min-h-[48px] px-4 py-2.5 flex items-center justify-between gap-2 text-start hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: col.coverColor }}
                    />
                    <span className="text-xs font-bold truncate">{col.name}</span>
                  </div>
                  <span
                    className={`text-[11px] font-extrabold ${
                      allIncluded ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
                    }`}
                  >
                    {allIncluded ? '✓' : '+'} ({col.fileIds.length})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CollectionDetailModalProps {
  collection: LibraryCollectionRecord | null;
  allFiles: FileRecord[];
  onClose: () => void;
  onOpenFile: (f: FileRecord) => void;
  onChanged: () => void;
}

export const CollectionDetailModal: React.FC<CollectionDetailModalProps> = ({
  collection,
  allFiles,
  onClose,
  onOpenFile,
  onChanged,
}) => {
  const { t } = useI18n();
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!collection) return;
    setOrderedIds(collection.fileIds);
    setNotes(collection.notes || '');
    setName(collection.name);
  }, [collection]);

  if (!collection) return null;

  const fileMap = new Map(allFiles.map((f) => [f.id, f]));
  const items = orderedIds.map((id) => fileMap.get(id)).filter((f): f is FileRecord => Boolean(f));

  const moveItem = async (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    const [picked] = next.splice(idx, 1);
    next.splice(target, 0, picked);
    setOrderedIds(next);
    await services.library.reorderCollectionFiles(collection.id, next);
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: collection.coverColor }}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={async () => {
                if (name.trim() && name !== collection.name) {
                  await services.library.updateCollection(collection.id, { name: name.trim() });
                  onChanged();
                }
              }}
              className="flex-1 min-w-0 bg-transparent text-base font-extrabold text-[var(--color-text)]"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={async () => {
              if (notes !== collection.notes) {
                await services.library.updateCollection(collection.id, { notes });
                onChanged();
              }
            }}
            placeholder={t.library.collectionNotes}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-2.5 text-xs"
          />

          <div className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
            {items.map((f, idx) => (
              <div key={f.id} className="p-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenFile(f)}
                  className="flex-1 min-w-0 text-start"
                >
                  <div className="text-xs font-bold text-[var(--color-text)] truncate">
                    {getFileTitle(f)}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                    {formatFileSize(f.size)}
                  </div>
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveItem(idx, -1)}
                    className="min-h-[36px] min-w-[32px] flex items-center justify-center disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === items.length - 1}
                    onClick={() => moveItem(idx, 1)}
                    className="min-h-[36px] min-w-[32px] flex items-center justify-center disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await services.library.removeFileFromCollection(collection.id, f.id);
                      setOrderedIds((p) => p.filter((id) => id !== f.id));
                      onChanged();
                    }}
                    className="min-h-[36px] min-w-[32px] flex items-center justify-center text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface SmartRulesModalProps {
  open: boolean;
  academicYearId: string;
  subjects: SubjectRecord[];
  onClose: () => void;
  onSaved: () => void;
}

export const SmartRulesModal: React.FC<SmartRulesModalProps> = ({
  open,
  academicYearId,
  subjects,
  onClose,
  onSaved,
}) => {
  const { t, pickLocalized } = useI18n();
  const [configs, setConfigs] = useState<SmartCollectionConfig[]>([]);

  useEffect(() => {
    if (open) {
      services.library.getSmartCollectionConfigs(academicYearId).then(setConfigs);
    }
  }, [open, academicYearId]);

  if (!open) return null;

  const updateRule = (
    ruleId: SmartCollectionConfig['ruleId'],
    patch: Partial<SmartCollectionConfig>
  ) => {
    setConfigs((prev) => prev.map((c) => (c.ruleId === ruleId ? { ...c, ...patch } : c)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <Sliders className="w-4 h-4 text-[var(--color-primary)]" />
            <span>{t.library.editSmartRules}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          {configs.map((cfg) => {
            if (cfg.ruleId === 'this_week') {
              return (
                <div key={cfg.ruleId} className="flex items-center justify-between gap-2">
                  <span className="font-bold">{t.library.smartThisWeek} (days)</span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={cfg.recentDays ?? 7}
                    onChange={(e) =>
                      updateRule('this_week', { recentDays: Math.max(1, Number(e.target.value) || 7) })
                    }
                    className="w-20 min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-center font-bold tabular-nums"
                  />
                </div>
              );
            }
            if (cfg.ruleId === 'not_opened_6m') {
              return (
                <div key={cfg.ruleId} className="flex items-center justify-between gap-2">
                  <span className="font-bold">{t.library.smartInactive6m} (days)</span>
                  <input
                    type="number"
                    min={30}
                    max={720}
                    value={cfg.inactiveDays ?? 180}
                    onChange={(e) =>
                      updateRule('not_opened_6m', {
                        inactiveDays: Math.max(30, Number(e.target.value) || 180),
                      })
                    }
                    className="w-20 min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-center font-bold tabular-nums"
                  />
                </div>
              );
            }
            if (cfg.ruleId === 'large_files') {
              return (
                <div key={cfg.ruleId} className="flex items-center justify-between gap-2">
                  <span className="font-bold">{t.library.smartLargeFiles} (MB)</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={Math.round((cfg.minSizeBytes ?? 2 * 1024 * 1024) / (1024 * 1024))}
                    onChange={(e) =>
                      updateRule('large_files', {
                        minSizeBytes: Math.max(1, Number(e.target.value) || 2) * 1024 * 1024,
                      })
                    }
                    className="w-20 min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-center font-bold tabular-nums"
                  />
                </div>
              );
            }
            if (cfg.ruleId === 'favorites_by_subject') {
              return (
                <div key={cfg.ruleId} className="flex items-center justify-between gap-2">
                  <span className="font-bold">{t.library.smartFavSubject}</span>
                  <select
                    value={cfg.subjectId || ''}
                    onChange={(e) =>
                      updateRule('favorites_by_subject', { subjectId: e.target.value || undefined })
                    }
                    className="w-40 min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-bold"
                  >
                    <option value="">{t.common.all}</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {pickLocalized(s.names)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
            return null;
          })}
        </div>

        <button
          type="button"
          onClick={async () => {
            await services.library.saveSmartCollectionConfigs(academicYearId, configs);
            onSaved();
            onClose();
          }}
          className="w-full min-h-[44px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
        >
          {t.common.save}
        </button>
      </div>
    </div>
  );
};

interface CreateCollectionModalProps {
  open: boolean;
  ctx: ServiceContext;
  onClose: () => void;
  onCreated: () => void;
}

export const CreateCollectionModal: React.FC<CreateCollectionModalProps> = ({
  open,
  ctx,
  onClose,
  onCreated,
}) => {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState(TAG_COLOR_PALETTE[0]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await services.library.createCollection(ctx, { name, notes, coverColor: color });
          setName('');
          setNotes('');
          onCreated();
          onClose();
        }}
        className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3.5 shadow-2xl"
      >
        <h3 className="text-sm font-extrabold">{t.library.newCollection}</h3>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.library.collectionName}
          className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold"
        />
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.library.collectionNotes}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-2.5 text-xs"
        />
        <div className="flex items-center gap-2">
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
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
          >
            {t.common.cancel}
          </button>
          <button
            type="submit"
            className="min-h-[42px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
          >
            {t.common.add}
          </button>
        </div>
      </form>
    </div>
  );
};
