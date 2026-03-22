import { useState, useRef, useCallback } from 'react';
import {
  Save, X, ChevronUp, ChevronDown, MessageSquare, MousePointer,
  Loader, Check, ExternalLink, Link, Plus, Trash2, GripVertical, Eye,
} from 'lucide-react';
import EmojiPicker from '../../components/EmojiPicker/EmojiPicker';

const SCREEN_ICONS = {
  start_menu: '👋', registration_flow: '📝', auth_flow: '🔐',
  main_menu: '🏠', offer_page: '📋', promo_page: '🎨',
  socials_page: '📱', event_flow: '🎪', logout_screen: '🚪',
};

// ─── Sanitize HTML (allow only safe tags) ────────────────────────────────────
function sanitizeHtml(html) {
  if (!html) return '';
  // Strip all tags except b, i, a, code, em, strong
  return html.replace(/<\/?(?!b>|\/b>|i>|\/i>|a[\s>]|\/a>|code>|\/code>|em>|\/em>|strong>|\/strong>)[^>]*>/gi, '');
}

export default function NodeEditorPanel({
  screenId, editData, allScreens, isCustom,
  onUpdateMessage, onUpdateButtonLabel, onUpdateButtonAction,
  onUpdateButtonTarget, onMoveButton, onReorderButtons, onAddButton, onDeleteButton,
  onDeleteScreen, onClose, onSave, dirty, saving, saved,
}) {
  const textareaRefs = useRef({});

  if (!editData) return null;

  const messageKeys = Object.keys(editData.messages || {});
  const buttonOrder = editData.buttons?._order || [];

  // Build list of screens for the dropdown
  const screenOptions = Object.entries(allScreens).map(([id, s]) => ({
    id,
    title: `${SCREEN_ICONS[id] || '📄'} ${s.title}`,
  }));

  // ─── Drag & drop state ─────────────────────────────────────────────────────
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const dragStartY = useRef(0);

  const handleDragStart = useCallback((e, idx) => {
    e.stopPropagation();
    setDragIdx(idx);
    dragStartY.current = e.clientY;

    const onMouseMove = (ev) => {
      // Find which button index we're over
      const btnEls = document.querySelectorAll('.node-editor-btn-block');
      for (let i = 0; i < btnEls.length; i++) {
        const rect = btnEls[i].getBoundingClientRect();
        if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
          setDragOverIdx(i);
          break;
        }
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // Reorder
      setDragIdx(prevDragIdx => {
        setDragOverIdx(prevOverIdx => {
          if (prevDragIdx !== null && prevOverIdx !== null && prevDragIdx !== prevOverIdx) {
            onReorderButtons?.(prevDragIdx, prevOverIdx);
          }
          return null;
        });
        return null;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [onReorderButtons]);

  // ─── Get combined message text for preview ─────────────────────────────────
  const previewText = messageKeys.map(key => editData.messages[key]?.text || '').join('\n\n');

  return (
    <div className="node-editor-panel">
      <div className="node-editor-header">
        <div>
          <h2>{SCREEN_ICONS[screenId] || '📄'} {editData.title}</h2>
          <p>{editData.description}</p>
        </div>
        <div className="node-editor-actions">
          {isCustom && (
            <button className="sc-delete-screen-btn" onClick={onDeleteScreen} title="Удалить блок">
              <Trash2 size={16} />
            </button>
          )}
          <button
            className={`sc-save-btn ${saved ? 'saved' : ''}`}
            onClick={onSave}
            disabled={saving || !dirty}
          >
            {saved ? <><Check size={16} /> Сохранено</> :
             saving ? <><Loader size={16} className="sc-spinner" /> ...</> :
             <><Save size={16} /> Сохранить</>}
          </button>
          <button className="node-editor-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      {messageKeys.length > 0 && (
        <div className="sc-section">
          <h3 className="sc-section-title"><MessageSquare size={16} /> Сообщения</h3>
          {messageKeys.map(key => {
            const msg = editData.messages[key];
            return (
              <div key={key} className="sc-message-block">
                <label className="sc-message-label">{msg.label}</label>
                <textarea
                  className="sc-message-textarea"
                  value={msg.text}
                  onChange={e => {
                    onUpdateMessage(key, e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  ref={el => {
                    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                    if (!textareaRefs.current[key]) textareaRefs.current[key] = { current: null };
                    textareaRefs.current[key].current = el;
                  }}
                />
                <div className="sc-message-footer">
                  <span className="sc-message-hint">HTML: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;, &lt;code&gt;</span>
                  <EmojiPicker
                    textareaRef={textareaRefs.current[key] || { current: null }}
                    onInsert={(tag, pos) => {
                      const text = msg.text || '';
                      const insertAt = pos != null ? pos : text.length;
                      const newText = text.slice(0, insertAt) + tag + text.slice(insertAt);
                      onUpdateMessage(key, newText);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Buttons */}
      <div className="sc-section">
        <div className="sc-section-header">
          <h3 className="sc-section-title"><MousePointer size={16} /> Кнопки</h3>
          <button className="sc-add-btn" onClick={onAddButton} title="Добавить кнопку">
            <Plus size={14} /> Добавить
          </button>
        </div>
        {buttonOrder.length > 0 && (
          <div className="sc-buttons-list">
            {buttonOrder.map((key, idx) => {
              const btn = editData.buttons[key];
              if (!btn) return null;
              const isUrl = btn.action?.startsWith('url:');
              const urlValue = isUrl ? btn.action.slice(4) : '';
              const isDragging = dragIdx === idx;
              const isDragOver = dragOverIdx === idx && dragIdx !== idx;

              if (btn.locked) {
                return (
                  <div key={key} className="node-editor-btn-block node-editor-btn-locked">
                    <div className="sc-button-row">
                      <input
                        className="sc-button-input"
                        value={btn.label}
                        disabled
                        style={{ opacity: 0.5 }}
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={key}
                  className={`node-editor-btn-block ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                >
                  <div className="sc-button-row">
                    {/* Drag handle */}
                    <div
                      className="sc-drag-handle"
                      onMouseDown={(e) => handleDragStart(e, idx)}
                      title="Перетащите для перемещения"
                    >
                      <GripVertical size={16} />
                    </div>
                    <div className="sc-button-arrows">
                      <button className="sc-arrow-btn" onClick={() => onMoveButton(key, -1)} disabled={idx === 0}>
                        <ChevronUp size={14} />
                      </button>
                      <button className="sc-arrow-btn" onClick={() => onMoveButton(key, 1)} disabled={idx === buttonOrder.length - 1}>
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <input
                      className="sc-button-input"
                      value={btn.label}
                      onChange={e => onUpdateButtonLabel(key, e.target.value)}
                      placeholder="Текст кнопки"
                    />
                    <button className="sc-delete-btn-small" onClick={() => onDeleteButton(key)} title="Удалить кнопку">
                      <X size={14} />
                    </button>
                  </div>

                  {/* Action: URL or Target Screen */}
                  <div className="node-editor-btn-action">
                    {isUrl ? (
                      <div className="node-editor-url-row">
                        <ExternalLink size={14} className="node-editor-url-icon" />
                        <input
                          className="node-editor-url-input"
                          value={urlValue}
                          onChange={e => onUpdateButtonAction(key, `url:${e.target.value}`)}
                          placeholder="https://..."
                        />
                      </div>
                    ) : (
                      <div className="node-editor-target-row">
                        <Link size={14} className="node-editor-target-icon" />
                        <select
                          className="node-editor-target-select"
                          value={btn.targetScreen || ''}
                          onChange={e => onUpdateButtonTarget(key, e.target.value)}
                        >
                          <option value="">— Действие без перехода —</option>
                          {screenOptions.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.title}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {buttonOrder.length === 0 && (
          <p className="sc-no-buttons">Нет кнопок{isCustom ? '. Нажмите «Добавить» чтобы создать.' : ''}</p>
        )}
      </div>
    </div>
  );
}
