import DOMPurify from 'dompurify';

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'u', 's', 'a', 'code', 'pre', 'tg-emoji', 'br', 'img', 'span', 'strong', 'em', 'del'],
  ALLOWED_ATTR: ['href', 'class', 'className', 'src', 'alt', 'data-emoji-id', 'target', 'rel', 'style'],
  ALLOW_DATA_ATTR: false,
};

/**
 * Sanitize HTML string via DOMPurify.
 * Wraps any existing transform function output before passing to dangerouslySetInnerHTML.
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}
