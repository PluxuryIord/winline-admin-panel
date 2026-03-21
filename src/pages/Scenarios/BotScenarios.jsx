import { useState, useEffect, useCallback } from 'react';
import { Loader } from 'lucide-react';
import { api } from '../../utils/api';
import FlowCanvas from './FlowCanvas';
import NodeEditorPanel from './NodeEditorPanel';
import './BotScenarios.css';

// ─── Callback → Screen mapping (for auto-migration) ────────────────────────
const CALLBACK_TO_SCREEN = {
  client_existing_partner: 'auth_flow',
  client_new_partner: 'registration_flow',
  client_already_registered: 'auth_flow',
  client_back_to_start: 'start_menu',
  client_back_menu: 'main_menu',
  client_offers: 'offer_page',
  client_promo: 'promo_page',
  client_socials: 'socials_page',
  client_at_event: 'event_flow',
  client_logout: 'logout_screen',
};

// ─── Default positions for first load ───────────────────────────────────────
const DEFAULT_POSITIONS = {
  start_menu:        { x: 400, y: 50 },
  registration_flow: { x: 100, y: 300 },
  auth_flow:         { x: 650, y: 300 },
  main_menu:         { x: 400, y: 550 },
  offer_page:        { x: 20,  y: 820 },
  promo_page:        { x: 240, y: 820 },
  socials_page:      { x: 460, y: 820 },
  event_flow:        { x: 680, y: 820 },
  logout_screen:     { x: 900, y: 820 },
};

// ─── Migrate data: add x, y, targetScreen if missing ────────────────────────
function migrateData(data) {
  if (!data?.screens) return data;
  let changed = false;

  for (const [screenId, screen] of Object.entries(data.screens)) {
    // Add positions
    if (screen.x == null || screen.y == null) {
      const pos = DEFAULT_POSITIONS[screenId] || { x: 100, y: 100 };
      screen.x = pos.x;
      screen.y = pos.y;
      changed = true;
    }

    // Add targetScreen to callback buttons
    const order = screen.buttons?._order || [];
    for (const btnKey of order) {
      const btn = screen.buttons[btnKey];
      if (!btn) continue;
      if (btn.action?.startsWith('callback:') && !btn.targetScreen) {
        const callbackId = btn.action.split(':').slice(1).join(':');
        const target = CALLBACK_TO_SCREEN[callbackId];
        if (target) {
          btn.targetScreen = target;
          changed = true;
        }
      }
    }
  }

  return data;
}

export default function BotScenarios() {
  const [scenarios, setScenarios] = useState(null);
  const [activeScreen, setActiveScreen] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  // Load scenarios
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let res = await api.get('/api/scenarios');
      let data = await res.json();

      if (!data.screens || Object.keys(data.screens).length === 0) {
        await api.post('/api/scenarios/seed');
        res = await api.get('/api/scenarios');
        data = await res.json();
      }

      // Deep copy before migration to detect changes
      const origJson = JSON.stringify(data);
      const migrated = migrateData(JSON.parse(JSON.stringify(data)));
      setScenarios(migrated);

      // Auto-save if migration changed anything (added targetScreen/positions)
      if (JSON.stringify(migrated) !== origJson) {
        try { await api.put('/api/scenarios', migrated); } catch (_) {}
      }
    } catch (e) {
      console.error('Failed to load scenarios:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Select screen
  const selectScreen = (screenId) => {
    if (dirty && !confirm('Есть несохранённые изменения. Переключить экран?')) return;
    setActiveScreen(screenId);
    setEditData(JSON.parse(JSON.stringify(scenarios.screens[screenId])));
    setDirty(false);
    setSaved(false);
  };

  // Close editor
  const closeEditor = () => {
    if (dirty && !confirm('Есть несохранённые изменения. Закрыть?')) return;
    setActiveScreen(null);
    setEditData(null);
    setDirty(false);
  };

  // Move node
  const moveNode = useCallback((screenId, pos) => {
    setScenarios(prev => {
      const next = { ...prev, screens: { ...prev.screens } };
      next.screens[screenId] = { ...next.screens[screenId], x: pos.x, y: pos.y };
      return next;
    });
    setDirty(true);
    setSaved(false);
  }, []);

  // Edit message text
  const updateMessage = (key, text) => {
    setEditData(prev => {
      const next = { ...prev, messages: { ...prev.messages } };
      next.messages[key] = { ...next.messages[key], text };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  // Edit button label
  const updateButtonLabel = (key, label) => {
    setEditData(prev => {
      const next = { ...prev, buttons: { ...prev.buttons } };
      next.buttons[key] = { ...next.buttons[key], label };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  // Edit button action (url)
  const updateButtonAction = (key, action) => {
    setEditData(prev => {
      const next = { ...prev, buttons: { ...prev.buttons } };
      next.buttons[key] = { ...next.buttons[key], action };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  // Edit button target screen
  const updateButtonTarget = (key, targetScreen) => {
    setEditData(prev => {
      const next = { ...prev, buttons: { ...prev.buttons } };
      next.buttons[key] = { ...next.buttons[key], targetScreen: targetScreen || undefined };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  // Move button up/down
  const moveButton = (key, direction) => {
    setEditData(prev => {
      const order = [...(prev.buttons._order || [])];
      const idx = order.indexOf(key);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= order.length) return prev;
      [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
      return { ...prev, buttons: { ...prev.buttons, _order: order } };
    });
    setDirty(true);
    setSaved(false);
  };

  // Save
  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = JSON.parse(JSON.stringify(scenarios));
      if (activeScreen && editData) {
        updated.screens[activeScreen] = {
          ...editData,
          x: updated.screens[activeScreen].x,
          y: updated.screens[activeScreen].y,
        };
      }
      await api.put('/api/scenarios', updated);
      setScenarios(updated);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="sc-loading"><Loader size={24} className="sc-spinner" /> Загрузка сценариев...</div>;
  if (!scenarios) return <div className="sc-loading">Не удалось загрузить</div>;

  return (
    <div className="sc-flow-layout">
      <FlowCanvas
        screens={scenarios.screens}
        activeScreen={activeScreen}
        onSelectNode={selectScreen}
        onMoveNode={moveNode}
      />
      {activeScreen && editData && (
        <NodeEditorPanel
          screenId={activeScreen}
          editData={editData}
          allScreens={scenarios.screens}
          onUpdateMessage={updateMessage}
          onUpdateButtonLabel={updateButtonLabel}
          onUpdateButtonAction={updateButtonAction}
          onUpdateButtonTarget={updateButtonTarget}
          onMoveButton={moveButton}
          onClose={closeEditor}
          onSave={handleSave}
          dirty={dirty}
          saving={saving}
          saved={saved}
        />
      )}
    </div>
  );
}
