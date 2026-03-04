import { useRef, useCallback, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, AlignLeft, List, ListOrdered,
  Link as LinkIcon, Image as ImageIcon, Heading3
} from 'lucide-react';

export default function WysiwygEditor({ initialContent, onContentChange }) {
  const editorRef = useRef(null);
  const onChangeRef = useRef(onContentChange);

  // Держим актуальную ссылку на колбэк (без пересоздания функций)
  useEffect(() => {
    onChangeRef.current = onContentChange;
  }, [onContentChange]);

  // Устанавливаем начальный контент ОДИН раз при монтировании через ref
  // (вместо dangerouslySetInnerHTML, который конфликтует с contentEditable)
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = DOMPurify.sanitize(initialContent || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // только при монтировании

  const fireChange = useCallback(() => {
    onChangeRef.current?.(editorRef.current?.innerHTML);
  }, []);

  const execCmd = useCallback((command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    fireChange();
  }, [fireChange]);

  const handleLink = () => {
    const url = prompt('Введите URL:');
    if (url) execCmd('createLink', url);
  };

  const handleImage = () => {
    const url = prompt('Введите URL изображения:');
    if (url) execCmd('insertImage', url);
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

  return (
    <div className="kb-editor">
      <div className="editor-toolbar">
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('bold')} title="Жирный">
          <Bold size={16} />
        </button>
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('italic')} title="Курсив">
          <Italic size={16} />
        </button>
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={handleHeading} title="Заголовок">
          <Heading3 size={16} />
        </button>
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('justifyLeft')} title="Выравнивание">
          <AlignLeft size={16} />
        </button>
        <div className="toolbar-divider" />
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('insertUnorderedList')} title="Маркированный список">
          <List size={16} />
        </button>
        <button className="toolbar-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('insertOrderedList')} title="Нумерованный список">
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
    </div>
  );
}
