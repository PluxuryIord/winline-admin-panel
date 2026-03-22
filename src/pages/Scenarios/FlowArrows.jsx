import { NODE_W, NODE_HEADER_H, BTN_ROW_H } from './FlowNode';

const STEP_OUT = 40; // how far right from button before turning

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

      // Source: right edge of button row
      const sx = srcX + NODE_W;
      const sy = srcY + NODE_HEADER_H + 8 + btnIdx * BTN_ROW_H + BTN_ROW_H / 2;

      // Target: top center
      const tx = tgtX + NODE_W / 2;
      const ty = tgtY;

      // Build orthogonal path: right → vertical → horizontal → down into target
      const midX = sx + STEP_OUT + btnIdx * 16; // offset per button to avoid overlap
      const midY = ty - 30; // approach from above

      // Path: go right, turn down/up, go horizontal, turn down into target
      const d = `M ${sx},${sy} H ${midX} V ${midY} H ${tx} V ${ty}`;

      const isHighlighted = srcId === activeScreen || btn.targetScreen === activeScreen;

      // Arrow midpoint — on horizontal segment
      const arrowX = (midX + tx) / 2;
      const arrowY = midY;
      const arrowDir = tx > midX ? 0 : 180; // pointing right or left

      arrows.push({
        key: `${srcId}-${btnKey}`,
        d,
        highlighted: isHighlighted,
        arrowX, arrowY, arrowDir,
        sx, sy, tx, ty,
      });
    });
  }

  return (
    <g>
      {arrows.map(({ key, d, highlighted, arrowX, arrowY, arrowDir, sx, sy, tx, ty }) => (
        <g key={key}>
          <path
            d={d}
            fill="none"
            stroke={highlighted ? 'rgba(255,126,0,0.8)' : 'rgba(255,126,0,0.3)'}
            strokeWidth={highlighted ? 2.5 : 2}
            strokeLinejoin="round"
          />
          {/* Arrow head on horizontal segment */}
          <polygon
            points="-7,-5 7,0 -7,5"
            fill={highlighted ? 'rgba(255,126,0,1)' : 'rgba(255,126,0,0.5)'}
            transform={`translate(${arrowX},${arrowY}) rotate(${arrowDir})`}
          />
          {/* Dots at start and end */}
          <circle cx={sx} cy={sy} r={3.5}
            fill={highlighted ? 'var(--color-orange)' : 'rgba(255,126,0,0.4)'} />
          <circle cx={tx} cy={ty} r={3.5}
            fill={highlighted ? 'var(--color-orange)' : 'rgba(255,126,0,0.4)'} />
        </g>
      ))}
    </g>
  );
}
