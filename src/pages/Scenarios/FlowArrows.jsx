const NODE_W = 220;
const NODE_HEADER_H = 44;
const BTN_ROW_H = 28;

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

      // Source: right edge of node, at button row Y
      const sx = srcX + NODE_W;
      const sy = srcY + NODE_HEADER_H + btnIdx * BTN_ROW_H + BTN_ROW_H / 2;

      // Target: left edge of target node, vertical center
      const tgtBtnCount = (target.buttons?._order || []).length;
      const tgtH = NODE_HEADER_H + tgtBtnCount * BTN_ROW_H + 8;
      const tx = tgtX;
      const ty = tgtY + tgtH / 2;

      // Bezier control points
      const dx = Math.abs(tx - sx);
      const cpOffset = Math.max(80, dx * 0.4);

      let cp1x, cp1y, cp2x, cp2y;
      if (tx > sx) {
        // Normal: left to right
        cp1x = sx + cpOffset;
        cp1y = sy;
        cp2x = tx - cpOffset;
        cp2y = ty;
      } else {
        // Reverse: loopback
        cp1x = sx + 100;
        cp1y = sy + 60;
        cp2x = tx - 100;
        cp2y = ty - 60;
      }

      const isHighlighted = srcId === activeScreen || btn.targetScreen === activeScreen;

      arrows.push({
        key: `${srcId}-${btnKey}`,
        d: `M ${sx},${sy} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`,
        highlighted: isHighlighted,
      });
    });
  }

  return (
    <svg className="flow-arrows-svg">
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8" markerHeight="6"
          refX="8" refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="rgba(255,126,0,0.5)" />
        </marker>
        <marker
          id="arrowhead-active"
          markerWidth="8" markerHeight="6"
          refX="8" refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="rgba(255,126,0,1)" />
        </marker>
      </defs>
      {arrows.map(({ key, d, highlighted }) => (
        <path
          key={key}
          d={d}
          fill="none"
          stroke={highlighted ? 'rgba(255,126,0,0.8)' : 'rgba(255,126,0,0.25)'}
          strokeWidth={highlighted ? 2 : 1.5}
          markerEnd={highlighted ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
        />
      ))}
    </svg>
  );
}
