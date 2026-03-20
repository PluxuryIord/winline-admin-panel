import { useState, useEffect, useCallback } from 'react';
import {
  Save, ChevronUp, ChevronDown, MessageSquare, MousePointer,
  Loader, Check, ExternalLink,
} from 'lucide-react';
import { api } from '../../utils/api';
import './BotScenarios.css';

const SCREEN_ICONS = {
  start_menu: '👋',
  registration_flow: '📝',
  auth_flow: '🔐',
  main_menu: '🏠',
  offer_page: '📋',
  promo_page: '🎨',
  socials_page: '📱',
  event_flow: '🎪',
  logout_screen: '🚪',
};

export default function BotScenarios() {
  const [scenarios, setScenarios] = useState(null);
  const [activeScreen, setActiveScreen] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  // Load scenarios
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let res = await api.get('/api/scenarios');
      let data = await res.json();

      // Auto-seed if empty
      if (!data.screens || Object.keys(data.screens).length === 0) {
        await api.post('/api/scenarios/seed');
        res = await api.get('/api/scenarios');
        data = await res.json();
      }

      setScenarios(data);
      const screenIds = Object.keys(data.screens || {});
      if (screenIds.length > 0 && !activeScreen) {
        setActiveScreen(screenIds[0]);
        setEditData(JSON.parse(JSON.stringify(data.screens[screenIds[0]])));
      }
    } catch (e) {
      console.error('Failed to load scenarios:', e);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { loadData(); }, [loadData]);

  // Select screen
  const selectScreen = (screenId) => {
    if (dirty && !confirm('Есть несохранённые изменения. Переключить экран?')) return;
    setActiveScreen(screenId);
    setEditData(JSON.parse(JSON.stringify(scenarios.screens[screenId])));
    setDirty(false);
    setSaved(false);
  };

  // Edit message text
  const updateMessage = (key, text) => {
    setEditData(prev => {
      const next = { ...prev, messages: { ...prev.messages } };
      next.messages[key] = { ...next.messages[key], text };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  // Edit button label
  const updateButtonLabel = (key, label) => {
    setEditData(prev => {
      const next = { ...prev, buttons: { ...prev.buttons } };
      next.buttons[key] = { ...next.buttons[key], label };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  // Move button up/down
  const moveButton = (key, direction) => {
    setEditData(prev => {
      const order = [...(prev.buttons._order || [])];
      const idx = order.indexOf(key);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= order.length) return prev;
      [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
      return { ...prev, buttons: { ...prev.buttons, _order: order } };
    });
    setDirty(true);
    setSaved(false);
  };

  // Save
  const handleSave = async () => {
    if (!activeScreen || !editData) return;
    setSaving(true);
    try {
      const updated = { ...scenarios };
      updated.screens[activeScreen] = editData;
      await api.put('/api/scenarios', updated);
      setScenarios(updated);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="sc-loading"><Loader size={24} className="sc-spinner" /> Загрузка сценариев...</div>;
  if (!scenarios) return <div className="sc-loading">Не удалось загрузить</div>;

  const screenIds = Object.keys(scenarios.screens);
  const messageKeys = editData ? Object.keys(editData.messages || {}) : [];
  const buttonOrder = editData?.buttons?._order || [];

  return (
    <div className="sc-container">
      {/* Sidebar */}
      <div className="sc-sidebar">
        <h2 className="sc-sidebar-title">Экраны бота</h2>
        <div className="sc-screen-list">
          {screenIds.map(id => {
            const screen = scenarios.screens[id];
            const isActive = id === activeScreen;
            return (
              <button
                key={id}
                className={`sc-screen-item ${isActive ? 'active' : ''}`}
                onClick={() => selectScreen(id)}
              >
                <span className="sc-screen-icon">{SCREEN_ICONS[id] || '📄'}</span>
                <div className="sc-screen-info">
                  <span className="sc-screen-name">{screen.title}</span>
                  <span className="sc-screen-desc">{screen.description}</span>
                </div>
                {isActive && dirty && <span className="sc-unsaved-dot" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div className="sc-editor">
        {editData ? (
          <>
            <div className="sc-editor-header">
              <div>
                <h2>{SCREEN_ICONS[activeScreen] || '📄'} {editData.title}</h2>
                <p>{editData.description}</p>
              </div>
              <button
                className={`sc-save-btn ${saved ? 'saved' : ''}`}
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saved ? <><Check size={16} /> Сохранено</> : saving ? <><Loader size={16} className="sc-spinner" /> Сохранение...</> : <><Save size={16} /> Сохранить</>}
              </button>
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
                        onChange={e => updateMessage(key, e.target.value)}
                        rows={Math.max(3, (msg.text.match(/\n/g) || []).length + 2)}
                      />
                      <span className="sc-message-hint">HTML-формат Telegram: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;, &lt;code&gt;</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Buttons */}
            {buttonOrder.length > 0 && (
              <div className="sc-section">
                <h3 className="sc-section-title"><MousePointer size={16} /> Кнопки</h3>
                <div className="sc-buttons-list">
                  {buttonOrder.map((key, idx) => {
                    const btn = editData.buttons[key];
                    if (!btn) return null;
                    const actionType = btn.action.split(':')[0];
                    const actionTarget = btn.action.split(':').slice(1).join(':');
                    return (
                      <div key={key} className="sc-button-row">
                        <div className="sc-button-arrows">
                          <button
                            className="sc-arrow-btn"
                            onClick={() => moveButton(key, -1)}
                            disabled={idx === 0}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            className="sc-arrow-btn"
                            onClick={() => moveButton(key, 1)}
                            disabled={idx === buttonOrder.length - 1}
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                        <input
                          className="sc-button-input"
                          value={btn.label}
                          onChange={e => updateButtonLabel(key, e.target.value)}
                        />
                        <span className={`sc-action-badge ${actionType}`}>
                          {actionType === 'url' ? <><ExternalLink size={12} /> ссылка</> : actionType}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {messageKeys.length === 0 && buttonOrder.length === 0 && (
              <div className="sc-empty">Этот экран пуст</div>
            )}
          </>
        ) : (
          <div className="sc-empty">Выберите экран слева</div>
        )}
      </div>
    </div>
  );
}
