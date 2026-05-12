import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Maximize2, Play, Filter } from 'lucide-react';
import FlowNode from './FlowNode';
import FlowArrows from './FlowArrows';
import { NODE_W, NODE_HEADER_H, BTN_ROW_H } from './FlowNode';

// ─── Scenario groups mapping ─────────────────────────────────────────────────
const SCENARIO_GROUPS = {
  'Сценарий 1': ['start_menu', 'registration_flow'],
  'Сценарий 2': ['auth_flow', 'main_menu', 'offer_page', 'promo_page', 'socials_page'],
  'Сценарий 3': ['event_partner_check', 'event_verify_promo', 'event_email_prompt',
    'event_email_confirmed', 'event_site_status', 'event_site_wait',
    'event_congrats', 'event_registration_promo', 'event_registration_instructions'],
  'Сценарий 4': ['group_menu', 'group_promo', 'group_calendar', 'group_landings', 'group_kb'],
  'Анкета': [],  // Dynamic — filled from screens with scenario:5
};

// Центральный блок для каждого сценария
const SCENARIO_CENTER = {
  'Сценарий 1': 'registration_flow',
  'Сценарий 2': 'auth_flow',
  'Сценарий 3': 'event_partner_check',
  'Сценарий 4': 'group_menu',
  'Анкета': 'anketa_role',
};

export default function FlowCanvas({
  screens, activeScreen, onSelectNode, onMoveNode, onMoveNodeEnd,
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
    return groups;
  }, [screens]);

  // ─── При первой загрузке центрируем канвас на main_menu, чтобы
  // пользователь не оказывался посреди пустоты.
  // Если в URL есть ?scenario=N — пропускаем, отдаём управление эффекту ниже.
  const initialCenteredRef = useRef(false);
  useEffect(() => {
    if (initialCenteredRef.current) return;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scenario')) {
      // отметим как «обработано», но не центрируем — это сделает scenario-эффект
      initialCenteredRef.current = true;
      return;
    }
    if (!screens || !screens['main_menu']) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    initialCenteredRef.current = true;
    requestAnimationFrame(() => centerOnNodeRef.current?.('main_menu'));
  }, [screens]);

  // ref на актуальный centerOnNode (объявлен ниже) — обновляется в эффекте.
  const centerOnNodeRef = useRef(null);

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
  // экспонируем последнюю версию для use в первичном эффекте
  useEffect(() => { centerOnNodeRef.current = centerOnNode; }, [centerOnNode]);

  // ─── Auto-select scenario filter из query-параметра ?scenario=3 ──────────
  const [searchParams, setSearchParams] = useSearchParams();
  const autoFilterAppliedRef = useRef(false);

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

  // Применяем фильтр из URL (?scenario=3 → «Сценарий 3») один раз после
  // того, как screens прогрузились и контейнер получил размеры.
  useEffect(() => {
    if (autoFilterAppliedRef.current) return;
    const sc = searchParams.get('scenario');
    if (!sc) return;
    if (!screens || Object.keys(screens).length === 0) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const name = `Сценарий ${sc}`;
    autoFilterAppliedRef.current = true;
    // также подавим initial-center на main_menu, т.к. сейчас сами центруем
    initialCenteredRef.current = true;
    handleFilter(name);
    // вычищаем параметр из URL, чтобы при ручном переключении он не доминировал
    const next = new URLSearchParams(searchParams);
    next.delete('scenario');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens, searchParams]);

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
            onMoveEnd={onMoveNodeEnd}
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
