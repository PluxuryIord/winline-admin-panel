import { useState, useCallback } from 'react';
import { NODE_W, NODE_HEADER_H, BTN_ROW_H } from './FlowNode';

function bezierPoint(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, t) {
  const u = 1 - t;
  const x = u*u*u*sx + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*tx;
  const y = u*u*u*sy + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*ty;
  return { x, y };
}

function bezierAngle(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, t) {
  const u = 1 - t;
  const dx = 3*u*u*(cp1x-sx) + 6*u*t*(cp2x-cp1x) + 3*t*t*(tx-cp2x);
  const dy = 3*u*u*(cp1y-sy) + 6*u*t*(cp2y-cp1y) + 3*t*t*(ty-cp2y);
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function getPreviewHeight(screen) {
  const msgs = screen.messages || {};
  const firstKey = Object.keys(msgs)[0];
  if (!firstKey || !msgs[firstKey].text) return 0;
  const text = msgs[firstKey].text.replace(/<[^>]+>/g, '').replace(/\n/g, ' ');
  const lines = Math.max(1, Math.ceil(text.length / 40));
  return 14 + lines * 14;
}

function getNodeHeight(screen) {
  const btnCount = (screen.buttons?._order || []).length;
  const previewH = getPreviewHeight(screen);
  return NODE_HEADER_H + previewH + 8 + btnCount * BTN_ROW_H + 10;
}

export default function FlowArrows({ screens, activeScreen, hoveredNode, bendOffsets, onBendChange, zoom }) {
  const [dragging, setDragging] = useState(null);
  const [hovered, setHovered] = useState(null);

  const handleMouseDown = useCallback((key, e) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(key);

    const startX = e.clientX;
    const startY = e.clientY;
    const startBend = bendOffsets?.[key] || { x: 0, y: 0 };
    const z = zoom || 1;

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / z;
      const dy = (ev.clientY - startY) / z;
      onBendChange?.(key, { x: startBend.x + dx, y: startBend.y + dy });
    };

    const onUp = () => {
      setDragging(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [bendOffsets, onBendChange, zoom]);

  const arrows = [];

  for (const [srcId, screen] of Object.entries(screens)) {
    const order = screen.buttons?._order || [];
    const srcX = screen.x ?? 0;
    const srcY = screen.y ?? 0;
    const srcH = getNodeHeight(screen);

    order.forEach((btnKey, btnIdx) => {
      const btn = screen.buttons[btnKey];
      if (!btn?.targetScreen || !screens[btn.targetScreen]) return;

      if (btn.label?.includes('Назад') || btn.label?.includes('Меню') && btnKey.includes('back')) return;

      const target = screens[btn.targetScreen];
      const tgtX = target.x ?? 0;
      const tgtY = target.y ?? 0;
      const tgtH = getNodeHeight(target);

      const srcPreviewH = getPreviewHeight(screen);
      const btnCenterY = srcY + NODE_HEADER_H + srcPreviewH + 8 + btnIdx * BTN_ROW_H + BTN_ROW_H / 2;

      const dx = (tgtX + NODE_W / 2) - (srcX + NODE_W / 2);
      const dy = (tgtY + tgtH / 2) - btnCenterY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      let sx, sy, tx, ty, cp1x, cp1y, cp2x, cp2y;

      if (absDx > absDy * 0.6) {
        if (dx > 0) {
          sx = srcX + NODE_W; sy = btnCenterY;
          tx = tgtX; ty = tgtY + tgtH / 2;
          const cpOff = Math.max(60, absDx * 0.4);
          cp1x = sx + cpOff; cp1y = sy; cp2x = tx - cpOff; cp2y = ty;
        } else {
          sx = srcX; sy = btnCenterY;
          tx = tgtX + NODE_W; ty = tgtY + tgtH / 2;
          const cpOff = Math.max(60, absDx * 0.4);
          cp1x = sx - cpOff; cp1y = sy; cp2x = tx + cpOff; cp2y = ty;
        }
      } else {
        if (dy > 0) {
          sx = srcX + NODE_W / 2; sy = srcY + srcH;
          tx = tgtX + NODE_W / 2; ty = tgtY;
          const cpOff = Math.max(60, absDy * 0.4);
          cp1x = sx; cp1y = sy + cpOff; cp2x = tx; cp2y = ty - cpOff;
        } else {
          sx = srcX + NODE_W / 2; sy = srcY;
          tx = tgtX + NODE_W / 2; ty = tgtY + tgtH;
          const cpOff = Math.max(60, absDy * 0.4);
          cp1x = sx; cp1y = sy - cpOff; cp2x = tx; cp2y = ty + cpOff;
        }
      }

      // Apply bend offset
      const arrowKey = `${srcId}-${btnKey}`;
      const bend = bendOffsets?.[arrowKey] || { x: 0, y: 0 };
      cp1x += bend.x; cp1y += bend.y;
      cp2x += bend.x; cp2y += bend.y;

      const isHighlightedActive = srcId === activeScreen || btn.targetScreen === activeScreen;
      const isHighlightedHover = hoveredNode && (srcId === hoveredNode || btn.targetScreen === hoveredNode);
      const highlighted = isHighlightedActive || isHighlightedHover;

      const mid = bezierPoint(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, 0.5);
      const angle = bezierAngle(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, 0.5);

      arrows.push({
        key: arrowKey,
        d: `M ${sx},${sy} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`,
        highlighted, mid, angle, sx, sy, tx, ty,
      });
    });
  }

  return (
    <g>
      {arrows.map(({ key, d, highlighted, mid, angle, sx, sy, tx, ty }) => (
        <g key={key}>
          {/* Invisible thick path for easy hover/click */}
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => { if (!dragging) setHovered(null); }}
          />
          {/* Visible path */}
          <path
            d={d}
            fill="none"
            stroke={highlighted ? 'rgba(255,126,0,0.8)' : 'rgba(255,126,0,0.3)'}
            strokeWidth={highlighted ? 3 : 2.5}
          />
          {/* Arrow head */}
          <polygon
            points="-8,-6 8,0 -8,6"
            fill={highlighted ? 'rgba(255,126,0,1)' : 'rgba(255,126,0,0.5)'}
            transform={`translate(${mid.x},${mid.y}) rotate(${angle})`}
          />
          {/* Start/end dots */}
          <circle cx={sx} cy={sy} r={4}
            fill={highlighted ? 'var(--color-orange)' : 'rgba(255,126,0,0.4)'} />
          <circle cx={tx} cy={ty} r={4}
            fill={highlighted ? 'var(--color-orange)' : 'rgba(255,126,0,0.4)'} />
          {/* Draggable control point — visible on hover */}
          {(hovered === key || dragging === key) && (
            <circle
              cx={mid.x}
              cy={mid.y}
              r={7}
              fill="var(--color-orange)"
              stroke="#fff"
              strokeWidth={2}
              style={{ cursor: 'grab', pointerEvents: 'all' }}
              onMouseDown={(e) => handleMouseDown(key, e)}
            />
          )}
        </g>
      ))}
    </g>
  );
}
