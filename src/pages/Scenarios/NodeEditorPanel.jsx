import {
  Save, X, ChevronUp, ChevronDown, MessageSquare, MousePointer,
  Loader, Check, ExternalLink, Link,
} from 'lucide-react';

const SCREEN_ICONS = {
  start_menu: '👋', registration_flow: '📝', auth_flow: '🔐',
  main_menu: '🏠', offer_page: '📋', promo_page: '🎨',
  socials_page: '📱', event_flow: '🎪', logout_screen: '🚪',
};

export default function NodeEditorPanel({
  screenId, editData, allScreens,
  onUpdateMessage, onUpdateButtonLabel, onUpdateButtonAction,
  onUpdateButtonTarget, onMoveButton,
  onClose, onSave, dirty, saving, saved,
}) {
  if (!editData) return null;

  const messageKeys = Object.keys(editData.messages || {});
  const buttonOrder = editData.buttons?._order || [];

  // Build list of screens for the dropdown
  const screenOptions = Object.entries(allScreens).map(([id, s]) => ({
    id,
    title: `${SCREEN_ICONS[id] || '📄'} ${s.title}`,
  }));

  return (
    <div className="node-editor-panel">
      <div className="node-editor-header">
        <div>
          <h2>{SCREEN_ICONS[screenId] || '📄'} {editData.title}</h2>
          <p>{editData.description}</p>
        </div>
        <div className="node-editor-actions">
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
                  ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                />
                <span className="sc-message-hint">HTML: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;, &lt;code&gt;</span>
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
              const isUrl = btn.action?.startsWith('url:');
              const urlValue = isUrl ? btn.action.slice(4) : '';

              return (
                <div key={key} className="node-editor-btn-block">
                  <div className="sc-button-row">
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
        </div>
      )}
    </div>
  );
}
