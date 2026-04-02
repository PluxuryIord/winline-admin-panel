import { useState, useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, Code, Link2, Smile } from 'lucide-react';
import './TgHtmlEditor.css';

/* ── Custom Emoji IDs (same as EmojiPicker) ───────────────────────────── */
const CUSTOM_EMOJI_IDS = [
  '5249203579134179981','5249222386795967624','5249038167058709114',
  '5249101968797889750','5249380256908865528','5249497067134418748',
  '5248961824015024533','5249022679406641203','5249500859590539214',
  '5249393919199836094','5249315265463743154','5249137793120107984',
  '5249431560293220758','5248978625927083352','5249266736628266267',
  '5249284625167055914','5248996780753844722','5249377542489535714',
  '5249100031767641367','5249370271109905382','5249023950716959287',
  '5249494885291033786','5249233003955125362','5249132016389092908',
  '5249455491850991356','5249484955326643084','5249109553710136350',
  '5249409342427396269','5249407873548581860','5249222721803416777',
  '5249042689659273281','5249150639367287343','5249302071324214197',
  '5249311528842196557','5249350832087925208',
];

/* ── Telegram HTML  ->  contentEditable safe HTML ─────────────────────── */
function tgHtmlToEditable(tgHtml) {
  if (!tgHtml) return '';

  let html = tgHtml;

  // Escape everything first
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Restore allowed tags
  // <b>, </b>
  html = html.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
  // <strong>, </strong> -> <b>
  html = html.replace(/&lt;strong&gt;/g, '<b>').replace(/&lt;\/strong&gt;/g, '</b>');
  // <i>, </i>
  html = html.replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>');
  // <em>, </em> -> <i>
  html = html.replace(/&lt;em&gt;/g, '<i>').replace(/&lt;\/em&gt;/g, '</i>');
  // <code>, </code>
  html = html.replace(/&lt;code&gt;/g, '<code>').replace(/&lt;\/code&gt;/g, '</code>');
  // <a href="..."> — validate href, remove javascript: links
  const sanitizeHref = (match, href) => {
    if (/^javascript:/i.test(href)) return '';
    return `<a href="${href}" target="_blank" rel="noopener">`;
  };
  html = html.replace(/&lt;a href=&quot;([^&]*)&quot;&gt;/g, sanitizeHref);
  html = html.replace(/&lt;a href=&amp;quot;([^&]*)&amp;quot;&gt;/g, sanitizeHref);
  html = html.replace(/&lt;a href="([^"]*)"&gt;/g, sanitizeHref);
  html = html.replace(/&lt;\/a&gt;/g, '</a>');

  // <tg-emoji emoji-id="ID">...</tg-emoji> -> <img>
  html = html.replace(
    /&lt;tg-emoji emoji-id=&quot;(\d+)&quot;&gt;[^&]*&lt;\/tg-emoji&gt;/g,
    '<img src="/emoji/$1.webp" data-emoji-id="$1" class="tg-emoji-inline" contenteditable="false" alt="emoji" />',
  );
  html = html.replace(
    /&lt;tg-emoji emoji-id=&amp;quot;(\d+)&amp;quot;&gt;[^&]*&lt;\/tg-emoji&gt;/g,
    '<img src="/emoji/$1.webp" data-emoji-id="$1" class="tg-emoji-inline" contenteditable="false" alt="emoji" />',
  );
  html = html.replace(
    /&lt;tg-emoji emoji-id="(\d+)"&gt;[^<]*&lt;\/tg-emoji&gt;/g,
    '<img src="/emoji/$1.webp" data-emoji-id="$1" class="tg-emoji-inline" contenteditable="false" alt="emoji" />',
  );

  // \n -> <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}

/* ── contentEditable DOM  ->  Telegram HTML string ────────────────────── */
function editableDomToTgHtml(container) {
  let result = '';

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Escape HTML entities in text
      let text = node.textContent;
      text = text.replace(/&/g, '&amp;');
      text = text.replace(/</g, '&lt;');
      text = text.replace(/>/g, '&gt;');
      result += text;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();

    // <img data-emoji-id> -> <tg-emoji>
    if (tag === 'img' && node.dataset.emojiId) {
      result += `<tg-emoji emoji-id="${node.dataset.emojiId}">\u2B50</tg-emoji>`;
      return;
    }

    // <br> -> \n
    if (tag === 'br') {
      result += '\n';
      return;
    }

    // <div> wraps lines in contentEditable — treat as newline
    if (tag === 'div') {
      // Only add newline if there's already content (avoid leading newline)
      if (result.length > 0 && !result.endsWith('\n')) {
        result += '\n';
      }
      for (const child of node.childNodes) walk(child);
      return;
    }

    // Bold
    if (tag === 'b' || tag === 'strong') {
      result += '<b>';
      for (const child of node.childNodes) walk(child);
      result += '</b>';
      return;
    }

    // Italic
    if (tag === 'i' || tag === 'em') {
      result += '<i>';
      for (const child of node.childNodes) walk(child);
      result += '</i>';
      return;
    }

    // Code
    if (tag === 'code') {
      result += '<code>';
      for (const child of node.childNodes) walk(child);
      result += '</code>';
      return;
    }

    // Link
    if (tag === 'a') {
      const href = node.getAttribute('href') || '';
      const escapedHref = href.replace(/"/g, '&quot;').replace(/javascript:/gi, '');
      result += `<a href="${escapedHref}">`;
      for (const child of node.childNodes) walk(child);
      result += '</a>';
      return;
    }

    // Everything else — just recurse (strip the tag)
    for (const child of node.childNodes) walk(child);
  }

  for (const child of container.childNodes) walk(child);

  // Clean up trailing newlines that contentEditable might add
  result = result.replace(/\n$/, '');

  return result;
}

/* ── Save and restore caret position ──────────────────────────────────── */
function saveSelection() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0).cloneRange();
}

function restoreSelection(range) {
  if (!range) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ── Insert HTML at caret in contentEditable ──────────────────────────── */
function insertHtmlAtCaret(html) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();

  const temp = document.createElement('div');
  temp.innerHTML = html;
  const frag = document.createDocumentFragment();
  let lastNode = null;
  while (temp.firstChild) {
    lastNode = frag.appendChild(temp.firstChild);
  }
  range.insertNode(frag);

  // Move caret after inserted content
  if (lastNode) {
    const newRange = document.createRange();
    newRange.setStartAfter(lastNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

const MAX_HTML_LENGTH = 10000;

/* ══════════════════════════════════════════════════════════════════════════
   TgHtmlEditor component
   ══════════════════════════════════════════════════════════════════════════ */
export default function TgHtmlEditor({ value, onChange, placeholder, minRows = 3 }) {
  const editorRef = useRef(null);
  const lastHtmlRef = useRef('');     // last known TG HTML to detect external changes
  const debounceRef = useRef(null);
  const isComposingRef = useRef(false);

  const [emojiOpen, setEmojiOpen] = useState(false);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, code: false });
  const savedSelectionRef = useRef(null);

  /* ── Track active formatting on selection change ────────────────────── */
  useEffect(() => {
    const updateFormats = () => {
      if (!editorRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      // Only track if selection is inside our editor
      if (!editorRef.current.contains(sel.anchorNode)) return;

      const bold = document.queryCommandState('bold');
      const italic = document.queryCommandState('italic');

      // Check code: walk up from selection to see if inside <code>
      let inCode = false;
      let node = sel.anchorNode;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'CODE') {
          inCode = true;
          break;
        }
        node = node.parentNode;
      }

      setActiveFormats({ bold, italic, code: inCode });
    };

    document.addEventListener('selectionchange', updateFormats);
    return () => document.removeEventListener('selectionchange', updateFormats);
  }, []);

  /* ── Sync external value into editor ─────────────────────────────────── */
  useEffect(() => {
    if (!editorRef.current) return;
    // Only update DOM if the value actually differs from what the editor has
    if (value === lastHtmlRef.current) return;
    lastHtmlRef.current = value || '';
    const safeHtml = tgHtmlToEditable(value || '');
    editorRef.current.innerHTML = safeHtml;
  }, [value]);

  /* ── Handle input (debounced) ────────────────────────────────────────── */
  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!editorRef.current) return;
      const tgHtml = editableDomToTgHtml(editorRef.current);
      if (tgHtml.length > MAX_HTML_LENGTH) return;
      if (tgHtml !== lastHtmlRef.current) {
        lastHtmlRef.current = tgHtml;
        onChange?.(tgHtml);
      }
    }, 300);
  }, [onChange]);

  /* Cleanup debounce on unmount */
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  /* ── Toolbar actions ─────────────────────────────────────────────────── */
  const execBold = (e) => {
    e.preventDefault();
    editorRef.current?.focus();
    document.execCommand('bold', false, null);
    handleInput();
  };

  const execItalic = (e) => {
    e.preventDefault();
    editorRef.current?.focus();
    document.execCommand('italic', false, null);
    handleInput();
  };

  const execCode = (e) => {
    e.preventDefault();
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return; // nothing selected

    // Check if already inside <code>
    let parent = range.commonAncestorContainer;
    if (parent.nodeType === Node.TEXT_NODE) parent = parent.parentElement;
    if (parent && parent.tagName === 'CODE') {
      // Unwrap code
      const text = document.createTextNode(parent.textContent);
      parent.parentNode.replaceChild(text, parent);
      // Reselect the text
      const newRange = document.createRange();
      newRange.selectNodeContents(text);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      // Wrap in <code>
      const codeEl = document.createElement('code');
      try {
        range.surroundContents(codeEl);
      } catch {
        // surroundContents can fail if selection crosses element boundaries
        const fragment = range.extractContents();
        codeEl.appendChild(fragment);
        range.insertNode(codeEl);
      }
      const newRange = document.createRange();
      newRange.selectNodeContents(codeEl);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
    handleInput();
  };

  const execLink = (e) => {
    e.preventDefault();
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    // Check if caret/selection is inside an <a>
    let parent = range.commonAncestorContainer;
    if (parent.nodeType === Node.TEXT_NODE) parent = parent.parentElement;
    if (parent && parent.tagName === 'A') {
      // Remove link — unwrap
      const text = document.createTextNode(parent.textContent);
      parent.parentNode.replaceChild(text, parent);
      handleInput();
      return;
    }

    if (range.collapsed) return; // nothing selected — nothing to link

    const url = prompt('URL ссылки:');
    if (!url) return;

    document.execCommand('createLink', false, url);
    handleInput();
  };

  /* ── Emoji picker ────────────────────────────────────────────────────── */
  const emojiTriggerRef = useRef(null);
  const [emojiPos, setEmojiPos] = useState({ top: 0, left: 0 });

  const handleEmojiOpen = (e) => {
    e.preventDefault();
    savedSelectionRef.current = saveSelection();
    if (!emojiOpen && emojiTriggerRef.current) {
      const rect = emojiTriggerRef.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      const popW = 280;
      let left = spaceRight >= popW + 8 ? rect.right + 4 : Math.max(8, rect.left - popW - 4);
      setEmojiPos({ top: rect.bottom + 6, left });
    }
    setEmojiOpen(!emojiOpen);
  };

  const handleEmojiSelect = (emojiId) => {
    setEmojiOpen(false);
    editorRef.current?.focus();

    // Restore selection
    if (savedSelectionRef.current) {
      restoreSelection(savedSelectionRef.current);
      savedSelectionRef.current = null;
    }

    const imgHtml = `<img src="/emoji/${emojiId}.webp" data-emoji-id="${emojiId}" class="tg-emoji-inline" contenteditable="false" alt="emoji" />`;
    insertHtmlAtCaret(imgHtml);
    handleInput();
  };

  /* ── Handle paste: strip formatting, keep only text ─────────────────── */
  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    // Insert as plain text with line breaks preserved
    const lines = text.split('\n');
    const html = lines.map((line, i) => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return i < lines.length - 1 ? escaped + '<br>' : escaped;
    }).join('');
    document.execCommand('insertHTML', false, html);
    handleInput();
  }, [handleInput]);

  /* ── Handle key: prevent default on Enter to insert <br> ────────────── */
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      handleInput();
    }
  }, [handleInput]);

  const minHeight = minRows * 24;

  return (
    <div className="tg-editor-container">
      {/* Toolbar */}
      <div className="tg-editor-toolbar">
        <button
          className={`tg-editor-toolbar-btn${activeFormats.bold ? ' tg-toolbar-btn--active' : ''}`}
          onMouseDown={execBold}
          title="Жирный (Ctrl+B)"
          type="button"
        >
          <Bold size={15} />
        </button>
        <button
          className={`tg-editor-toolbar-btn${activeFormats.italic ? ' tg-toolbar-btn--active' : ''}`}
          onMouseDown={execItalic}
          title="Курсив (Ctrl+I)"
          type="button"
        >
          <Italic size={15} />
        </button>
        <button
          className={`tg-editor-toolbar-btn${activeFormats.code ? ' tg-toolbar-btn--active' : ''}`}
          onMouseDown={execCode}
          title="Код"
          type="button"
        >
          <Code size={15} />
        </button>
        <button
          className="tg-editor-toolbar-btn"
          onMouseDown={execLink}
          title="Ссылка"
          type="button"
        >
          <Link2 size={15} />
        </button>

        <div className="tg-editor-toolbar-sep" />

        {/* Emoji picker */}
        <div className="tg-editor-emoji-wrapper">
          <button
            ref={emojiTriggerRef}
            className="tg-editor-toolbar-btn"
            onMouseDown={handleEmojiOpen}
            title="Фирменные эмодзи"
            type="button"
          >
            <Smile size={15} />
          </button>
          {emojiOpen && (
            <>
              <div className="emoji-picker-backdrop" onClick={() => setEmojiOpen(false)} />
              <div className="tg-editor-emoji-popup" style={{ position: 'fixed', top: emojiPos.top, left: emojiPos.left, width: 280 }}>
                <div className="tg-editor-emoji-grid">
                  {CUSTOM_EMOJI_IDS.map((id) => (
                    <button
                      key={id}
                      className="tg-editor-emoji-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleEmojiSelect(id)}
                      title={id}
                      type="button"
                    >
                      <img
                        src={`/emoji/${id}.webp`}
                        alt="emoji"
                        className="tg-editor-emoji-img"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        className="tg-editor-content"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => { isComposingRef.current = false; handleInput(); }}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder || 'Введите текст...'}
        style={{ minHeight: `${minHeight}px` }}
      />
    </div>
  );
}
