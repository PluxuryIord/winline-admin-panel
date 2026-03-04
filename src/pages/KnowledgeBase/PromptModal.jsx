import { useState, useEffect, useRef } from 'react';

export default function PromptModal({ title, placeholder, isConfirm, onConfirm, onCancel }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isConfirm) inputRef.current?.focus();
  }, [isConfirm]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isConfirm) {
      onConfirm();
    } else if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <div className="prompt-overlay" onClick={onCancel}>
      <form className="prompt-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="prompt-title">{title}</div>
        {!isConfirm && (
          <input
            ref={inputRef}
            className="prompt-input"
            type="text"
            placeholder={placeholder || ''}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <div className="prompt-actions">
          <button type="button" className="prompt-btn prompt-btn-cancel" onClick={onCancel}>Отмена</button>
          <button
            type="submit"
            className={`prompt-btn ${isConfirm ? 'prompt-btn-danger' : 'prompt-btn-ok'}`}
            disabled={!isConfirm && !value.trim()}
          >
            {isConfirm ? 'Удалить' : 'OK'}
          </button>
        </div>
      </form>
    </div>
  );
}
