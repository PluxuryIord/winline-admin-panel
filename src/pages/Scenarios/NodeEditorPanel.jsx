import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save, X, ChevronUp, ChevronDown, MessageSquare, MousePointer,
  Loader, Check, ExternalLink, Link, Plus, Trash2, GripVertical, Eye, ImageIcon,
  ClipboardList, ToggleLeft, ToggleRight,
} from 'lucide-react';
import TgHtmlEditor from '../../components/TgHtmlEditor/TgHtmlEditor';
import { api } from '../../utils/api';

const SCREEN_ICONS = {
  start_menu: '👋', registration_flow: '📝', auth_flow: '🔐',
  main_menu: '🏠', offer_page: '📋', promo_page: '🎨',
  socials_page: '📱', event_flow: '🎪', event_anketa: '📋', logout_screen: '🚪',
  knowledge_base: '📚', group_menu: '💬', group_promo: '📢',
  group_calendar: '📅', group_landings: '🌐', group_kb: '📖',
};

// Точки входа — нельзя направлять стрелки В эти блоки
const ENTRY_POINTS = new Set(['start_menu', 'event_flow', 'group_menu']);

const FALLBACK_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1wfqrdL30DicmCikX_PBaYHTxbEoJwA8wQgF2jQowA4A/edit';

// Блоки с заблокированными связями — нельзя менять targetScreen кнопок
const LOCKED_CONNECTIONS = new Set([
  'start_menu', 'registration_flow', 'auth_flow',
]);

// ─── Custom Type Dropdown ────────────────────────────────────────────────────
function AnketaTypeDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div className="anketa-dropdown" ref={ref}>
      <button className="anketa-dropdown-btn" type="button" onClick={() => setOpen(!open)}>
        <span>{current?.label || value}</span>
        <ChevronDown size={13} className={`anketa-dropdown-chevron${open ? ' open' : ''}`} />
      </button>
      {open && (
        <div className="anketa-dropdown-menu">
          {options.map(o => (
            <div key={o.value} className={`anketa-dropdown-item${o.value === value ? ' active' : ''}`} onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.icon && <span className="anketa-dropdown-item-icon">{o.icon}</span>}
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: 'text', label: 'Текстовый ответ', icon: '✏️' },
  { value: 'choice', label: 'С вариантами (кнопки)', icon: '🔘' },
];
const TYPE_OPTIONS_SHORT = [
  { value: 'text', label: 'Текстовый', icon: '✏️' },
  { value: 'choice', label: 'С вариантами', icon: '🔘' },
];

// ─── Anketa Question Manager ─────────────────────────────────────────────────
function AnketaQuestionManager() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState('text');
  const [newOptions, setNewOptions] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState('text');
  const [editOptions, setEditOptions] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState(FALLBACK_SHEET_URL);

  const load = async () => {
    try {
      const res = await api.get('/api/events/questions');
      if (res.ok) { setQuestions(await res.json()); }
      else { console.error('Load questions failed:', res.status, await res.text()); }
    } catch (e) { console.error('Load questions error:', e); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    api.get('/api/events/spreadsheet-url').then(r => r.json()).then(d => { if (d.url) setSpreadsheetUrl(d.url); }).catch(() => {});
  }, []);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    const opts = newType === 'choice' ? newOptions.split(',').map(s => s.trim()).filter(Boolean) : null;
    if (newType === 'choice' && (!opts || opts.length < 2)) { setAdding(false); return alert('Нужно минимум 2 варианта через запятую'); }
    try {
      const res = await api.post('/api/events/questions', { question_text: newText.trim(), question_type: newType, options: opts });
      if (!res.ok) { const err = await res.text(); console.error('Add question failed:', err); alert('Ошибка: ' + err); setAdding(false); return; }
      setNewText(''); setNewType('text'); setNewOptions('');
      await load();
    } catch (e) { console.error('Add question error:', e); alert('Ошибка при добавлении: ' + e.message); }
    setAdding(false);
  };

  const handleDelete = async (idOverride) => {
    const id = idOverride || deleteConfirm;
    if (!id) return;
    setDeleteConfirm(null);
    try {
      const res = await fetch(`/api/events/questions/${id}`, { method: 'DELETE', credentials: 'same-origin' });
      const data = await res.json();
      console.log('[anketa] delete result:', id, res.status, data);
    } catch (e) { console.error('[anketa] Delete error:', e); }
    await load();
  };

  const handleToggle = async (q) => {
    await api.put(`/api/events/questions/${q.id}`, { is_active: !q.is_active });
    await load();
  };

  const handleMove = async (idx, dir) => {
    const arr = [...questions];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    const reorder = arr.map((q, i) => ({ id: q.id, order: i + 1 }));
    await api.put('/api/events/questions/reorder', reorder);
    await load();
  };

  const startEdit = (q) => {
    setEditingId(q.id);
    setEditText(q.question_text);
    setEditType(q.question_type);
    setEditOptions(q.options ? q.options.join(', ') : '');
  };

  const saveEdit = async () => {
    const opts = editType === 'choice' ? editOptions.split(',').map(s => s.trim()).filter(Boolean) : null;
    if (editType === 'choice' && (!opts || opts.length < 2)) return alert('Нужно минимум 2 варианта через запятую');
    await api.put(`/api/events/questions/${editingId}`, { question_text: editText, question_type: editType, options: opts });
    setEditingId(null);
    await load();
  };

  if (loading) return <div style={{ padding: 16, color: '#888' }}><Loader size={16} className="sc-spinner" /> Загрузка...</div>;

  return (
    <div className="sc-section anketa-manager-section">
      <h3 className="sc-section-title"><ClipboardList size={16} /> Вопросы анкеты</h3>
      <p className="anketa-manager-hint">Добавляйте вопросы, которые бот задаст пользователю при заполнении анкеты</p>

      <div className="anketa-sheet-actions">
        <a href={spreadsheetUrl} target="_blank" rel="noopener noreferrer" className="anketa-sheet-link-btn">
          <ExternalLink size={14} /> Google Таблица
        </a>
      </div>

      {/* Question list */}
      <div className="anketa-questions-list">
        {questions.length === 0 && <p style={{ color: '#888', fontSize: '0.85rem', padding: '8px 0' }}>Вопросов пока нет</p>}
        {questions.map((q, idx) => (
          <div key={q.id} className={`anketa-q-card ${!q.is_active ? 'anketa-q-inactive' : ''}`}>
            {editingId === q.id ? (
              <div className="anketa-q-edit">
                <input className="anketa-q-input" value={editText} onChange={e => setEditText(e.target.value)} placeholder="Текст вопроса" />
                <div className="anketa-q-type-row">
                  <AnketaTypeDropdown value={editType} onChange={setEditType} options={TYPE_OPTIONS_SHORT} />
                  {editType === 'choice' && (
                    <input className="anketa-q-input" value={editOptions} onChange={e => setEditOptions(e.target.value)} placeholder="Вариант 1, Вариант 2, ..." />
                  )}
                </div>
                <div className="anketa-q-edit-actions">
                  <button className="anketa-q-save-btn" onClick={saveEdit}><Check size={14} /> Сохранить</button>
                  <button className="anketa-q-cancel-btn" onClick={() => setEditingId(null)}><X size={14} /></button>
                </div>
              </div>
            ) : (
              <>
                <div className="anketa-q-header">
                  <div className="anketa-q-arrows">
                    <button onClick={() => handleMove(idx, -1)} disabled={idx === 0}><ChevronUp size={14} /></button>
                    <button onClick={() => handleMove(idx, 1)} disabled={idx === questions.length - 1}><ChevronDown size={14} /></button>
                  </div>
                  <div className="anketa-q-body" onClick={() => startEdit(q)}>
                    <span className="anketa-q-text">{q.question_text}</span>
                    <span className="anketa-q-type-badge">{q.question_type === 'choice' ? 'Выбор' : 'Текст'}</span>
                  </div>
                  <div className="anketa-q-actions">
                    <button onClick={() => handleToggle(q)} title={q.is_active ? 'Выключить' : 'Включить'}>
                      {q.is_active ? <ToggleRight size={18} color="var(--color-orange)" /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => setDeleteConfirm(q.id)} title="Удалить"><Trash2 size={14} /></button>
                  </div>
                </div>
                {q.question_type === 'choice' && q.options && (
                  <div className="anketa-q-options">
                    {q.options.map((opt, i) => <span key={i} className="anketa-q-option-chip">{opt}</span>)}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add new question */}
      <div className="anketa-add-block">
        <input className="anketa-q-input" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Текст нового вопроса..." onKeyDown={e => e.key === 'Enter' && newType === 'text' && handleAdd()} />
        <div className="anketa-q-type-row">
          <AnketaTypeDropdown value={newType} onChange={setNewType} options={TYPE_OPTIONS} />
          {newType === 'choice' && (
            <input className="anketa-q-input" value={newOptions} onChange={e => setNewOptions(e.target.value)} placeholder="Вариант 1, Вариант 2, ..." />
          )}
          <button className="anketa-q-add-btn" onClick={handleAdd} disabled={adding || !newText.trim()}>
            {adding ? <Loader size={14} className="sc-spinner" /> : <Plus size={14} />} Добавить
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="anketa-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="anketa-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="anketa-confirm-title">Удалить вопрос?</div>
            <div className="anketa-confirm-text">Вопрос будет удалён из анкеты без возможности восстановления</div>
            <div className="anketa-confirm-actions">
              <button className="anketa-confirm-cancel" onClick={() => setDeleteConfirm(null)}>Отмена</button>
              <button className="anketa-confirm-delete" onClick={() => handleDelete(deleteConfirm)}><Trash2 size={13} /> Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NodeEditorPanel({
  screenId, editData, allScreens, isCustom,
  onUpdateMessage, onUpdateMessageMedia, onUpdateButtonLabel, onUpdateButtonAction,
  onUpdateButtonTarget, onMoveButton, onReorderButtons, onAddButton, onDeleteButton,
  onDeleteScreen, onClose, onSave, dirty, saving, saved,
}) {

  const [uploadingMedia, setUploadingMedia] = useState(null);
  const fileInputRefs = useRef({});

  if (!editData) return null;

  const messageKeys = Object.keys(editData.messages || {}).filter(k => !(screenId === 'event_anketa' && k === 'anketa_question_prompt'));
  const buttonOrder = editData.buttons?._order || [];

  // Build list of screens for the dropdown (exclude entry points)
  const screenOptions = Object.entries(allScreens)
    .filter(([id]) => !ENTRY_POINTS.has(id))
    .map(([id, s]) => ({
      id,
      title: `${SCREEN_ICONS[id] || '📄'} ${s.title}`,
    }));

  const isConnectionsLocked = LOCKED_CONNECTIONS.has(screenId);

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

  const handleMediaUpload = async (key, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingMedia(key);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await api.post('/api/upload', { data: reader.result });
          const data = await res.json();
          if (data.url) {
            onUpdateMessageMedia(key, { url: data.url, type: 'photo' });
          }
        } catch (e) {
          console.error('Upload failed:', e);
        } finally {
          setUploadingMedia(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error('Read failed:', e);
      setUploadingMedia(null);
    }
  };

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

      {/* Anketa Questions — FIRST, only for event_anketa screen */}
      {screenId === 'event_anketa' && <AnketaQuestionManager />}

      {/* Read-only notice */}
      {editData.readOnly && (
        <div className="sc-readonly-notice">
          <Eye size={16} />
          <span>{editData.description || 'Этот блок нельзя редактировать здесь'}</span>
        </div>
      )}

      {/* Messages */}
      {messageKeys.length > 0 && !editData.readOnly && (
        <div className="sc-section">
          <h3 className="sc-section-title"><MessageSquare size={16} /> Сообщения</h3>
          {messageKeys.map(key => {
            const msg = editData.messages[key];
            return (
              <div key={key} className="sc-message-block">
                <label className="sc-message-label">{msg.label}</label>
                <TgHtmlEditor
                  value={msg.text}
                  onChange={val => onUpdateMessage(key, val)}
                  placeholder="Текст сообщения..."
                />
                <div className="sc-media-section">
                  {msg.media?.url ? (
                    <div className="sc-media-preview">
                      <img src={msg.media.url} alt="media" />
                      <button
                        className="sc-media-remove-btn"
                        onClick={() => onUpdateMessageMedia(key, null)}
                        title="Удалить фото"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        ref={el => { fileInputRefs.current[key] = el; }}
                        onChange={e => {
                          handleMediaUpload(key, e.target.files[0]);
                          e.target.value = '';
                        }}
                      />
                      <button
                        className="sc-media-upload-btn"
                        onClick={() => fileInputRefs.current[key]?.click()}
                        disabled={uploadingMedia === key}
                      >
                        {uploadingMedia === key
                          ? <><Loader size={14} className="sc-spinner" /> Загрузка...</>
                          : <><ImageIcon size={14} /> Прикрепить фото</>
                        }
                      </button>
                    </>
                  )}
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
                    <div className="node-editor-mode-toggle">
                      <button
                        className={`node-editor-mode-btn ${!isUrl ? 'active' : ''}`}
                        onClick={() => {
                          if (isUrl) {
                            onUpdateButtonAction(key, 'callback:noop');
                          }
                        }}
                        title="Ссылка на блок"
                        type="button"
                      >
                        <Link size={12} /> Блок
                      </button>
                      <button
                        className={`node-editor-mode-btn ${isUrl ? 'active' : ''}`}
                        onClick={() => {
                          if (!isUrl) {
                            onUpdateButtonAction(key, 'url:');
                            onUpdateButtonTarget(key, '');
                          }
                        }}
                        title="URL ссылка"
                        type="button"
                      >
                        <ExternalLink size={12} /> URL
                      </button>
                    </div>
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
                          disabled={isConnectionsLocked || btn.locked}
                          title={isConnectionsLocked ? 'Связи этого блока нельзя менять' : ''}
                        >
                          <option value="">— Действие без перехода —</option>
                          {screenOptions.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.title}</option>
                          ))}
                        </select>
                        {isConnectionsLocked && <span className="node-editor-locked-hint">🔒</span>}
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
