import { useRef, useCallback, useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { sanitizeHtml } from '../../utils/sanitize.js';

const SCREEN_ICONS = {
  start_menu: '👋', registration_flow: '📝', auth_flow: '🔐',
  main_menu: '🏠', offer_page: '📋', promo_page: '🎨',
  socials_page: '📱', event_flow: '🎪', logout_screen: '🚪',
  group_menu: '💬', group_promo: '📢', group_calendar: '📅',
  group_landings: '🌐', group_kb: '📚',
};

// System screens that cannot be deleted
const SYSTEM_SCREENS = new Set([
  'start_menu', 'registration_flow', 'auth_flow', 'main_menu',
  'offer_page', 'promo_page', 'socials_page', 'event_flow', 'logout_screen',
]);

// Convert Telegram HTML to safe preview HTML
function tgHtmlToPreview(html) {
  if (!html) return '';
  return html
    // Custom emoji → inline image
    .replace(/<tg-emoji\s+emoji-id="(\d+)">[^<]*<\/tg-emoji>/g,
      '<img src="/emoji/$1.webp" class="flow-preview-emoji" />')
    // Keep safe tags
    .replace(/<\/?(b|strong|i|em|code|u|s)>/gi, (m) => m)
    // Convert \n to <br>
    .replace(/\n/g, '<br/>')
    // Strip all other tags except allowed
    .replace(/<(?!\/?(?:b|strong|i|em|code|u|s|br|img)\b)[^>]+>/gi, '')
    .trim();
}

// Exported constants for FlowArrows to use
export const NODE_W = 280;
export const NODE_HEADER_H = 52;
export const MSG_PREVIEW_H = 48;
export const BTN_ROW_H = 36;
export const NODE_PAD_BOTTOM = 10;

export default function FlowNode({
  screenId, screen, position, isActive, isSearchMatch, isConnected, isHovered, isHighlighted,
  onSelect, onMove, onMoveEnd, onDuplicate, onDelete, onHover, zoom,
}) {
  const dragRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...position };
    let moved = false;

    const onMouseMove = (ev) => {
      const z = zoom || 1;
      const dx = (ev.clientX - startX) / z;
      const dy = (ev.clientY - startY) / z;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (moved) {
        onMove(screenId, { x: startPos.x + dx, y: startPos.y + dy });
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!moved) onSelect(screenId);
      else onMoveEnd?.(screenId);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [screenId, position, onSelect, onMove, onMoveEnd, zoom]);

  // Context menu (right click)
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleDuplicate = () => {
    setContextMenu(null);
    onDuplicate?.(screenId);
  };

  const handleDelete = () => {
    setContextMenu(null);
    onDelete?.(screenId);
  };

  const buttonOrder = screen.buttons?._order || [];
  const anketaIcons = { text_input: '✏️', choice: '🔘', subscription_check: '🔔', finish: '🏁' };
  const icon = screen.scenario === 5 ? (anketaIcons[screen.stepType] || '🔘') : (SCREEN_ICONS[screenId] || '📄');
  const isAnketa = screen.scenario === 5;

  // Get first message text for preview
  const messages = screen.messages || {};
  const firstMsgKey = Object.keys(messages)[0];
  const previewHtml = firstMsgKey ? tgHtmlToPreview(messages[firstMsgKey].text) : '';

  const classNames = [
    'flow-node',
    isActive ? 'active' : '',
    isSearchMatch ? 'search-match' : '',
    isConnected ? 'connected' : '',
    isHovered ? 'hovered' : '',
    isHighlighted ? 'highlighted' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        ref={dragRef}
        className={classNames}
        style={{ left: position.x, top: position.y }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => onHover?.(screenId)}
        onMouseLeave={() => onHover?.(null)}
      >
        {/* Top anchor dot (incoming arrows land here) */}
        <div className="flow-node-anchor flow-node-anchor-top" />

        <div className="flow-node-header">
          <span className="flow-node-icon">{icon}</span>
          <span className="flow-node-title">{screen.title}</span>
          {isAnketa && <span className="flow-node-anketa-badge">анкета</span>}
        </div>
        {isAnketa && screen.answerKey && (
          <div className="flow-node-answer-key">🔑 {screen.answerKey}</div>
        )}
        {previewHtml && (
          <div className="flow-node-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }} />
        )}
        {buttonOrder.length > 0 && (
          <div className="flow-node-buttons">
            {buttonOrder.map((key) => {
              const btn = screen.buttons[key];
              if (!btn) return null;
              const isUrl = btn.action?.startsWith('url:');
              const hasTarget = !!btn.targetScreen;
              return (
                <div key={key} className={`flow-node-btn ${isUrl ? 'url' : 'callback'}`} data-btn-key={key}>
                  <span className="flow-node-btn-label">{btn.label}</span>
                  {isUrl && <ExternalLink size={12} />}
                  {/* Bottom anchor dot for outgoing arrows */}
                  {hasTarget && <div className="flow-node-anchor flow-node-anchor-btn" />}
                </div>
              );
            })}
          </div>
        )}
        {/* Text input anketa: show input indicator + nextScreen arrow */}
        {isAnketa && screen.stepType === 'text_input' && (
          <div className="flow-node-buttons">
            <div className="flow-node-btn flow-node-btn-text-input" data-btn-key="__next__">
              <span className="flow-node-btn-label">✏️ Ввод текста → далее</span>
              {screen.nextScreen && <div className="flow-node-anchor flow-node-anchor-btn" />}
            </div>
          </div>
        )}
        {/* Subscription check: show nextScreen arrow for success path */}
        {isAnketa && screen.stepType === 'subscription_check' && screen.nextScreen && (
          <div className="flow-node-buttons">
            <div className="flow-node-btn flow-node-btn-text-input" data-btn-key="__next__">
              <span className="flow-node-btn-label">✅ Подписка ОК → далее</span>
              <div className="flow-node-anchor flow-node-anchor-btn" />
            </div>
          </div>
        )}
        {/* Finish step badge */}
        {isAnketa && screen.stepType === 'finish' && (
          <div className="flow-node-buttons">
            <div className="flow-node-btn flow-node-btn-text-input">
              <span className="flow-node-btn-label">🏁 Отправка QR кода</span>
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="flow-node-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
        >
          <button className="flow-node-context-item" onClick={handleDuplicate}>
            Дублировать
          </button>
          {!SYSTEM_SCREENS.has(screenId) && (
            <button className="flow-node-context-item flow-node-context-item-danger" onClick={handleDelete}>
              Удалить
            </button>
          )}
        </div>
      )}
    </>
  );
}
