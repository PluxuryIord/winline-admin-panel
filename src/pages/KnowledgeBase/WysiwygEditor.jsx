import { useRef, useCallback, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered,
  Link as LinkIcon, Image as ImageIcon,
  Heading3, Pilcrow,
  Minus,
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

  // Отслеживаем активные форматы при изменении выделения
  useEffect(() => {
    const checkFormats = () => {
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
        h3:                  block === 'h3',
        p:                   block === 'p' || block === '',
      });
    };
    document.addEventListener('selectionchange', checkFormats);
    return () => document.removeEventListener('selectionchange', checkFormats);
  }, []);

  const fireChange = useCallback(() => {
    onChangeRef.current?.(editorRef.current?.innerHTML);
  }, []);

  const execCmd = useCallback((command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    fireChange();
    // Обновляем форматы сразу после команды
    const block = document.queryCommandValue('formatBlock').toLowerCase();
    setActiveFormats(prev => ({
      ...prev,
      [command]: document.queryCommandState(command),
      h3: block === 'h3',
      p: block === 'p' || block === '',
      justifyLeft:   document.queryCommandState('justifyLeft'),
      justifyCenter: document.queryCommandState('justifyCenter'),
      justifyRight:  document.queryCommandState('justifyRight'),
    }));
  }, [fireChange]);

  const handleLink = () => {
    setModal({
      title: 'Вставить ссылку',
      placeholder: 'https://example.com',
      onConfirm: (url) => { setModal(null); execCmd('createLink', url); }
    });
  };

  const handleImage = () => {
    setModal({
      title: 'URL изображения',
      placeholder: 'https://example.com/image.png',
      onConfirm: (url) => { setModal(null); execCmd('insertImage', url); }
    });
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
      const clean = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'img', 'span', 'strike', 's'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'style'],
      });
      document.execCommand('insertHTML', false, clean);
    } else {
      document.execCommand('insertText', false, text);
    }
    fireChange();
  };

  const prevent = (e) => e.preventDefault();
  const btn = (cmd) => `toolbar-btn${activeFormats[cmd] ? ' toolbar-btn-active' : ''}`;

  return (
    <div className="kb-editor">
      <div className="editor-toolbar">

        {/* Форматирование текста */}
        <button className={btn('bold')}        onMouseDown={prevent} onClick={() => execCmd('bold')}        title="Жирный (Ctrl+B)"><Bold size={15} /></button>
        <button className={btn('italic')}      onMouseDown={prevent} onClick={() => execCmd('italic')}      title="Курсив (Ctrl+I)"><Italic size={15} /></button>
        <button className={btn('underline')}   onMouseDown={prevent} onClick={() => execCmd('underline')}   title="Подчёркнутый (Ctrl+U)"><Underline size={15} /></button>
        <button className={btn('strikeThrough')} onMouseDown={prevent} onClick={() => execCmd('strikeThrough')} title="Зачёркнутый"><Strikethrough size={15} /></button>

        <div className="toolbar-divider" />

        {/* Блочный формат */}
        <button className={btn('h3')} onMouseDown={prevent} onClick={() => execCmd('formatBlock', 'h3')} title="Заголовок"><Heading3 size={15} /></button>
        <button className={btn('p')}  onMouseDown={prevent} onClick={() => execCmd('formatBlock', 'p')}  title="Обычный текст"><Pilcrow size={15} /></button>

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

        {/* Вставка */}
        <button className="toolbar-btn" onMouseDown={prevent} onClick={handleLink}  title="Добавить ссылку"><LinkIcon size={15} /></button>
        <button className="toolbar-btn" onMouseDown={prevent} onClick={handleImage} title="Вставить изображение"><ImageIcon size={15} /></button>
        <button className="toolbar-btn" onMouseDown={prevent} onClick={() => execCmd('insertHorizontalRule')} title="Горизонтальная линия"><Minus size={15} /></button>

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
