import { useRef, useCallback, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered,
  Image as ImageIcon,
  Heading1, Heading2, Heading3,
} from 'lucide-react';
import PromptModal from './PromptModal';

export default function WysiwygEditor({ initialContent, onContentChange }) {
  const editorRef = useRef(null);
  const onChangeRef = useRef(onContentChange);
  const [activeFormats, setActiveFormats] = useState({});
  const [modal, setModal] = useState(null);

  useEffect(() => { onChangeRef.current = onContentChange; }, [onContentChange]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = DOMPurify.sanitize(initialContent || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Единая функция проверки форматов — используется и в selectionchange, и после execCmd
  const checkFormats = useCallback(() => {
    const block = document.queryCommandValue('formatBlock').toLowerCase();
    setActiveFormats({
      bold:                document.queryCommandState('bold'),
      italic:              document.queryCommandState('italic'),
      underline:           document.queryCommandState('underline'),
      strikeThrough:       document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList:   document.queryCommandState('insertOrderedList'),
      justifyLeft:         document.queryCommandState('justifyLeft'),
      justifyCenter:       document.queryCommandState('justifyCenter'),
      justifyRight:        document.queryCommandState('justifyRight'),
      h1: block === 'h1',
      h2: block === 'h2',
      h3: block === 'h3',
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', checkFormats);
    return () => document.removeEventListener('selectionchange', checkFormats);
  }, [checkFormats]);

  const fireChange = useCallback(() => {
    onChangeRef.current?.(editorRef.current?.innerHTML);
  }, []);

  const execCmd = useCallback((command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    fireChange();
    // setTimeout даёт браузеру применить изменение до того как читаем состояние
    setTimeout(checkFormats, 0);
  }, [fireChange, checkFormats]);

  const handleImage = () => {
    setModal({
      title: 'URL изображения',
      placeholder: 'https://example.com/image.png',
      onConfirm: (url) => { setModal(null); execCmd('insertImage', url); }
    });
  };

  // Убираем color/background/fontFamily из вставленного HTML (Word, Google Docs и т.д.)
  const stripColors = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('[style]').forEach(el => {
      el.style.color = '';
      el.style.backgroundColor = '';
      el.style.background = '';
      el.style.fontFamily = '';
      el.style.fontSize = '';
      if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
    });
    return div.innerHTML;
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
      const clean = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li',
                       'h1', 'h2', 'h3', 'img', 'span', 'strike', 's'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'style'],
      });
      document.execCommand('insertHTML', false, stripColors(clean));
    } else {
      document.execCommand('insertText', false, text);
    }
    fireChange();
  };

  const prevent = (e) => e.preventDefault();
  const btn = (key) => `toolbar-btn${activeFormats[key] ? ' toolbar-btn-active' : ''}`;

  return (
    <div className="kb-editor">
      <div className="editor-toolbar">

        {/* Форматирование текста */}
        <button className={btn('bold')}         onMouseDown={prevent} onClick={() => execCmd('bold')}         title="Жирный (Ctrl+B)"><Bold size={15} /></button>
        <button className={btn('italic')}        onMouseDown={prevent} onClick={() => execCmd('italic')}        title="Курсив (Ctrl+I)"><Italic size={15} /></button>
        <button className={btn('underline')}     onMouseDown={prevent} onClick={() => execCmd('underline')}     title="Подчёркнутый (Ctrl+U)"><Underline size={15} /></button>
        <button className={btn('strikeThrough')} onMouseDown={prevent} onClick={() => execCmd('strikeThrough')} title="Зачёркнутый"><Strikethrough size={15} /></button>

        <div className="toolbar-divider" />

        {/* Заголовки */}
        <button className={btn('h1')} onMouseDown={prevent} onClick={() => execCmd('formatBlock', 'h1')} title="Заголовок 1"><Heading1 size={15} /></button>
        <button className={btn('h2')} onMouseDown={prevent} onClick={() => execCmd('formatBlock', 'h2')} title="Заголовок 2"><Heading2 size={15} /></button>
        <button className={btn('h3')} onMouseDown={prevent} onClick={() => execCmd('formatBlock', 'h3')} title="Заголовок 3"><Heading3 size={15} /></button>

        <div className="toolbar-divider" />

        {/* Выравнивание */}
        <button className={btn('justifyLeft')}   onMouseDown={prevent} onClick={() => execCmd('justifyLeft')}   title="По левому краю"><AlignLeft size={15} /></button>
        <button className={btn('justifyCenter')} onMouseDown={prevent} onClick={() => execCmd('justifyCenter')} title="По центру"><AlignCenter size={15} /></button>
        <button className={btn('justifyRight')}  onMouseDown={prevent} onClick={() => execCmd('justifyRight')}  title="По правому краю"><AlignRight size={15} /></button>

        <div className="toolbar-divider" />

        {/* Списки */}
        <button className={btn('insertUnorderedList')} onMouseDown={prevent} onClick={() => execCmd('insertUnorderedList')} title="Маркированный список"><List size={15} /></button>
        <button className={btn('insertOrderedList')}   onMouseDown={prevent} onClick={() => execCmd('insertOrderedList')}   title="Нумерованный список"><ListOrdered size={15} /></button>

        <div className="toolbar-divider" />

        {/* Изображение */}
        <button className="toolbar-btn" onMouseDown={prevent} onClick={handleImage} title="Вставить изображение"><ImageIcon size={15} /></button>

      </div>

      <div
        ref={editorRef}
        className="editor-contenteditable html-content"
        contentEditable
        suppressContentEditableWarning
        onInput={fireChange}
        onPaste={handlePaste}
      />

      {modal && (
        <PromptModal
          title={modal.title}
          placeholder={modal.placeholder}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
