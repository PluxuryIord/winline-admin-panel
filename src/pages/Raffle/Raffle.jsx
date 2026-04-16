import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader, Trophy, Users as UsersIcon, Tag, Sparkles, RefreshCw, Check, X } from 'lucide-react';
import { api } from '../../utils/api';
import './Raffle.css';

/**
 * Raffle component — pick N random winners and bulk-tag them.
 *
 * Props (all optional):
 *   users        — pre-loaded array of {user_id, full_name, username, ...}.
 *                  When passed, no API fetch is performed.
 *   loadUsers    — async () => Array of users. Used when `users` is not given
 *                  to override the default `/api/raffles/eligible` fetch.
 *   title        — header text (default: "Розыгрыш призов")
 *   subtitle     — header subtitle
 *   poolLabel    — label under the "total pool" stat card (default: "Получили QR код")
 *   defaultTag   — initial value for the tag input (default: "Победитель")
 *   compact      — when true, hides the page-style header (used when embedded in a modal)
 */
export default function Raffle({
  users: usersProp,
  loadUsers,
  title = 'Розыгрыш призов',
  subtitle = 'Выбор случайных победителей среди обладателей QR кодов',
  poolLabel = 'Получили QR код',
  defaultTag = 'Победитель',
  compact = false,
} = {}) {
  const [eligible, setEligible] = useState(usersProp || []);
  const [loadingEligible, setLoadingEligible] = useState(!usersProp);
  const [winnerCount, setWinnerCount] = useState(Math.max(1, (usersProp || []).length));
  const [tagName, setTagName] = useState(defaultTag);
  const [drawing, setDrawing] = useState(false);
  const [winners, setWinners] = useState([]);
  const [previousWinners, setPreviousWinners] = useState([]);
  const [tagging, setTagging] = useState(false);
  const [tagResult, setTagResult] = useState(null);
  const [reelNames, setReelNames] = useState([]);
  const [drawError, setDrawError] = useState(null);
  const animTimerRef = useRef(null);

  // When parent passes a new users array, replace the pool and reset transient state.
  useEffect(() => {
    if (usersProp) {
      setEligible(usersProp);
      setWinnerCount(Math.max(1, usersProp.length));
      setLoadingEligible(false);
      setWinners([]);
      setPreviousWinners([]);
      setReelNames([]);
      setTagResult(null);
      setDrawError(null);
    }
  }, [usersProp]);

  // Load eligible users (only when no `users` prop is given)
  const loadEligibleFn = useCallback(async () => {
    if (usersProp) return;
    setLoadingEligible(true);
    try {
      let list;
      if (loadUsers) {
        list = await loadUsers();
      } else {
        const res = await api.get('/api/raffles/eligible');
        const data = await res.json();
        list = data.users || [];
      }
      setEligible(list);
      setWinnerCount(Math.max(1, list.length));
    } catch (e) {
      console.error('Failed to load eligible users:', e);
    } finally {
      setLoadingEligible(false);
    }
  }, [usersProp, loadUsers]);

  useEffect(() => { loadEligibleFn(); }, [loadEligibleFn]);

  useEffect(() => {
    return () => { if (animTimerRef.current) clearInterval(animTimerRef.current); };
  }, []);

  const userDisplayName = (u) => {
    return u.rl_full_name || u.full_name || u.username || `ID ${u.user_id}`;
  };

  const handleDraw = async () => {
    if (drawing) return;
    const previousIds = new Set(previousWinners.map(w => w.user_id));
    const pool = eligible.filter(u => !previousIds.has(u.user_id));
    const n = Math.max(1, Math.min(parseInt(winnerCount, 10) || 1, pool.length));
    if (pool.length === 0) return;

    setDrawing(true);
    setWinners([]);
    setTagResult(null);
    setDrawError(null);

    if (animTimerRef.current) clearInterval(animTimerRef.current);
    animTimerRef.current = setInterval(() => {
      const slots = [];
      for (let i = 0; i < n; i++) {
        const u = eligible[Math.floor(Math.random() * eligible.length)];
        slots.push(userDisplayName(u));
      }
      setReelNames(slots);
    }, 80);

    await new Promise(resolve => setTimeout(resolve, 2200));

    clearInterval(animTimerRef.current);
    animTimerRef.current = null;

    // Fisher-Yates shuffle, then take first N
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const drawn = shuffled.slice(0, n);

    setWinners(drawn);
    setReelNames(drawn.map(userDisplayName));
    setPreviousWinners(prev => [...prev, ...drawn]);
    setDrawing(false);
  };

  const handleReset = () => {
    setWinners([]);
    setPreviousWinners([]);
    setReelNames([]);
    setTagResult(null);
    setDrawError(null);
  };

  const handleAddTag = async () => {
    if (!winners.length || !tagName.trim()) return;
    setTagging(true);
    setTagResult(null);
    try {
      const res = await api.post('/api/raffles/tag-winners', {
        userIds: winners.map(w => w.user_id),
        tag: tagName.trim(),
      });
      const data = await res.json();
      if (data.ok) {
        setTagResult({ ok: true, count: data.tagged, tag: data.tag });
      } else {
        setTagResult({ ok: false, error: data.error || 'Ошибка' });
      }
    } catch (e) {
      setTagResult({ ok: false, error: e.message });
    } finally {
      setTagging(false);
    }
  };

  const removeWinner = (userId) => {
    setWinners(prev => prev.filter(w => w.user_id !== userId));
  };

  const remainingPool = eligible.length - previousWinners.length;

  return (
    <div className="raffle-page">
      {!compact && (
        <div className="raffle-header">
          <div>
            <h1><Trophy size={28} /> {title}</h1>
            <p className="raffle-subtitle">{subtitle}</p>
          </div>
        </div>
      )}

      <div className="raffle-stats">
        <div className="raffle-stat-card">
          <UsersIcon size={20} />
          <div>
            <div className="raffle-stat-value">{loadingEligible ? '—' : eligible.length}</div>
            <div className="raffle-stat-label">{poolLabel}</div>
          </div>
        </div>
        <div className="raffle-stat-card">
          <Trophy size={20} />
          <div>
            <div className="raffle-stat-value">{previousWinners.length}</div>
            <div className="raffle-stat-label">Уже выиграли</div>
          </div>
        </div>
        <div className="raffle-stat-card">
          <Sparkles size={20} />
          <div>
            <div className="raffle-stat-value">{remainingPool}</div>
            <div className="raffle-stat-label">Доступно для розыгрыша</div>
          </div>
        </div>
      </div>

      <div className="raffle-controls">
        <div className="raffle-control-row">
          <label>Количество победителей</label>
          <input
            type="number"
            min={1}
            max={eligible.length}
            value={winnerCount}
            onChange={e => setWinnerCount(e.target.value)}
            disabled={drawing}
          />
        </div>
        <div className="raffle-actions">
          <button
            className="raffle-draw-btn"
            onClick={handleDraw}
            disabled={drawing || loadingEligible || remainingPool === 0}
          >
            {drawing ? (
              <><Loader size={18} className="spin" /> Крутим барабан...</>
            ) : (
              <><Sparkles size={18} /> Запустить розыгрыш</>
            )}
          </button>
          {(winners.length > 0 || previousWinners.length > 0) && (
            <button className="raffle-reset-btn" onClick={handleReset} disabled={drawing}>
              <RefreshCw size={16} /> Сбросить
            </button>
          )}
        </div>
      </div>

      {drawError && !drawing && (
        <div className="raffle-error">
          <X size={18} /> {drawError}
        </div>
      )}

      {(drawing || reelNames.length > 0) && (
        <div className="raffle-reel">
          <div className="raffle-reel-title">
            {drawing ? '🎰 Выбираем победителей...' : '🎉 Победители!'}
          </div>
          <div className={`raffle-reel-list ${drawing ? 'spinning' : 'final'}`}>
            {reelNames.map((name, i) => (
              <div key={i} className="raffle-reel-item">
                <span className="raffle-reel-pos">{i + 1}.</span>
                <span className="raffle-reel-name">{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {winners.length > 0 && !drawing && (
        <div className="raffle-winners">
          <div className="raffle-winners-header">
            <h2><Trophy size={20} /> Победители ({winners.length})</h2>
          </div>
          <div className="raffle-winners-list">
            {winners.map((w, i) => (
              <div key={w.user_id} className="raffle-winner-card">
                <div className="raffle-winner-num">#{i + 1}</div>
                <div className="raffle-winner-info">
                  <div className="raffle-winner-name">{userDisplayName(w)}</div>
                  <div className="raffle-winner-meta">
                    {w.username && <span>@{w.username}</span>}
                    <span>ID: {w.user_id}</span>
                    {w.code && <span className="raffle-winner-code">{w.code}</span>}
                  </div>
                </div>
                <button className="raffle-winner-remove" onClick={() => removeWinner(w.user_id)} title="Убрать из списка">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="raffle-tag-section">
            <div className="raffle-tag-input-row">
              <Tag size={18} />
              <input
                type="text"
                value={tagName}
                onChange={e => setTagName(e.target.value)}
                placeholder="Название тега"
                disabled={tagging}
              />
              <button
                className="raffle-tag-btn"
                onClick={handleAddTag}
                disabled={tagging || !tagName.trim() || !winners.length}
              >
                {tagging ? <><Loader size={16} className="spin" /> Назначаем...</> : <><Check size={16} /> Присвоить тег</>}
              </button>
            </div>
            {tagResult && (
              <div className={`raffle-tag-result ${tagResult.ok ? 'ok' : 'err'}`}>
                {tagResult.ok
                  ? `Тег «${tagResult.tag}» назначен ${tagResult.count} победителям`
                  : `Ошибка: ${tagResult.error}`}
              </div>
            )}
          </div>
        </div>
      )}

      {!loadingEligible && eligible.length === 0 && (
        <div className="raffle-empty">
          <UsersIcon size={48} />
          <p>Пул пустой — некого разыгрывать</p>
        </div>
      )}
    </div>
  );
}
