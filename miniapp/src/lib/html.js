import DOMPurify from 'dompurify';

// Bot texts are Telegram-HTML: <b>/<i>/<a>/<code> + <tg-emoji>fallback</tg-emoji>,
// newlines as \n. Convert to safe display HTML for the mini app.
export function tgHtml(text) {
  let s = String(text || '');
  // tg-emoji renders only in Telegram chats — keep the fallback emoji inside.
  s = s.replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/gi, '$1');
  return DOMPurify.sanitize(s, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'a', 'code', 'pre', 'br'],
    ALLOWED_ATTR: ['href'],
  });
}
