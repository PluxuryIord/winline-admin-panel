import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader, Plus, RotateCcw, X } from 'lucide-react';
import { api } from '../../utils/api';
import FlowCanvas from './FlowCanvas';
import NodeEditorPanel from './NodeEditorPanel';
import './BotScenarios.css';

// System screens that cannot be deleted
const SYSTEM_SCREENS = new Set([
  'start_menu', 'registration_flow', 'auth_flow', 'main_menu',
  'offer_page', 'promo_page', 'socials_page', 'event_flow', 'logout_screen',
]);

// ─── Callback → Screen mapping (for auto-migration) ────────────────────────
const CALLBACK_TO_SCREEN = {
  client_existing_partner: 'auth_flow',
  client_new_partner: 'registration_flow',
  client_already_registered: 'auth_flow',
  // client_back_to_start и client_back_menu — не рисуем стрелки "назад"
  client_offers: 'offer_page',
  client_promo: 'promo_page',
  client_socials: 'socials_page',
  client_at_event: 'event_flow',
  client_logout: 'logout_screen',
};

// ─── Screen → Callback mapping (for changing connections) ───────────────────
const SCREEN_TO_CALLBACK = {
  start_menu: 'client_back_to_start',
  registration_flow: 'client_new_partner',
  auth_flow: 'client_existing_partner',
  main_menu: 'client_back_menu',
  offer_page: 'client_offers',
  promo_page: 'client_promo',
  socials_page: 'client_socials',
  event_flow: 'client_at_event',
  logout_screen: 'client_logout',
};

// ─── Default positions for first load ───────────────────────────────────────
const DEFAULT_POSITIONS = {
  // Сценарий 1: Новый пользователь (левая часть)
  start_menu:        { x: 500, y: 60 },
  registration_flow: { x: 900, y: 60 },

  // Сценарий 2: Партнёр (центр)
  auth_flow:         { x: 100, y: 350 },
  main_menu:         { x: 500, y: 350 },
  offer_page:        { x: 100, y: 700 },
  promo_page:        { x: 500, y: 700 },
  socials_page:      { x: 900, y: 700 },

  // Сценарий 3: Мероприятие
  event_flow:        { x: 900, y: 350 },

  // Выход
  logout_screen:     { x: 1300, y: 350 },

  // Сценарий 4: Работа в чатах (правая нижняя часть)
  group_menu:        { x: 100, y: 1100 },
  group_promo:       { x: 500, y: 1100 },
  group_calendar:    { x: 900, y: 1100 },
  group_landings:    { x: 500, y: 1450 },
  group_kb:          { x: 900, y: 1450 },
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

    // Add/remove targetScreen on callback buttons
    const BACK_CALLBACKS = ['client_back_to_start', 'client_back_menu'];
    const order = screen.buttons?._order || [];
    for (const btnKey of order) {
      const btn = screen.buttons[btnKey];
      if (!btn) continue;
      if (btn.action?.startsWith('callback:')) {
        const callbackId = btn.action.split(':').slice(1).join(':');
        // Remove targetScreen from "back" buttons
        if (BACK_CALLBACKS.includes(callbackId) && btn.targetScreen) {
          delete btn.targetScreen;
          changed = true;
        }
        // Add targetScreen for non-back buttons
        if (!btn.targetScreen && !BACK_CALLBACKS.includes(callbackId)) {
          const target = CALLBACK_TO_SCREEN[callbackId];
          if (target) {
            btn.targetScreen = target;
            changed = true;
          }
        }
      }
    }
  }

  return data;
}

const MAX_HISTORY = 10;

export default function BotScenarios() {
  const [scenarios, setScenarios] = useState(null);
  const [activeScreen, setActiveScreen] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBlockName, setNewBlockName] = useState('');
  const [newBlockDesc, setNewBlockDesc] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [showAddBtnModal, setShowAddBtnModal] = useState(false);
  const [newBtnLabel, setNewBtnLabel] = useState('');

  // Feature 3: Search
  const [searchQuery, setSearchQuery] = useState('');

  // Feature 10: Hover highlighting
  const [hoveredNode, setHoveredNode] = useState(null);

  // Feature 13: Flow testing
  // test mode removed

  // Feature 8: Undo/Redo
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);

  const pushHistory = useCallback((data) => {
    if (skipHistoryRef.current) return;
    const json = JSON.stringify(data);
    if (json.length > 500000) return; // skip huge states
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    // Remove future states
    historyRef.current = history.slice(0, idx + 1);
    historyRef.current.push(json);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  // Undo/Redo keyboard handler
  useEffect(() => {
    const handler = (e) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        // Undo
        if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
          skipHistoryRef.current = true;
          const state = JSON.parse(historyRef.current[historyIndexRef.current]);
          setScenarios(state);
          skipHistoryRef.current = false;
        }
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        // Redo
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current++;
          skipHistoryRef.current = true;
          const state = JSON.parse(historyRef.current[historyIndexRef.current]);
          setScenarios(state);
          skipHistoryRef.current = false;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

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
      pushHistory(migrated);

      // Auto-save if migration changed anything (added targetScreen/positions)
      if (JSON.stringify(migrated) !== origJson) {
        try { await api.put('/api/scenarios', migrated); } catch (_) {}
      }
    } catch (e) {
      console.error('Failed to load scenarios:', e);
    } finally {
      setLoading(false);
    }
  }, [pushHistory]);

  useEffect(() => { loadData(); }, [loadData]);

  // Helper: update scenarios and push to history
  const updateScenarios = useCallback((updater) => {
    setScenarios(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  // Auto-save helper
  const autoSave = async (currentEditData, currentActiveScreen) => {
    if (!currentEditData || !currentActiveScreen) return;
    try {
      const updated = JSON.parse(JSON.stringify(scenarios));
      updated.screens[currentActiveScreen] = {
        ...currentEditData,
        x: updated.screens[currentActiveScreen].x,
        y: updated.screens[currentActiveScreen].y,
      };
      await api.put('/api/scenarios', updated);
      setScenarios(updated);
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  };

  // Select screen (auto-save previous if dirty)
  const selectScreen = async (screenId) => {
    if (dirty && editData && activeScreen) {
      await autoSave(editData, activeScreen);
    }
    setActiveScreen(screenId);
    setEditData(JSON.parse(JSON.stringify(scenarios.screens[screenId])));
    setDirty(false);
    setSaved(false);
  };

  // Close editor (auto-save if dirty)
  const closeEditor = async () => {
    if (dirty && editData && activeScreen) {
      await autoSave(editData, activeScreen);
    }
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

  // Edit button target screen + update callback action
  const updateButtonTarget = (key, targetScreen) => {
    setEditData(prev => {
      const next = { ...prev, buttons: { ...prev.buttons } };
      const currentBtn = next.buttons[key] || {};
      const updates = { targetScreen: targetScreen || undefined };

      if (targetScreen) {
        const isTargetCustom = !SYSTEM_SCREENS.has(targetScreen);
        const isSourceSystem = SYSTEM_SCREENS.has(activeScreen);

        if (isTargetCustom) {
          // Target is custom screen → always use sc_ callback
          updates.action = `callback:sc_${targetScreen}`;
        } else if (!isSourceSystem) {
          // Source is custom, target is system → use system callback
          updates.action = `callback:${SCREEN_TO_CALLBACK[targetScreen] || targetScreen}`;
        }
        // If source is system AND target is system → don't change action (FSM flows)
      }

      next.buttons[key] = { ...currentBtn, ...updates };
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

  // Feature 6: Reorder buttons by drag indices
  const reorderButtons = (fromIdx, toIdx) => {
    setEditData(prev => {
      const order = [...(prev.buttons._order || [])];
      if (fromIdx < 0 || fromIdx >= order.length || toIdx < 0 || toIdx >= order.length) return prev;
      const [item] = order.splice(fromIdx, 1);
      order.splice(toIdx, 0, item);
      return { ...prev, buttons: { ...prev.buttons, _order: order } };
    });
    setDirty(true);
    setSaved(false);
  };

  // Create new custom screen
  const openCreateModal = () => {
    setNewBlockName('');
    setNewBlockDesc('');
    setShowCreateModal(true);
  };

  const confirmCreateScreen = () => {
    if (!newBlockName.trim()) return;
    const id = `custom_${Date.now()}`;
    updateScenarios(prev => {
      const next = { ...prev, screens: { ...prev.screens } };
      next.screens[id] = {
        title: newBlockName.trim(),
        description: newBlockDesc.trim() || 'Кастомный экран',
        x: 300,
        y: 300,
        messages: {
          main_text: { label: 'Текст сообщения', text: '<b>' + newBlockName.trim() + '</b>' },
        },
        buttons: { _order: [] },
      };
      return next;
    });
    setDirty(true);
    setSaved(false);
    setShowCreateModal(false);
  };

  // Feature 7: Duplicate block
  const duplicateBlock = (screenId) => {
    const screen = scenarios.screens[screenId];
    if (!screen) return;
    const newId = `${screenId}_copy`;
    // Avoid collision
    let finalId = newId;
    let counter = 1;
    while (scenarios.screens[finalId]) {
      finalId = `${screenId}_copy${counter++}`;
    }
    updateScenarios(prev => {
      const next = { ...prev, screens: { ...prev.screens } };
      next.screens[finalId] = {
        ...JSON.parse(JSON.stringify(screen)),
        title: screen.title + ' (копия)',
        x: (screen.x ?? 0) + 50,
        y: (screen.y ?? 0) + 50,
      };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  // Delete custom screen (called from context menu)
  const deleteBlock = (screenId) => {
    if (SYSTEM_SCREENS.has(screenId)) return;
    setDeleteTargetId(screenId);
    setShowDeleteModal(true);
  };

  // Delete custom screen
  const openDeleteModal = (screenId) => {
    if (SYSTEM_SCREENS.has(screenId)) return;
    setDeleteTargetId(screenId);
    setShowDeleteModal(true);
  };

  const confirmDeleteScreen = () => {
    if (!deleteTargetId) return;
    updateScenarios(prev => {
      const next = { ...prev, screens: { ...prev.screens } };
      delete next.screens[deleteTargetId];
      for (const [, screen] of Object.entries(next.screens)) {
        const order = screen.buttons?._order || [];
        for (const btnKey of order) {
          const btn = screen.buttons[btnKey];
          if (btn?.targetScreen === deleteTargetId) {
            delete btn.targetScreen;
          }
        }
      }
      return next;
    });
    if (activeScreen === deleteTargetId) {
      setActiveScreen(null);
      setEditData(null);
    }
    setDirty(true);
    setSaved(false);
    setShowDeleteModal(false);
    setDeleteTargetId(null);
  };

  // Add button modal
  const openAddBtnModal = () => {
    setNewBtnLabel('');
    setShowAddBtnModal(true);
  };

  const confirmAddButton = () => {
    if (!newBtnLabel.trim()) return;
    const btnId = `btn_${Date.now()}`;
    setEditData(prev => {
      const next = { ...prev, buttons: { ...prev.buttons } };
      const order = [...(next.buttons._order || []), btnId];
      next.buttons = { ...next.buttons, _order: order, [btnId]: { label: newBtnLabel.trim(), action: 'callback:noop' } };
      return next;
    });
    setDirty(true);
    setSaved(false);
    setShowAddBtnModal(false);
  };

  // Delete button from current screen
  const deleteButton = (btnKey) => {
    setEditData(prev => {
      const next = { ...prev, buttons: { ...prev.buttons } };
      const order = (next.buttons._order || []).filter(k => k !== btnKey);
      const { [btnKey]: _, ...rest } = next.buttons;
      rest._order = order;
      next.buttons = rest;
      return next;
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
      pushHistory(updated);
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
        onDuplicate={duplicateBlock}
        onDeleteBlock={deleteBlock}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        hoveredNode={hoveredNode}
        setHoveredNode={setHoveredNode}
        onStartTest={() => {}}
      />

      {/* Add new block button */}
      <button className="sc-add-block-btn" onClick={openCreateModal} title="Добавить блок">
        <Plus size={22} />
      </button>

      {/* Create block modal */}
      {showCreateModal && (
        <div className="sc-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="sc-modal" onClick={e => e.stopPropagation()}>
            <div className="sc-modal-header">
              <h3>Новый блок</h3>
              <button className="sc-modal-close" onClick={() => setShowCreateModal(false)}>
                <span>&times;</span>
              </button>
            </div>
            <div className="sc-modal-body">
              <div className="sc-modal-field">
                <label>Название</label>
                <input
                  className="sc-modal-input"
                  value={newBlockName}
                  onChange={e => setNewBlockName(e.target.value)}
                  placeholder="Например: Промо-акция"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmCreateScreen()}
                />
              </div>
              <div className="sc-modal-field">
                <label>Описание <span className="sc-modal-optional">(необязательно)</span></label>
                <input
                  className="sc-modal-input"
                  value={newBlockDesc}
                  onChange={e => setNewBlockDesc(e.target.value)}
                  placeholder="Краткое описание экрана"
                  onKeyDown={e => e.key === 'Enter' && confirmCreateScreen()}
                />
              </div>
            </div>
            <div className="sc-modal-footer">
              <button className="sc-modal-cancel" onClick={() => setShowCreateModal(false)}>Отмена</button>
              <button className="sc-modal-confirm" onClick={confirmCreateScreen} disabled={!newBlockName.trim()}>
                <Plus size={16} /> Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete block modal */}
      {showDeleteModal && deleteTargetId && (
        <div className="sc-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="sc-modal" onClick={e => e.stopPropagation()}>
            <div className="sc-modal-header">
              <h3>Удалить блок</h3>
              <button className="sc-modal-close" onClick={() => setShowDeleteModal(false)}>
                <span>&times;</span>
              </button>
            </div>
            <div className="sc-modal-body">
              <p className="sc-delete-warning">
                Вы уверены что хотите удалить блок <strong>«{scenarios.screens[deleteTargetId]?.title}»</strong>?
              </p>
              <p className="sc-delete-hint">Все связи на этот блок будут удалены. Это действие нельзя отменить.</p>
            </div>
            <div className="sc-modal-footer">
              <button className="sc-modal-cancel" onClick={() => setShowDeleteModal(false)}>Отмена</button>
              <button className="sc-modal-delete" onClick={confirmDeleteScreen}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add button modal */}
      {showAddBtnModal && (
        <div className="sc-modal-overlay" onClick={() => setShowAddBtnModal(false)}>
          <div className="sc-modal" onClick={e => e.stopPropagation()}>
            <div className="sc-modal-header">
              <h3>Новая кнопка</h3>
              <button className="sc-modal-close" onClick={() => setShowAddBtnModal(false)}>
                <span>&times;</span>
              </button>
            </div>
            <div className="sc-modal-body">
              <div className="sc-modal-field">
                <label>Текст кнопки</label>
                <input
                  className="sc-modal-input"
                  value={newBtnLabel}
                  onChange={e => setNewBtnLabel(e.target.value)}
                  placeholder="Например: Подробнее"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmAddButton()}
                />
              </div>
            </div>
            <div className="sc-modal-footer">
              <button className="sc-modal-cancel" onClick={() => setShowAddBtnModal(false)}>Отмена</button>
              <button className="sc-modal-confirm" onClick={confirmAddButton} disabled={!newBtnLabel.trim()}>
                <Plus size={16} /> Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {activeScreen && editData && (
        <NodeEditorPanel
          screenId={activeScreen}
          editData={editData}
          allScreens={scenarios.screens}
          isCustom={!SYSTEM_SCREENS.has(activeScreen)}
          onUpdateMessage={updateMessage}
          onUpdateButtonLabel={updateButtonLabel}
          onUpdateButtonAction={updateButtonAction}
          onUpdateButtonTarget={updateButtonTarget}
          onMoveButton={moveButton}
          onReorderButtons={reorderButtons}
          onAddButton={openAddBtnModal}
          onDeleteButton={deleteButton}
          onDeleteScreen={() => openDeleteModal(activeScreen)}
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
