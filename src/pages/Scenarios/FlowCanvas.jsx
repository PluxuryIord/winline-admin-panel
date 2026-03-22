import { useRef, useCallback, useState } from 'react';
import FlowNode from './FlowNode';
import FlowArrows from './FlowArrows';

export default function FlowCanvas({ screens, activeScreen, onSelectNode, onMoveNode }) {
  const containerRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Pan with mouse drag
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

  // Zoom with scroll wheel
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(prev => Math.min(2, Math.max(0.3, prev + delta)));
  }, []);

  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;

  return (
    <div
      className="flow-canvas"
      ref={containerRef}
      onMouseDown={handleBgMouseDown}
      onWheel={handleWheel}
    >
      {/* SVG arrows layer */}
      <svg className="flow-arrows-svg" style={{ transform, transformOrigin: '0 0' }}>
        <FlowArrows screens={screens} activeScreen={activeScreen} />
      </svg>

      <div
        className="flow-canvas-inner"
        style={{ transform, transformOrigin: '0 0' }}
      >
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

      {/* Zoom indicator */}
      <div className="flow-zoom-indicator">{Math.round(zoom * 100)}%</div>
    </div>
  );
}
