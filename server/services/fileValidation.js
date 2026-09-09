import { fileTypeFromBuffer } from 'file-type';

// MIME prefixes allowed for general uploads (broadcasts, chats)
const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'application/pdf',
  'text/',
];

// Exact MIME types allowed on top of the prefixes above.
// Офисные форматы (.docx/.xlsx/.pptx, ODF) — это ZIP-контейнеры, у них ЕСТЬ
// магические байты, поэтому до fallback'а по расширению они не доходили и
// отбивались как «Тип файла ... не разрешён». Перечисляем их явно.
const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.oasis.opendocument.text',                                   // .odt
  'application/vnd.oasis.opendocument.spreadsheet',                            // .ods
  'application/vnd.oasis.opendocument.presentation',                           // .odp
]);

// Legacy Office (.doc/.xls/.ppt) детектится как application/x-cfb. Тот же
// контейнер у .msi и прочей исполняемой всячины, поэтому пускаем CFB только
// когда расширение реально офисное.
const CFB_EXTENSIONS = new Set(['.doc', '.xls', '.ppt']);

// Extensions allowed as fallback when magic bytes detection returns nothing
// (plain text, csv, etc. have no magic bytes)
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.csv', '.tsv', '.json', '.xml', '.html', '.md',
  '.pdf', '.rtf',
]);

/**
 * Validate uploaded file by checking magic bytes.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export async function validateUploadedFile(buffer, originalName) {
  const ext = (originalName || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0];

  // Check magic bytes
  const detected = await fileTypeFromBuffer(buffer);

  if (detected) {
    // Magic bytes detected — check if MIME is allowed
    const allowed =
      ALLOWED_MIME_PREFIXES.some(prefix => detected.mime.startsWith(prefix)) ||
      ALLOWED_MIME_EXACT.has(detected.mime) ||
      (detected.mime === 'application/x-cfb' && ext && CFB_EXTENSIONS.has(ext));
    if (!allowed) {
      return { ok: false, reason: `Тип файла ${detected.mime} не разрешён` };
    }
    return { ok: true, detectedMime: detected.mime };
  }

  // No magic bytes (text files, etc.) — check extension
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
