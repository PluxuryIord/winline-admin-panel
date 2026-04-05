import { useState, useEffect, useCallback } from 'react';
import { Loader, X, RotateCcw, Plus } from 'lucide-react';
import { api } from '../../utils/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import './VersionHistory.css';

export default function VersionHistory() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rollbackTarget, setRollbackTarget] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/snapshots');
      if (res.ok) {
        const data = await res.json();
        setSnapshots(Array.isArray(data) ? data : data.items || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setRolling(true);
    try {
      await api.post(`/api/snapshots/${rollbackTarget.id}/rollback`);
      setRollbackTarget(null);
      fetchSnapshots();
    } catch {
      // ignore
    } finally {
      setRolling(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const handleCreateSnapshot = async () => {
    setCreating(true);
    try {
      await api.post('/api/snapshots', {});
      fetchSnapshots();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="version-history-container">
      <h1 className="version-history-title">История версий</h1>

      <div className="version-tabs">
        {isAdmin && (
          <button
            className="btn-create-snapshot"
            onClick={handleCreateSnapshot}
            disabled={creating}
          >
            {creating ? <Loader size={14} className="spin" /> : <Plus size={14} />}
            {creating ? 'Создание...' : 'Создать снимок'}
          </button>
        )}
      </div>

      <div className="version-list-wrap">
        {loading ? (
          <div className="version-loading"><Loader size={24} className="spin" /></div>
        ) : snapshots.length === 0 ? (
          <div className="version-empty">Нет сохранённых версий</div>
        ) : (
          <div className="version-list">
            {snapshots.map((snap, idx) => (
              <div key={snap.id} className={`version-item ${idx === 0 ? 'current' : ''}`}>
                <div className="version-item-info">
                  {idx === 0 && <span className="version-current-badge">Текущая</span>}
                  <span className="version-date">{formatDate(snap.created_at)}</span>
                  <span className="version-author">{snap.user_display_name || snap.username || '—'}</span>
                </div>
                {idx !== 0 && isAdmin && (
                  <button
                    className="btn-rollback"
                    onClick={() => setRollbackTarget(snap)}
                    title="Откатить к этой версии"
                  >
                    <RotateCcw size={14} /> Откатить
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rollback confirmation modal */}
      {rollbackTarget && (
        <div className="modal-overlay" onClick={() => setRollbackTarget(null)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Откат версии</h2>
              <button className="icon-btn" onClick={() => setRollbackTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p>Вы уверены? Текущие данные будут заменены на версию от <strong>{formatDate(rollbackTarget.created_at)}</strong></p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setRollbackTarget(null)}>Отмена</button>
              <button className="btn-primary" onClick={handleRollback} disabled={rolling}>
                {rolling ? 'Откат...' : 'Откатить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
