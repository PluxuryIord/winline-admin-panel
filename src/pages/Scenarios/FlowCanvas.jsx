import { useRef, useCallback, useState, useMemo } from 'react';
import { Search, Maximize2, Play, Filter } from 'lucide-react';
import FlowNode from './FlowNode';
import FlowArrows from './FlowArrows';
import { NODE_W, NODE_HEADER_H, BTN_ROW_H } from './FlowNode';

// ─── Scenario groups mapping ─────────────────────────────────────────────────
const SCENARIO_GROUPS = {
  'Сценарий 1': ['start_menu', 'registration_flow'],
  'Сценарий 2': ['auth_flow', 'main_menu', 'offer_page', 'promo_page', 'socials_page'],
  'Сценарий 3': ['event_flow', 'event_anketa'],
  'Сценарий 4': ['group_menu', 'group_promo', 'group_calendar', 'group_landings', 'group_kb'],
  'Анкета': [],  // Dynamic — filled from screens with scenario:5
};

// Центральный блок для каждого сценария
const SCENARIO_CENTER = {
  'Сценарий 1': 'registration_flow',
  'Сценарий 2': 'auth_flow',
  'Сценарий 3': 'event_flow',
  'Сценарий 4': 'group_menu',
  'Анкета': 'event_anketa',
};

export default function FlowCanvas({
  screens, activeScreen, onSelectNode, onMoveNode,
  onDuplicate, onDeleteBlock, searchQuery, setSearchQuery,
  hoveredNode, setHoveredNode, onStartTest,
  bendOffsets, onBendChange,
}) {
  const containerRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [activeFilter, setActiveFilter] = useState(null);
  const [highlightedNode, setHighlightedNode] = useState(null);

  // ─── Search matching ─────────────────────────────────────────────────────────
  const searchMatches = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return new Set();
    const q = searchQuery.toLowerCase();
    const matches = new Set();
    for (const [id, screen] of Object.entries(screens)) {
      if (screen.title?.toLowerCase().includes(q)) {
        matches.add(id);
        continue;
      }
      const order = screen.buttons?._order || [];
      for (const btnKey of order) {
        const btn = screen.buttons[btnKey];
        if (btn?.label?.toLowerCase().includes(q)) {
          matches.add(id);
          break;
        }
      }
    }
    return matches;
  }, [screens, searchQuery]);

  // ─── Connected nodes for hover highlighting ──────────────────────────────────
  const connectedNodes = useMemo(() => {
    if (!hoveredNode) return new Set();
    const connected = new Set();
    for (const [srcId, screen] of Object.entries(screens)) {
      const order = screen.buttons?._order || [];
      for (const btnKey of order) {
        const btn = screen.buttons[btnKey];
        if (!btn?.targetScreen) continue;
        if (srcId === hoveredNode) connected.add(btn.targetScreen);
        if (btn.targetScreen === hoveredNode) connected.add(srcId);
      }
      // Also handle anketa nextScreen connections
      if (screen.nextScreen) {
        if (srcId === hoveredNode) connected.add(screen.nextScreen);
        if (screen.nextScreen === hoveredNode) connected.add(srcId);
      }
    }
    return connected;
  }, [screens, hoveredNode]);

  // ─── Fit to bounding box helper ──────────────────────────────────────────────
  const fitToNodes = useCallback((nodeIds) => {
    requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const padding = 80;

      const ids = nodeIds.filter(id => screens[id]);
      if (ids.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of ids) {
        const s = screens[id];
        const x = s.x ?? 0;
        const y = s.y ?? 0;
        const btnCount = (s.buttons?._order || []).length;
        const h = NODE_HEADER_H + 8 + btnCount * BTN_ROW_H + 10;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + NODE_W > maxX) maxX = x + NODE_W;
        if (y + h > maxY) maxY = y + h;
      }

      const contentW = maxX - minX || 1;
      const contentH = maxY - minY || 1;
      const scaleX = (rect.width - padding * 2) / contentW;
      const scaleY = (rect.height - padding * 2) / contentH;
      const newZoom = Math.min(1.5, Math.max(0.1, Math.min(scaleX, scaleY)));

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      setZoom(newZoom);
      setOffset({
        x: rect.width / 2 - centerX * newZoom,
        y: rect.height / 2 - centerY * newZoom,
      });
    });
  }, [screens]);

  // ─── Pan with mouse drag ─────────────────────────────────────────────────────
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

  // ─── Zoom with scroll wheel (toward cursor) ────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Cursor position relative to canvas element
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? -0.08 : 0.08;

    setZoom(prevZoom => {
      const newZoom = Math.min(2, Math.max(0.1, prevZoom + delta));
      const scale = newZoom / prevZoom;

      // Adjust offset so the point under cursor stays fixed
      setOffset(prev => ({
        x: mouseX - scale * (mouseX - prev.x),
        y: mouseY - scale * (mouseY - prev.y),
      }));

      return newZoom;
    });
  }, []);

  // ─── Build dynamic scenario groups (include custom blocks with scenario field) ──
  const dynamicGroups = useMemo(() => {
    const groups = {};
    for (const [key, ids] of Object.entries(SCENARIO_GROUPS)) {
      groups[key] = [...ids];
    }
    // Add custom blocks based on their scenario field
    for (const [id, screen] of Object.entries(screens)) {
      if (screen.scenario) {
        if (screen.scenario === 5) {
          // Anketa screens go to "Анкета" group
          if (!groups['Анкета'].includes(id)) groups['Анкета'].push(id);
        } else {
          const groupName = `Сценарий ${screen.scenario}`;
          if (groups[groupName] && !groups[groupName].includes(id)) {
            groups[groupName].push(id);
          }
        }
      }
    }
    // Always include event_anketa in Анкета group as entry point
    if (!groups['Анкета'].includes('event_anketa')) {
      groups['Анкета'].unshift('event_anketa');
    }
    return groups;
  }, [screens]);

  // ─── Center on a single node ────────────────────────────────────────────────
  const centerOnNode = useCallback((nodeId, targetZoom = 0.85) => {
    requestAnimationFrame(() => {
      if (!containerRef.current || !screens[nodeId]) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const s = screens[nodeId];
      const x = s.x ?? 0;
      const y = s.y ?? 0;
      const btnCount = (s.buttons?._order || []).length;
      const h = NODE_HEADER_H + 8 + btnCount * BTN_ROW_H + 10;

      const nodeCenterX = x + NODE_W / 2;
      const nodeCenterY = y + h / 2;

      setZoom(targetZoom);
      setOffset({
        x: rect.width / 2 - nodeCenterX * targetZoom,
        y: rect.height / 2 - nodeCenterY * targetZoom,
      });
    });
  }, [screens]);

  // ─── Scenario filter handler ─────────────────────────────────────────────────
  const handleFilter = (name) => {
    if (name === null) {
      setActiveFilter(null);
      setHighlightedNode(null);
      fitToNodes(Object.keys(screens).filter(id => id !== 'logout_screen'));
    } else {
      setActiveFilter(name);
      const centerId = SCENARIO_CENTER[name];
      if (centerId && screens[centerId]) {
        setHighlightedNode(centerId);
        centerOnNode(centerId);
        // Убрать подсветку через 2 секунды
        setTimeout(() => setHighlightedNode(null), 2000);
      } else {
        setHighlightedNode(null);
        fitToNodes(dynamicGroups[name] || SCENARIO_GROUPS[name] || []);
      }
    }
  };

  // ─── Fit all handler ─────────────────────────────────────────────────────────
  const handleFitAll = () => {
    setActiveFilter(null);
    fitToNodes(Object.keys(screens).filter(id => id !== 'logout_screen'));
  };

  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;

  return (
    <div
      className="flow-canvas"
      ref={containerRef}
      onMouseDown={handleBgMouseDown}
      onWheel={handleWheel}
    >
      {/* ─── Toolbar ──────────────────────────────────────────────────── */}
      <div className="sc-toolbar">
        <div className="sc-toolbar-filters">
          <Filter size={14} />
          <button
            className={`sc-toolbar-filter-btn ${activeFilter === null ? 'active' : ''}`}
            onClick={() => handleFilter(null)}
          >
            Все
          </button>
          {Object.keys(SCENARIO_GROUPS).map(name => (
            <button
              key={name}
              className={`sc-toolbar-filter-btn ${activeFilter === name ? 'active' : ''}`}
              onClick={() => handleFilter(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="sc-toolbar-right">
          <div className="sc-toolbar-search">
            <Search size={14} />
            <input
              className="sc-toolbar-search-input"
              type="text"
              placeholder="Поиск по блокам..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="sc-toolbar-btn" onClick={handleFitAll} title="Уместить всё">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* SVG arrows layer */}
      <svg className="flow-arrows-svg" style={{ transform, transformOrigin: '0 0' }}>
        <FlowArrows screens={screens} activeScreen={activeScreen} hoveredNode={hoveredNode} bendOffsets={bendOffsets || {}} onBendChange={onBendChange} zoom={zoom} />
      </svg>

      <div
        className="flow-canvas-inner"
        style={{ transform, transformOrigin: '0 0' }}
      >
        {Object.entries(screens).filter(([id]) => id !== 'logout_screen').map(([id, screen]) => (
          <FlowNode
            key={id}
            screenId={id}
            screen={screen}
            position={{ x: screen.x ?? 0, y: screen.y ?? 0 }}
            isActive={id === activeScreen}
            isSearchMatch={searchMatches.has(id)}
            isConnected={connectedNodes.has(id)}
            isHovered={id === hoveredNode}
            isHighlighted={id === highlightedNode}
            onSelect={onSelectNode}
            onMove={onMoveNode}
            onDuplicate={onDuplicate}
            onDelete={onDeleteBlock}
            onHover={setHoveredNode}
            zoom={zoom}
          />
        ))}
      </div>

      {/* Zoom indicator */}
      <div className="flow-zoom-indicator">{Math.round(zoom * 100)}%</div>
    </div>
  );
}
