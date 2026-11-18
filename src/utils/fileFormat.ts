import type { FileRecord, FileTypeCategory, LanguageCode } from '@/src/types/models';
import { detectFileCategory } from '@/src/services/FilesService';

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export function formatShortDate(iso: string | null | undefined, lang: LanguageCode): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  try {
    const locale = lang === 'ar' ? 'ar-DZ' : lang === 'fr' ? 'fr-FR' : 'en-GB';
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return iso.slice(0, 10);
  }
}

export function getFileCategoryStyle(category: FileTypeCategory): {
  bg: string;
  fg: string;
  badgeLabel: string;
} {
  switch (category) {
    case 'pdf':
      return { bg: '#dc262618', fg: '#dc2626', badgeLabel: 'PDF' };
    case 'word':
      return { bg: '#2563eb18', fg: '#2563eb', badgeLabel: 'DOCX' };
    case 'excel':
      return { bg: '#05966918', fg: '#059669', badgeLabel: 'XLSX' };
    case 'ppt':
      return { bg: '#d9770618', fg: '#d97706', badgeLabel: 'PPTX' };
    case 'image':
      return { bg: '#9333ea18', fg: '#9333ea', badgeLabel: 'IMG' };
    case 'audio':
      return { bg: '#db277718', fg: '#db2777', badgeLabel: 'AUDIO' };
    case 'video':
      return { bg: '#4f46e518', fg: '#4f46e5', badgeLabel: 'VIDEO' };
    default:
      return { bg: '#47556918', fg: '#475569', badgeLabel: 'FILE' };
  }
}

export function getExtensionBadge(
  file: Pick<FileRecord, 'extension' | 'mimeType' | 'fileCategory' | 'externalUrl'>
): string {
  if (file.externalUrl) return 'URL';
  const ext = (file.extension || '').trim().toUpperCase();
  if (ext && ext.length <= 5) return ext;
  const cat = file.fileCategory || detectFileCategory(file.mimeType, file.extension, file.externalUrl);
  return getFileCategoryStyle(cat).badgeLabel;
}
