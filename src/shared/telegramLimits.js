// Единый источник правды по лимитам Telegram для рассылок.
// Используется и фронтом (счётчик + блокировка кнопок), и бэком
// (жёсткий запрет ставить невалидную рассылку в очередь).
//
// Чистый ESM без зависимостей — импортируется и в браузере (Vite),
// и в Node (server). Никаких DOM/Node-специфичных API.

export const TG_LIMITS = {
  TEXT: 4096,        // обычное текстовое сообщение (sendMessage)
  CAPTION: 1024,     // подпись к медиа (sendPhoto/Video/Document)
  POLL_QUESTION: 300, // вопрос опроса/викторины
  POLL_OPTION: 100,   // вариант ответа
};

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

// Считает длину так, как её видит Telegram: по видимому тексту,
// без HTML-тегов и с раскодированными сущностями. Telegram меряет
// лимит в UTF-16 code units (как String.length в JS), поэтому
// возвращаем .length, а не число code points.
export function tgVisibleLength(input) {
  if (!input) return 0;
  let s = String(input);
  // <br> и закрытия блочных тегов → перевод строки (1 символ)
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li)>/gi, '\n');
  // остальные теги вырезаем
  s = s.replace(/<[^>]*>/g, '');
  // раскодируем основные HTML-сущности (Telegram считает их как 1 символ)
  s = s.replace(/&[a-z#0-9]+;/gi, (m) => (m in ENTITIES ? ENTITIES[m] : m));
  return s.length;
}

function hasMediaAttached(media) {
  return !!(media && (media.url || media.mimeType || media.filename));
}

// Главный валидатор. Возвращает { ok, error?, length?, limit? }.
// Аргументы:
//   text     — текст/подпись (может содержать HTML)
//   media    — объект media (если есть вложение) ИЛИ булево hasMedia
//   poll     — объект опроса/викторины (если режим poll/quiz)
export function validateBroadcastContent({ text = '', media = null, poll = null } = {}) {
  // Опрос/викторина — у них свои лимиты, текст/подпись не применяются.
  if (poll) {
    const qLen = tgVisibleLength((poll.question || '').trim());
    if (qLen > TG_LIMITS.POLL_QUESTION) {
      return { ok: false, length: qLen, limit: TG_LIMITS.POLL_QUESTION,
        error: `Вопрос опроса слишком длинный: ${qLen}/${TG_LIMITS.POLL_QUESTION} символов.` };
    }
    const opts = Array.isArray(poll.options) ? poll.options : [];
    for (let i = 0; i < opts.length; i++) {
      const oLen = tgVisibleLength(String(opts[i] ?? '').trim());
      if (oLen > TG_LIMITS.POLL_OPTION) {
        return { ok: false, length: oLen, limit: TG_LIMITS.POLL_OPTION,
          error: `Вариант ответа №${i + 1} слишком длинный: ${oLen}/${TG_LIMITS.POLL_OPTION} символов.` };
      }
    }
    return { ok: true };
  }

  const hasMedia = typeof media === 'boolean' ? media : hasMediaAttached(media);
  const limit = hasMedia ? TG_LIMITS.CAPTION : TG_LIMITS.TEXT;
  const length = tgVisibleLength(text);
  if (length > limit) {
    return {
      ok: false, length, limit,
      error: hasMedia
        ? `Подпись к медиа слишком длинная: ${length}/${limit} символов. ` +
          `Сократите текст или отправьте его отдельным сообщением без вложения.`
        : `Текст сообщения слишком длинный: ${length}/${limit} символов.`,
    };
  }
  return { ok: true, length, limit };
}
