import { useRef, useCallback, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, AlignLeft, List, ListOrdered,
  Link as LinkIcon, Image as ImageIcon, Heading3
} from 'lucide-react';
import PromptModal from './PromptModal';

export default function WysiwygEditor({ initialContent, onContentChange }) {
  const editorRef = useRef(null);
  const onChangeRef = useRef(onContentChange);
  const [activeFormats, setActiveFormats] = useState({});
  const [modal, setModal] = useState(null);

  useEffect(() => {
    onChangeRef.current = onContentChange;
  }, [onContentChange]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = DOMPurify.sanitize(initialContent || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Отслеживаем активные форматы при изменении выделения
  useEffect(() => {
    const checkFormats = () => {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });
    };

    document.addEventListener('selectionchange', checkFormats);
    return () => document.removeEventListener('selectionchange', checkFormats);
  }, []);

  const fireChange = useCallback(() => {
    onChangeRef.current?.(editorRef.current?.innerHTML);
  }, []);

  const execCmd = useCallback((command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    fireChange();
    // Обновляем активные форматы после команды
    setActiveFormats(prev => ({
      ...prev,
      [command]: document.queryCommandState(command),
    }));
  }, [fireChange]);

  const handleLink = () => {
    setModal({
      title: 'Вставить ссылку',
      placeholder: 'https://example.com',
      onConfirm: (url) => {
        setModal(null);
        execCmd('createLink', url);
      }
    });
  };

  const handleImage = () => {
    setModal({
      title: 'Вставить изображение',
      placeholder: 'https://example.com/image.png',
      onConfirm: (url) => {
        setModal(null);
        execCmd('insertImage', url);
      }
    });
  };

  const handleHeading = () => {
    execCmd('formatBlock', 'h3');
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    if (html) {
      const clean = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a', 'h3', 'img', 'span'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'target'],
      });
      document.execCommand('insertHTML', false, clean);
    } else {
      document.execCommand('insertText', false, text);
    }
    fireChange();
  };

  const btnClass = (cmd) => `toolbar-btn${activeFormats[cmd] ? ' toolbar-btn-active' : ''}`;

  return (
    <div className="kb-editor">
      <div className="editor-toolbar">
        <button className={btnClass('bold')} onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('bold')} title="Жирный">
          <Bold size={16} />
        </button>
        <button className={btnClass('italic')} onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('italic')} title="Курсив">
          <Italic size={16} />
        </button>
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={handleHeading} title="Заголовок">
          <Heading3 size={16} />
        </button>
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('justifyLeft')} title="Выравнивание">
          <AlignLeft size={16} />
        </button>
        <div className="toolbar-divider" />
        <button className={btnClass('insertUnorderedList')} onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('insertUnorderedList')} title="Маркированный список">
          <List size={16} />
        </button>
        <button className={btnClass('insertOrderedList')} onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('insertOrderedList')} title="Нумерованный список">
          <ListOrdered size={16} />
        </button>
        <div className="toolbar-divider" />
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={handleLink} title="Добавить ссылку">
          <LinkIcon size={16} />
        </button>
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={handleImage} title="Добавить картинку">
          <ImageIcon size={16} />
        </button>
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
