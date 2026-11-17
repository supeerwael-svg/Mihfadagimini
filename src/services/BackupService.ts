import JSZip from 'jszip';
import type { FileRecord } from '@/src/types/models';
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

    // Separate Blob data from file metadata so JSON remains clean and fast
    const serializableFiles = snapshot.tables.files.map((fileRec) => {
      const { blob, ...rest } = fileRec;
      if (blob && blobsFolder) {
        blobsFolder.file(`${fileRec.id}.bin`, blob);
      }
      return { ...rest, hasBlob: Boolean(blob) };
    });

    const manifest = {
      version: 1,
      exportedAt: new Date().toISOString(),
      meta: snapshot.meta,
      tables: {
        ...snapshot.tables,
        files: serializableFiles,
      },
    };

    zip.file('portfolio_data.json', JSON.stringify(manifest, null, 2));
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    await this.adapter.setMeta(LAST_BACKUP_KEY, new Date().toISOString());
    return zipBlob;
  }

  async importBackupFile(file: File): Promise<{ recordsCount: number; filesCount: number }> {
    let manifest: {
      meta: Array<{ key: string; value: string; updatedAt: string }>;
      tables: Partial<{ [K in TableName]: TableTypeMap[K][] }> & {
        files?: Array<Omit<FileRecord, 'blob'> & { hasBlob?: boolean }>;
      };
    };

    const filesWithBlobs: FileRecord[] = [];

    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const jsonEntry = zip.file('portfolio_data.json');
      if (!jsonEntry) throw new Error('Invalid ZIP backup: missing portfolio_data.json');
      const jsonText = await jsonEntry.async('string');
      manifest = JSON.parse(jsonText);

      const rawFiles = manifest.tables.files ?? [];
      for (const f of rawFiles) {
        let blob: Blob | undefined;
        const binEntry = zip.file(`files/${f.id}.bin`);
        if (binEntry) {
          const arrBuf = await binEntry.async('arraybuffer');
          blob = new Blob([arrBuf], { type: f.mimeType || 'application/octet-stream' });
        }
        const { hasBlob: _ignored, ...cleanMeta } = f;
        filesWithBlobs.push({ ...cleanMeta, blob });
      }
    } else {
      const text = await file.text();
      manifest = JSON.parse(text);
      for (const f of manifest.tables.files ?? []) {
        filesWithBlobs.push({ ...f });
      }
    }

    await this.adapter.clearAll();
    await this.adapter.importRawSnapshot({
      meta: manifest.meta ?? [],
      tables: {
        ...manifest.tables,
        files: filesWithBlobs,
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
