import { fileTypeFromBuffer } from 'file-type';

// MIME prefixes allowed for general uploads (broadcasts, chats)
const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'application/pdf',
  'text/',
];

// Extensions allowed as fallback when magic bytes detection returns nothing
// (plain text, csv, etc. have no magic bytes)
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.csv', '.tsv', '.json', '.xml', '.html', '.md',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.pdf', '.rtf',
]);

/**
 * Validate uploaded file by checking magic bytes.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export async function validateUploadedFile(buffer, originalName) {
  // Check magic bytes
  const detected = await fileTypeFromBuffer(buffer);

  if (detected) {
    // Magic bytes detected — check if MIME is allowed
    const allowed = ALLOWED_MIME_PREFIXES.some(prefix => detected.mime.startsWith(prefix));
    if (!allowed) {
      return { ok: false, reason: `Тип файла ${detected.mime} не разрешён` };
    }
    return { ok: true, detectedMime: detected.mime };
  }

  // No magic bytes (text files, etc.) — check extension
  const ext = (originalName || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (ext && ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: true, detectedMime: null };
  }

  // Unknown file with no magic bytes and unrecognized extension
  return { ok: false, reason: 'Не удалось определить тип файла' };
}

/**
 * Stricter validation for image-only uploads (KB photos, emojis).
 */
export async function validateImageFile(buffer, originalName) {
  const detected = await fileTypeFromBuffer(buffer);

  if (detected && detected.mime.startsWith('image/')) {
    return { ok: true, detectedMime: detected.mime };
  }

  // SVG has no magic bytes but is text-based
  const ext = (originalName || '').toLowerCase();
  if (ext.endsWith('.svg')) {
    return { ok: true, detectedMime: 'image/svg+xml' };
  }

  return { ok: false, reason: detected ? `Ожидалось изображение, получен ${detected.mime}` : 'Файл не является изображением' };
}
