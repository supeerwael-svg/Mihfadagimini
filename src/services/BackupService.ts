import JSZip from 'jszip';
import type { FileRecord, FileVersionRecord } from '@/src/types/models';
import type { IDataAdapter, TableName, TableTypeMap } from '@/src/types/services';

const LAST_BACKUP_KEY = 'last_backup_at';

export class BackupService {
  constructor(private adapter: IDataAdapter) {}

  async getLastBackupDate(): Promise<string | null> {
    return this.adapter.getMeta(LAST_BACKUP_KEY);
  }

  async isBackupReminderDue(daysThreshold = 7): Promise<boolean> {
    const last = await this.getLastBackupDate();
    if (!last) return true;
    const diffDays = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= daysThreshold;
  }

  async exportZipBackup(): Promise<Blob> {
    const snapshot = await this.adapter.exportRawSnapshot();
    const zip = new JSZip();
    const blobsFolder = zip.folder('files');
    const thumbsFolder = zip.folder('thumbnails');
    const versionsFolder = zip.folder('versions');

    // Separate Blob data from file metadata so JSON remains clean and fast
    const serializableFiles = snapshot.tables.files.map((fileRec) => {
      const { blob, thumbnailBlob, ...rest } = fileRec;
      if (blob && blobsFolder) {
        blobsFolder.file(`${fileRec.id}.bin`, blob);
      }
      if (thumbnailBlob && thumbsFolder) {
        thumbsFolder.file(`${fileRec.id}.thumb`, thumbnailBlob);
      }
      return {
        ...rest,
        hasBlob: Boolean(blob),
        hasThumbnail: Boolean(thumbnailBlob),
      };
    });

    const serializableVersions = (snapshot.tables.fileVersions ?? []).map((ver) => {
      const { blob, ...rest } = ver;
      if (blob && versionsFolder) {
        versionsFolder.file(`${ver.id}.bin`, blob);
      }
      return {
        ...rest,
        hasBlob: Boolean(blob),
      };
    });

    const manifest = {
      version: 2,
      exportedAt: new Date().toISOString(),
      meta: snapshot.meta,
      tables: {
        ...snapshot.tables,
        files: serializableFiles,
        fileVersions: serializableVersions,
      },
    };

    zip.file('portfolio_data.json', JSON.stringify(manifest, null, 2));
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    await this.adapter.setMeta(LAST_BACKUP_KEY, new Date().toISOString());
    return zipBlob;
  }

  async exportYearZip(academicYearId: string, yearLabel: string): Promise<Blob> {
    const zip = new JSZip();
    const filesFolder = zip.folder('files');
    const [files, sections, collections, tags] = await Promise.all([
      this.adapter.queryByYear('files', academicYearId, true),
      this.adapter.queryByYear('sections', academicYearId, true),
      this.adapter.queryByYear('collections', academicYearId, true),
      this.adapter.queryByYear('tags', academicYearId, true),
    ]);

    const serializableFiles = files.map((f) => {
      const { blob, thumbnailBlob: _thumb, ...rest } = f;
      if (blob && filesFolder) {
        const safeName = `${f.id.slice(0, 8)}_${f.name.replace(/[/\\:*?"<>|]/g, '_')}`;
        filesFolder.file(safeName, blob);
      }
      return { ...rest, hasBlob: Boolean(blob) };
    });

    zip.file(
      'year_archive_manifest.json',
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          academicYearId,
          yearLabel,
          sectionsCount: sections.length,
          filesCount: files.length,
          collections,
          tags,
          files: serializableFiles,
        },
        null,
        2
      )
    );
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  async importBackupFile(file: File): Promise<{ recordsCount: number; filesCount: number }> {
    let manifest: {
      meta: Array<{ key: string; value: string; updatedAt: string }>;
      tables: Partial<{ [K in TableName]: TableTypeMap[K][] }> & {
        files?: Array<
          Omit<FileRecord, 'blob' | 'thumbnailBlob'> & {
            hasBlob?: boolean;
            hasThumbnail?: boolean;
          }
        >;
        fileVersions?: Array<Omit<FileVersionRecord, 'blob'> & { hasBlob?: boolean }>;
      };
    };

    const filesWithBlobs: FileRecord[] = [];
    const versionsWithBlobs: FileVersionRecord[] = [];

    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const jsonEntry = zip.file('portfolio_data.json');
      if (!jsonEntry) throw new Error('Invalid ZIP backup: missing portfolio_data.json');
      const jsonText = await jsonEntry.async('string');
      manifest = JSON.parse(jsonText);

      const rawFiles = manifest.tables.files ?? [];
      for (const f of rawFiles) {
        let blob: Blob | undefined;
        let thumbnailBlob: Blob | null = null;
        const binEntry = zip.file(`files/${f.id}.bin`);
        if (binEntry) {
          const arrBuf = await binEntry.async('arraybuffer');
          blob = new Blob([arrBuf], { type: f.mimeType || 'application/octet-stream' });
        }
        const thumbEntry = zip.file(`thumbnails/${f.id}.thumb`);
        if (thumbEntry) {
          const thumbBuf = await thumbEntry.async('arraybuffer');
          thumbnailBlob = new Blob([thumbBuf], { type: 'image/jpeg' });
        }
        const { hasBlob: _ignoredBlob, hasThumbnail: _ignoredThumb, ...cleanMeta } = f;
        filesWithBlobs.push({ ...cleanMeta, blob, thumbnailBlob });
      }

      const rawVersions = manifest.tables.fileVersions ?? [];
      for (const v of rawVersions) {
        let blob: Blob | undefined;
        const binEntry = zip.file(`versions/${v.id}.bin`);
        if (binEntry) {
          const arrBuf = await binEntry.async('arraybuffer');
          blob = new Blob([arrBuf], { type: v.mimeType || 'application/octet-stream' });
        }
        const { hasBlob: _ignored, ...cleanVer } = v;
        versionsWithBlobs.push({ ...cleanVer, blob });
      }
    } else {
      const text = await file.text();
      manifest = JSON.parse(text);
      for (const f of manifest.tables.files ?? []) {
        filesWithBlobs.push({ ...f });
      }
      for (const v of manifest.tables.fileVersions ?? []) {
        versionsWithBlobs.push({ ...v });
      }
    }

    await this.adapter.clearAll();
    await this.adapter.importRawSnapshot({
      meta: manifest.meta ?? [],
      tables: {
        ...manifest.tables,
        files: filesWithBlobs,
        fileVersions: versionsWithBlobs,
      },
    });
    await this.adapter.setMeta(LAST_BACKUP_KEY, new Date().toISOString());

    let recordsCount = 0;
    for (const k of Object.keys(manifest.tables ?? {}) as TableName[]) {
      recordsCount += manifest.tables[k]?.length ?? 0;
    }
    return { recordsCount, filesCount: filesWithBlobs.length };
  }
}
