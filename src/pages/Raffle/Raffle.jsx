import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader, Trophy, Users as UsersIcon, Tag, Sparkles, RefreshCw, Check, X } from 'lucide-react';
import { api } from '../../utils/api';
import './Raffle.css';

export default function Raffle() {
  const [eligible, setEligible] = useState([]);
  const [loadingEligible, setLoadingEligible] = useState(true);
  const [winnerCount, setWinnerCount] = useState(1);
  const [tagName, setTagName] = useState('Победитель');
  const [drawing, setDrawing] = useState(false);
  const [winners, setWinners] = useState([]);
  const [previousWinners, setPreviousWinners] = useState([]); // exclude from re-draws in same session
  const [tagging, setTagging] = useState(false);
  const [tagResult, setTagResult] = useState(null);
  const [reelNames, setReelNames] = useState([]); // for animation
  const [drawError, setDrawError] = useState(null);
  const animTimerRef = useRef(null);

  // Load eligible users
  const loadEligible = useCallback(async () => {
    setLoadingEligible(true);
    try {
      const res = await api.get('/api/raffles/eligible');
      const data = await res.json();
      const users = data.users || [];
      setEligible(users);
      setWinnerCount(Math.max(1, users.length));
    } catch (e) {
      console.error('Failed to load eligible users:', e);
    } finally {
      setLoadingEligible(false);
    }
  }, []);

  useEffect(() => { loadEligible(); }, [loadEligible]);

  // Cleanup animation timer
  useEffect(() => {
    return () => { if (animTimerRef.current) clearInterval(animTimerRef.current); };
  }, []);

  const userDisplayName = (u) => {
    return u.rl_full_name || u.full_name || u.username || `ID ${u.user_id}`;
  };

  const handleDraw = async () => {
    if (drawing) return;
    const n = Math.max(1, Math.min(parseInt(winnerCount, 10) || 1, eligible.length));
    if (eligible.length === 0) return;

    setDrawing(true);
    setWinners([]);
    setTagResult(null);
    setDrawError(null);

    // Start spinning animation with random names from eligible pool
    if (animTimerRef.current) clearInterval(animTimerRef.current);
    animTimerRef.current = setInterval(() => {
      const slots = [];
      for (let i = 0; i < n; i++) {
        const u = eligible[Math.floor(Math.random() * eligible.length)];
        slots.push(userDisplayName(u));
      }
      setReelNames(slots);
    }, 80);

    try {
      // Wait at least 2.2s for the animation effect
      const [res] = await Promise.all([
        api.post('/api/raffles/draw', {
          count: n,
          excludeUserIds: previousWinners.map(w => w.user_id),
        }),
        new Promise(resolve => setTimeout(resolve, 2200)),
      ]);

      clearInterval(animTimerRef.current);
      animTimerRef.current = null;

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDrawError(data.error || `HTTP ${res.status}`);
        setReelNames([]);
        return;
      }

      const drawn = Array.isArray(data.winners) ? data.winners : [];
      if (drawn.length === 0) {
        setDrawError('Сервер не вернул победителей. Возможно, пул пустой.');
        setReelNames([]);
        return;
      }

      setWinners(drawn);
      setReelNames(drawn.map(userDisplayName));
      setPreviousWinners(prev => [...prev, ...drawn]);
    } catch (e) {
      clearInterval(animTimerRef.current);
      animTimerRef.current = null;
      setDrawError(e.message || 'Сетевая ошибка');
      setReelNames([]);
    } finally {
      setDrawing(false);
    }
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
      <div className="raffle-header">
        <div>
          <h1><Trophy size={28} /> Розыгрыш призов</h1>
          <p className="raffle-subtitle">Выбор случайных победителей среди обладателей QR кодов</p>
        </div>
      </div>

      <div className="raffle-stats">
        <div className="raffle-stat-card">
          <UsersIcon size={20} />
          <div>
            <div className="raffle-stat-value">{loadingEligible ? '—' : eligible.length}</div>
            <div className="raffle-stat-label">Получили QR код</div>
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

      {/* Error display */}
      {drawError && !drawing && (
        <div className="raffle-error">
          <X size={18} /> {drawError}
        </div>
      )}

      {/* Reel display during animation */}
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

      {/* Winner list with details */}
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
                    <span className="raffle-winner-code">{w.code}</span>
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
          <p>Никто ещё не получил QR код мероприятия</p>
        </div>
      )}
    </div>
  );
}
