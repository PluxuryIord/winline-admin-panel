const NODE_W = 220;
const NODE_HEADER_H = 44;
const BTN_ROW_H = 28;

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

export default function FlowArrows({ screens, activeScreen }) {
  const arrows = [];

  for (const [srcId, screen] of Object.entries(screens)) {
    const order = screen.buttons?._order || [];
    const srcX = screen.x ?? 0;
    const srcY = screen.y ?? 0;

    order.forEach((btnKey, btnIdx) => {
      const btn = screen.buttons[btnKey];
      if (!btn?.targetScreen || !screens[btn.targetScreen]) return;

      const target = screens[btn.targetScreen];
      const tgtX = target.x ?? 0;
      const tgtY = target.y ?? 0;

      const sx = srcX + NODE_W;
      const sy = srcY + NODE_HEADER_H + btnIdx * BTN_ROW_H + BTN_ROW_H / 2;

      const tgtBtnCount = (target.buttons?._order || []).length;
      const tgtH = NODE_HEADER_H + tgtBtnCount * BTN_ROW_H + 8;
      const tx = tgtX;
      const ty = tgtY + tgtH / 2;

      const dx = Math.abs(tx - sx);
      const cpOffset = Math.max(80, dx * 0.4);

      let cp1x, cp1y, cp2x, cp2y;
      if (tx > sx) {
        cp1x = sx + cpOffset; cp1y = sy;
        cp2x = tx - cpOffset; cp2y = ty;
      } else {
        cp1x = sx + 100; cp1y = sy + 60;
        cp2x = tx - 100; cp2y = ty - 60;
      }

      const isHighlighted = srcId === activeScreen || btn.targetScreen === activeScreen;

      // Midpoint arrow
      const mid = bezierPoint(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, 0.5);
      const angle = bezierAngle(sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty, 0.5);

      arrows.push({
        key: `${srcId}-${btnKey}`,
        d: `M ${sx},${sy} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`,
        highlighted: isHighlighted,
        mid,
        angle,
      });
    });
  }

  return (
    <svg className="flow-arrows-svg">
      {arrows.map(({ key, d, highlighted, mid, angle }) => (
        <g key={key}>
          <path
            d={d}
            fill="none"
            stroke={highlighted ? 'rgba(255,126,0,0.8)' : 'rgba(255,126,0,0.3)'}
            strokeWidth={highlighted ? 3 : 2.5}
          />
          {/* Arrow triangle at midpoint */}
          <polygon
            points="-7,-5 7,0 -7,5"
            fill={highlighted ? 'rgba(255,126,0,1)' : 'rgba(255,126,0,0.5)'}
            transform={`translate(${mid.x},${mid.y}) rotate(${angle})`}
          />
        </g>
      ))}
    </svg>
  );
}
