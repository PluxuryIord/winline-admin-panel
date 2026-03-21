import { NODE_W, NODE_HEADER_H, BTN_ROW_H, NODE_PAD_BOTTOM } from './FlowNode';

// Get point on cubic bezier at t (0..1)
function bezierPoint(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, t) {
  const u = 1 - t;
  const x = u*u*u*sx + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*tx;
  const y = u*u*u*sy + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*ty;
  return { x, y };
}

// Get tangent angle on cubic bezier at t
function bezierAngle(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, t) {
  const u = 1 - t;
  const dx = 3*u*u*(cp1x-sx) + 6*u*t*(cp2x-cp1x) + 3*t*t*(tx-cp2x);
  const dy = 3*u*u*(cp1y-sy) + 6*u*t*(cp2y-cp1y) + 3*t*t*(ty-cp2y);
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

// Returns SVG elements (no wrapping <svg>), parent provides <svg>
export default function FlowArrows({ screens, activeScreen }) {
  const arrows = [];

  for (const [srcId, screen] of Object.entries(screens)) {
    const order = screen.buttons?._order || [];
    const srcX = screen.x ?? 0;
    const srcY = screen.y ?? 0;
    const srcBtnCount = order.length;

    order.forEach((btnKey, btnIdx) => {
      const btn = screen.buttons[btnKey];
      if (!btn?.targetScreen || !screens[btn.targetScreen]) return;

      const target = screens[btn.targetScreen];
      const tgtX = target.x ?? 0;
      const tgtY = target.y ?? 0;

      // Source: right edge of the specific button row
      const sx = srcX + NODE_W;
      const sy = srcY + NODE_HEADER_H + 8 + btnIdx * BTN_ROW_H + BTN_ROW_H / 2;

      // Target: top center of target node
      const tx = tgtX + NODE_W / 2;
      const ty = tgtY;

      // Bezier: exits right from button, enters top of target
      const dist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);
      const cpOffset = Math.max(80, dist * 0.35);

      let cp1x, cp1y, cp2x, cp2y;
      // Control point 1: go right from button
      cp1x = sx + cpOffset;
      cp1y = sy;
      // Control point 2: come from above into target top
      cp2x = tx;
      cp2y = ty - cpOffset;

      const isHighlighted = srcId === activeScreen || btn.targetScreen === activeScreen;
      const mid = bezierPoint(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, 0.5);
      const angle = bezierAngle(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, 0.5);

      arrows.push({
        key: `${srcId}-${btnKey}`,
        d: `M ${sx},${sy} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`,
        highlighted: isHighlighted,
        mid, angle, sx, sy, tx, ty,
      });
    });
  }

  return (
    <g>
      {arrows.map(({ key, d, highlighted, mid, angle, sx, sy, tx, ty }) => (
        <g key={key}>
          <path
            d={d}
            fill="none"
            stroke={highlighted ? 'rgba(255,126,0,0.8)' : 'rgba(255,126,0,0.3)'}
            strokeWidth={highlighted ? 3 : 2.5}
          />
          <polygon
            points="-8,-6 8,0 -8,6"
            fill={highlighted ? 'rgba(255,126,0,1)' : 'rgba(255,126,0,0.5)'}
            transform={`translate(${mid.x},${mid.y}) rotate(${angle})`}
          />
          <circle cx={sx} cy={sy} r={4}
            fill={highlighted ? 'var(--color-orange)' : 'rgba(255,126,0,0.4)'} />
          <circle cx={tx} cy={ty} r={4}
            fill={highlighted ? 'var(--color-orange)' : 'rgba(255,126,0,0.4)'} />
        </g>
      ))}
    </g>
  );
}
