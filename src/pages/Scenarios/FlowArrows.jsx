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
  // anketa nodes with text_input / subscription_check / finish render an extra pseudo-button row
  const extraRows = (screen.scenario === 5 &&
    (screen.stepType === 'text_input' ||
     screen.stepType === 'subscription_check' ||
     screen.stepType === 'finish')) ? 1 : 0;
  // answerKey row adds ~18px
  const answerKeyH = (screen.scenario === 5 && screen.answerKey) ? 18 : 0;
  return NODE_HEADER_H + answerKeyH + previewH + 8 + (btnCount + extraRows) * BTN_ROW_H + 10;
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
  const drawnPairs = new Set(); // track srcId->targetScreen to deduplicate

  // Loop-back arrows used by bot logic but visually noisy on the flow chart
  const HIDDEN_LOOPBACKS = new Set([
    'event_site_wait->event_site_status',
  ]);

  for (const [srcId, screen] of Object.entries(screens)) {
    const order = screen.buttons?._order || [];
    const srcX = screen.x ?? 0;
    const srcY = screen.y ?? 0;
    const srcH = getNodeHeight(screen);

    order.forEach((btnKey, btnIdx) => {
      const btn = screen.buttons[btnKey];
      if (!btn?.targetScreen || !screens[btn.targetScreen]) return;
      // Skip self-referencing arrows
      if (btn.targetScreen === srcId) return;
      // logout_screen is hidden in canvas — don't draw arrows toward it
      if (btn.targetScreen === 'logout_screen') return;
      if (HIDDEN_LOOPBACKS.has(`${srcId}->${btn.targetScreen}`)) return;

      const labelLower = (btn.label || '').toLowerCase();
      const actionLower = (btn.action || '').toLowerCase();
      const isBackButton =
        labelLower.includes('назад') ||
        labelLower.includes('вернуться') ||
        (labelLower.includes('меню') && btnKey.includes('back')) ||
        /(_back\b|back_to_|back_menu)/.test(actionLower);
      if (isBackButton) return;

      // Deduplicate: only draw one arrow per src→target pair
      const pairKey = `${srcId}->${btn.targetScreen}`;
      if (drawnPairs.has(pairKey)) return;
      drawnPairs.add(pairKey);

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

      // Target always lands at the top anchor (matches the visual top dot)
      tx = tgtX + NODE_W / 2;
      ty = tgtY;

      if (absDx > absDy * 0.6) {
        // Source exits from the side of the button row
        if (dx > 0) {
          sx = srcX + NODE_W; sy = btnCenterY;
        } else {
          sx = srcX; sy = btnCenterY;
        }
        const cpOffX = Math.max(60, absDx * 0.4);
        const cpOffY = Math.max(60, Math.abs(ty - sy) * 0.4);
        cp1x = sx + (dx > 0 ? cpOffX : -cpOffX); cp1y = sy;
        cp2x = tx; cp2y = ty - cpOffY;
      } else {
        // Source above or below — vertical exit
        if (dy > 0) {
          sx = srcX + NODE_W / 2; sy = srcY + srcH;
          const cpOff = Math.max(60, absDy * 0.4);
          cp1x = sx; cp1y = sy + cpOff; cp2x = tx; cp2y = ty - cpOff;
        } else {
          sx = srcX + NODE_W / 2; sy = srcY;
          // Target is above source; land at bottom of target instead
          ty = tgtY + tgtH;
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
        label: btn.label || '',
      });
    });

    // Draw arrow for text_input / subscription_check anketa nextScreen
    if (
      screen.nextScreen &&
      screens[screen.nextScreen] &&
      screen.nextScreen !== srcId &&
      screen.nextScreen !== 'logout_screen' &&
      !drawnPairs.has(`${srcId}->${screen.nextScreen}`)
    ) {
      drawnPairs.add(`${srcId}->${screen.nextScreen}`);
      const target = screens[screen.nextScreen];
      const tgtX = target.x ?? 0;
      const tgtY = target.y ?? 0;
      const tgtH = getNodeHeight(target);

      const srcPreviewH = getPreviewHeight(screen);
      const btnCount = order.length;
      // Only anketa text_input / subscription_check render a visual pseudo-button row.
      // For other screens (e.g. event_email_prompt) source must come from the actual node bottom.
      const hasPseudoBtnRow = screen.scenario === 5 &&
        (screen.stepType === 'text_input' || screen.stepType === 'subscription_check');
      const pseudoBtnY = hasPseudoBtnRow
        ? srcY + NODE_HEADER_H + srcPreviewH + 8 + btnCount * BTN_ROW_H + BTN_ROW_H / 2
        : srcY + srcH;

      const dx = (tgtX + NODE_W / 2) - (srcX + NODE_W / 2);
      const absDx = Math.abs(dx);
      const dy2 = (tgtY + tgtH / 2) - pseudoBtnY;
      const absDy = Math.abs(dy2);

      let sx2, sy2, tx2, ty2, cp1x2, cp1y2, cp2x2, cp2y2;
      tx2 = tgtX + NODE_W / 2;
      ty2 = tgtY;

      if (absDx > absDy * 0.6 && hasPseudoBtnRow) {
        // Side exit only when there's a real pseudo-button row to anchor to
        if (dx > 0) {
          sx2 = srcX + NODE_W; sy2 = pseudoBtnY;
        } else {
          sx2 = srcX; sy2 = pseudoBtnY;
        }
        const cpOffX = Math.max(60, absDx * 0.4);
        const cpOffY = Math.max(60, Math.abs(ty2 - sy2) * 0.4);
        cp1x2 = sx2 + (dx > 0 ? cpOffX : -cpOffX); cp1y2 = sy2;
        cp2x2 = tx2; cp2y2 = ty2 - cpOffY;
      } else {
        if (dy2 > 0) {
          sx2 = srcX + NODE_W / 2; sy2 = srcY + srcH;
          const cpOff = Math.max(60, absDy * 0.4);
          cp1x2 = sx2; cp1y2 = sy2 + cpOff; cp2x2 = tx2; cp2y2 = ty2 - cpOff;
        } else {
          sx2 = srcX + NODE_W / 2; sy2 = srcY;
          ty2 = tgtY + tgtH;
          const cpOff = Math.max(60, absDy * 0.4);
          cp1x2 = sx2; cp1y2 = sy2 - cpOff; cp2x2 = tx2; cp2y2 = ty2 + cpOff;
        }
      }

      const arrowKey2 = `${srcId}-__next__`;
      const bend2 = bendOffsets?.[arrowKey2] || { x: 0, y: 0 };
      cp1x2 += bend2.x; cp1y2 += bend2.y;
      cp2x2 += bend2.x; cp2y2 += bend2.y;

      const isHL = srcId === activeScreen || screen.nextScreen === activeScreen ||
                   (hoveredNode && (srcId === hoveredNode || screen.nextScreen === hoveredNode));
      const mid2 = bezierPoint(sx2, sy2, cp1x2, cp1y2, cp2x2, cp2y2, tx2, ty2, 0.5);
      const angle2 = bezierAngle(sx2, sy2, cp1x2, cp1y2, cp2x2, cp2y2, tx2, ty2, 0.5);

      arrows.push({
        key: arrowKey2,
        d: `M ${sx2},${sy2} C ${cp1x2},${cp1y2} ${cp2x2},${cp2y2} ${tx2},${ty2}`,
        highlighted: isHL, mid: mid2, angle: angle2, sx: sx2, sy: sy2, tx: tx2, ty: ty2,
      });
    }
  }

  return (
    <g>
      {arrows.map(({ key, d, highlighted, mid, angle, sx, sy, tx, ty, label }) => (
        <g key={key}>
          {/* Invisible thick path for easy hover/click */}
          <path
            className="arrow-hitarea"
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
            style={{ cursor: 'pointer' }}
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
          {/* Draggable control point — always visible, bigger on hover */}
          <circle
            className="arrow-bendpoint"
            cx={mid.x}
            cy={mid.y}
            r={(hovered === key || dragging === key) ? 8 : 4}
            fill="var(--color-orange)"
            stroke={(hovered === key || dragging === key) ? '#fff' : 'none'}
            strokeWidth={2}
            opacity={(hovered === key || dragging === key) ? 1 : 0.4}
            style={{ cursor: 'grab', transition: 'r 0.15s, opacity 0.15s' }}
            onMouseDown={(e) => handleMouseDown(key, e)}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => { if (!dragging) setHovered(null); }}
          />
        </g>
      ))}
    </g>
  );
}
