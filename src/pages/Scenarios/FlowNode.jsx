import { useRef, useCallback } from 'react';
import { ExternalLink } from 'lucide-react';

const SCREEN_ICONS = {
  start_menu: '👋', registration_flow: '📝', auth_flow: '🔐',
  main_menu: '🏠', offer_page: '📋', promo_page: '🎨',
  socials_page: '📱', event_flow: '🎪', logout_screen: '🚪',
};

export default function FlowNode({ screenId, screen, position, isActive, onSelect, onMove }) {
  const dragRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...position };
    let moved = false;

    const onMouseMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (moved) {
        onMove(screenId, { x: startPos.x + dx, y: startPos.y + dy });
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!moved) onSelect(screenId);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [screenId, position, onSelect, onMove]);

  const buttonOrder = screen.buttons?._order || [];
  const icon = SCREEN_ICONS[screenId] || '📄';

  return (
    <div
      ref={dragRef}
      className={`flow-node ${isActive ? 'active' : ''}`}
      style={{ left: position.x, top: position.y }}
      onMouseDown={handleMouseDown}
    >
      <div className="flow-node-header">
        <span className="flow-node-icon">{icon}</span>
        <span className="flow-node-title">{screen.title}</span>
      </div>
      {buttonOrder.length > 0 && (
        <div className="flow-node-buttons">
          {buttonOrder.map((key) => {
            const btn = screen.buttons[key];
            if (!btn) return null;
            const isUrl = btn.action?.startsWith('url:');
            return (
              <div key={key} className="flow-node-btn" data-btn-key={key}>
                <span className={`flow-node-btn-dot ${isUrl ? 'url' : 'callback'}`} />
                <span className="flow-node-btn-label">{btn.label}</span>
                {isUrl && <ExternalLink size={10} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
