import { useRef, useCallback, useState } from 'react';
import FlowNode from './FlowNode';
import FlowArrows from './FlowArrows';

export default function FlowCanvas({ screens, activeScreen, onSelectNode, onMoveNode }) {
  const containerRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleBgMouseDown = useCallback((e) => {
    if (e.target !== e.currentTarget && !e.target.classList.contains('flow-canvas-inner')) return;
    if (e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startOffset = { ...offset };

    const onMouseMove = (ev) => {
      setOffset({
        x: startOffset.x + (ev.clientX - startX),
        y: startOffset.y + (ev.clientY - startY),
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [offset]);

  return (
    <div className="flow-canvas" ref={containerRef} onMouseDown={handleBgMouseDown}>
      <div
        className="flow-canvas-inner"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <FlowArrows screens={screens} activeScreen={activeScreen} />
        {Object.entries(screens).map(([id, screen]) => (
          <FlowNode
            key={id}
            screenId={id}
            screen={screen}
            position={{ x: screen.x ?? 0, y: screen.y ?? 0 }}
            isActive={id === activeScreen}
            onSelect={onSelectNode}
            onMove={onMoveNode}
          />
        ))}
      </div>
    </div>
  );
}
