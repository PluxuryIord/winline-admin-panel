import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Check, X, Edit2, Save } from 'lucide-react';
import { api } from '../../utils/api';

export default function EventAnketaQuestions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ question_text: '', question_type: 'text', options: [] });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/scenarios/event-questions');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (q) => {
    setEditId(q.id);
    setDraft({
      question_text: q.question_text || '',
      question_type: q.question_type || 'text',
      options: Array.isArray(q.options) ? q.options : [],
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setAdding(false);
    setDraft({ question_text: '', question_type: 'text', options: [] });
  };

  const saveItem = async () => {
    if (!draft.question_text.trim()) return;
    const payload = {
      question_text: draft.question_text.trim(),
      question_type: draft.question_type,
      options: draft.question_type === 'choice' ? draft.options.filter(o => o.trim()) : null,
    };
    try {
      if (adding) {
        await api.post('/api/scenarios/event-questions', { ...payload, order: items.length });
      } else {
        await api.put(`/api/scenarios/event-questions/${editId}`, payload);
      }
      cancelEdit();
      load();
    } catch { /* ignore */ }
  };

  const remove = async (id) => {
    if (!confirm('Удалить вопрос?')) return;
    try {
      await api.delete(`/api/scenarios/event-questions/${id}`);
      load();
    } catch { /* ignore */ }
  };

  const toggleActive = async (q) => {
    try {
      await api.put(`/api/scenarios/event-questions/${q.id}`, { is_active: !q.is_active });
      load();
    } catch { /* ignore */ }
  };

  const move = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    const ids = items.map(i => i.id);
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    try {
      await api.put('/api/scenarios/event-questions-order/reorder', { ids });
      load();
    } catch { /* ignore */ }
  };

  const addOption = () => setDraft(d => ({ ...d, options: [...d.options, ''] }));
  const updateOption = (i, v) => setDraft(d => {
    const next = [...d.options]; next[i] = v; return { ...d, options: next };
  });
  const removeOption = (i) => setDraft(d => ({ ...d, options: d.options.filter((_, idx) => idx !== i) }));

  const renderForm = () => (
    <div className="eaq-form">
      <input
        className="eaq-input"
        type="text"
        placeholder="Текст вопроса"
        value={draft.question_text}
        onChange={e => setDraft(d => ({ ...d, question_text: e.target.value }))}
        autoFocus
      />
      <div className="eaq-type-toggle">
        <button
          className={`eaq-type-btn ${draft.question_type === 'text' ? 'active' : ''}`}
          onClick={() => setDraft(d => ({ ...d, question_type: 'text' }))}
          type="button"
        >Свободный ответ</button>
        <button
          className={`eaq-type-btn ${draft.question_type === 'choice' ? 'active' : ''}`}
          onClick={() => setDraft(d => ({ ...d, question_type: 'choice', options: d.options.length ? d.options : [''] }))}
          type="button"
        >Варианты</button>
      </div>
      {draft.question_type === 'choice' && (
        <div className="eaq-options">
          {draft.options.map((opt, i) => (
            <div key={i} className="eaq-option-row">
              <input
                className="eaq-input eaq-option-input"
                type="text"
                placeholder={`Вариант ${i + 1}`}
                value={opt}
                onChange={e => updateOption(i, e.target.value)}
              />
              <button className="eaq-icon-btn eaq-icon-btn--danger" onClick={() => removeOption(i)} type="button">
                <X size={12} />
              </button>
            </div>
          ))}
          <button className="eaq-add-option" onClick={addOption} type="button">
            <Plus size={12} /> Добавить вариант
          </button>
        </div>
      )}
      <div className="eaq-form-actions">
        <button className="eaq-btn eaq-btn--primary" onClick={saveItem} type="button">
          <Save size={12} /> Сохранить
        </button>
        <button className="eaq-btn" onClick={cancelEdit} type="button">Отмена</button>
      </div>
    </div>
  );

  return (
    <div className="sc-section eaq-section">
      <div className="sc-section-header">
        <h3 className="sc-section-title">📝 Вопросы анкеты</h3>
        {!adding && editId === null && (
          <button className="sc-add-btn" onClick={() => { setAdding(true); setDraft({ question_text: '', question_type: 'text', options: [] }); }}>
            <Plus size={14} /> Добавить
          </button>
        )}
      </div>

      {loading ? (
        <div className="eaq-empty">Загрузка...</div>
      ) : (
        <>
          {adding && renderForm()}
          {items.length === 0 && !adding && (
            <div className="eaq-empty">Вопросов пока нет. Нажмите «Добавить».</div>
          )}
          <div className="eaq-list">
            {items.map((q, idx) => (
              <div key={q.id} className={`eaq-item ${q.is_active ? '' : 'eaq-item--inactive'}`}>
                {editId === q.id ? (
                  renderForm()
                ) : (
                  <>
                    <div className="eaq-item-head">
                      <div className="eaq-order-btns">
                        <button className="eaq-icon-btn" disabled={idx === 0} onClick={() => move(idx, -1)} title="Вверх">
                          <ChevronUp size={12} />
                        </button>
                        <button className="eaq-icon-btn" disabled={idx === items.length - 1} onClick={() => move(idx, 1)} title="Вниз">
                          <ChevronDown size={12} />
                        </button>
                      </div>
                      <span className="eaq-num">#{idx + 1}</span>
                      <span className="eaq-text">{q.question_text}</span>
                      <span className={`eaq-type-badge eaq-type-${q.question_type}`}>
                        {q.question_type === 'choice' ? 'варианты' : 'текст'}
                      </span>
                      <button
                        className={`eaq-icon-btn ${q.is_active ? 'eaq-icon-btn--active' : ''}`}
                        onClick={() => toggleActive(q)}
                        title={q.is_active ? 'Выключить' : 'Включить'}
                      >
                        <Check size={12} />
                      </button>
                      <button className="eaq-icon-btn" onClick={() => startEdit(q)} title="Редактировать">
                        <Edit2 size={12} />
                      </button>
                      <button className="eaq-icon-btn eaq-icon-btn--danger" onClick={() => remove(q.id)} title="Удалить">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {q.question_type === 'choice' && Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="eaq-opts-preview">
                        {q.options.map((o, i) => (
                          <span key={i} className="eaq-opt-chip">{o}</span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
