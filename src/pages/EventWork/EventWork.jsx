import { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode, BarChart2, Settings, ExternalLink, Search,
  X, Copy, Check, Eye, Gift, ScanLine, Calendar,
  ChevronLeft, ChevronRight, Trash2, RefreshCw, Info,
  ToggleLeft, ToggleRight, Upload, ImageIcon,
} from 'lucide-react';
import { api } from '../../utils/api';
import './EventWork.css';

const PAGE_SIZE = 30;

// ─── Stats Bar (always visible at top) ─────────────────────────────────────

function StatsBar() {
  const [stats, setStats] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/api/events/stats');
      setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); const i = setInterval(fetchStats, 30000); return () => clearInterval(i); }, [fetchStats]);

  if (!stats) return null;

  const cards = [
    { icon: <QrCode size={18} />, label: 'Всего кодов', value: stats.totalCodes },
    { icon: <Gift size={18} />, label: 'Активные', value: stats.activeCodes },
    { icon: <ScanLine size={18} />, label: 'Использованные', value: stats.usedCodes },
  ];

  return (
    <div className="ew-stats-bar">
      {cards.map(c => (
        <div key={c.label} className="ew-mini-stat">
          <div className="ew-mini-stat-icon">{c.icon}</div>
          <div className="ew-mini-stat-info">
            <span className="ew-mini-stat-value">{c.value}</span>
            <span className="ew-mini-stat-label">{c.label}</span>
          </div>
        </div>
      ))}
      {stats.codeLimit > 0 && (
        <div className="ew-mini-stat ew-mini-stat--limit">
          <div className="ew-mini-stat-info">
            <span className="ew-mini-stat-value">{stats.totalCodes} / {stats.codeLimit}</span>
            <span className="ew-mini-stat-label">Лимит</span>
          </div>
          <div className="ew-mini-limit-bar">
            <div className="ew-mini-limit-fill" style={{ width: `${Math.min(100, (stats.totalCodes / stats.codeLimit) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QR Codes (main content) ──────────────────────────────────────────────

function CodesSection() {
  const [codes, setCodes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrModal, setQrModal] = useState(null);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/api/events/codes?${params}`);
      const data = await res.json();
      setCodes(data.codes || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('Failed to load codes:', e);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const handleSearch = (e) => { e.preventDefault(); setPage(0); setSearch(searchInput.trim()); };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'used' : 'active';
    try {
      await fetch(`/api/events/codes/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchCodes();
    } catch (e) { alert('Ошибка: ' + e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить этот QR-код?')) return;
    try { await api.delete(`/api/events/codes/${id}`); fetchCodes(); }
    catch (e) { alert('Ошибка: ' + e.message); }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      {/* Table */}
      <div className="ew-table-wrap">
        <table className="ew-table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Пользователь</th>
              <th>Статус</th>
              <th>Создан</th>
              <th>Использован</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="ew-table-empty">Загрузка...</td></tr>
            ) : codes.length === 0 ? (
              <tr><td colSpan={6} className="ew-table-empty">Нет QR-кодов. Коды появятся когда пользователи нажмут «Я на мероприятии» в боте.</td></tr>
            ) : codes.map(c => (
              <tr key={c.id}>
                <td className="ew-td-code">{c.code}</td>
                <td>
                  <div className="ew-user-cell">
                    <span className="ew-user-name">{c.userName || c.label || '—'}</span>
                    {c.username && <span className="ew-user-username">@{c.username}</span>}
                  </div>
                </td>
                <td><span className={`ew-status-badge ${c.status}`}>{c.status === 'used' ? 'Использован' : 'Активный'}</span></td>
                <td className="ew-td-date">{c.createdAt ? new Date(c.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="ew-td-date">{c.usedAt ? new Date(c.usedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td>
                  <div className="ew-actions-cell">
                    <button className="ew-qr-btn" onClick={() => setQrModal(c.code)} title="Показать QR"><Eye size={16} /></button>
                    <button className={`ew-toggle-status-btn ${c.status}`} onClick={() => handleToggleStatus(c.id, c.status)} title={c.status === 'active' ? 'Пометить использованным' : 'Активировать'}><RefreshCw size={14} /></button>
                    <button className="ew-disable-btn" onClick={() => handleDelete(c.id)} title="Удалить"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ew-pagination">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
          <span>{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
          <span className="ew-total-label">Всего: {total}</span>
        </div>
      )}

      {/* QR Modal */}
      {qrModal && (
        <div className="ew-modal-overlay" onClick={() => setQrModal(null)}>
          <div className="ew-qr-modal" onClick={e => e.stopPropagation()}>
            <button className="ew-qr-modal-close" onClick={() => setQrModal(null)}><X size={20} /></button>
            <h3>QR-код: {qrModal}</h3>
            <div className="ew-qr-image-wrap">
              <img src={`/api/events/codes/${encodeURIComponent(qrModal)}/qr-card?t=${Date.now()}`} alt={`QR ${qrModal}`} className="ew-qr-image" />
            </div>
            <p className="ew-qr-hint">Отсканируйте QR-код камерой или на странице хостес</p>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────

// ─── QR Card Preview (server-rendered) ───────────────────────────────────

function QrCardPreview({ saved }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    // Use server endpoint to render actual card preview
    setPreviewUrl(`/api/events/codes/PREVIEW/qr-card?t=${Date.now()}`);
  }, [saved]);

  return previewUrl ? (
    <img src={previewUrl} alt="QR Card Preview" className="ew-qr-preview-img" />
  ) : (
    <div className="ew-qr-preview-empty">Сохраните шаблон для превью</div>
  );
}

function TestQrSection() {
  const [testCode, setTestCode] = useState(null);
  const [creating, setCreating] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);

  const handleCreate = async () => {
    setCreating(true); setScanResult(null);
    try {
      const res = await api.post('/api/events/test-qr');
      const data = await res.json();
      if (data.ok) setTestCode(data.code);
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setCreating(false); }
  };

  const handleScan = async () => {
    if (!testCode) return;
    setScanning(true);
    try {
      const res = await fetch('/api/events/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: testCode }),
      });
      const data = await res.json();
      setScanResult(data);
    } catch (e) { setScanResult({ status: 'error', message: e.message }); }
    finally { setScanning(false); }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const res = await api.delete('/api/events/test-qr');
      const data = await res.json();
      setTestCode(null); setScanResult(null);
      alert(`Удалено ${data.deleted} тестовых кодов`);
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setCleaning(false); }
  };

  return (
    <div className="ew-test-qr">
      <div className="ew-test-qr-actions">
        <button className="ew-save-btn" onClick={handleCreate} disabled={creating}>
          <QrCode size={14} /> {creating ? 'Создание...' : 'Создать тестовый код'}
        </button>
        <button className="ew-qr-remove-bg-btn" onClick={handleCleanup} disabled={cleaning}>
          <Trash2 size={14} /> {cleaning ? 'Удаление...' : 'Удалить все тестовые'}
        </button>
      </div>

      {testCode && (
        <div className="ew-test-qr-result">
          <div className="ew-test-qr-code-label">
            Код: <code>{testCode}</code>
          </div>
          <div className="ew-test-qr-card">
            <img
              src={`/api/events/codes/${testCode}/qr-card?t=${Date.now()}`}
              alt="Test QR"
              className="ew-test-qr-card-img"
            />
          </div>
          <div className="ew-test-qr-scan-row">
            <button className="ew-save-btn" onClick={handleScan} disabled={scanning}>
              <ScanLine size={14} /> {scanning ? 'Сканирование...' : 'Тестовое сканирование'}
            </button>
          </div>
          {scanResult && (
            <div className={`ew-test-qr-scan-result ew-test-qr-scan-result--${scanResult.status}`}>
              {scanResult.status === 'give' && <><Check size={16} /> {scanResult.message}</>}
              {scanResult.status === 'already' && <><Info size={16} /> {scanResult.message}</>}
              {scanResult.status === 'not_found' && <><X size={16} /> {scanResult.message}</>}
              {scanResult.status === 'error' && <><X size={16} /> Ошибка: {scanResult.message}</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsModal({ onClose }) {
  const [eventStarts, setEventStarts] = useState(false);
  const [codeLimit, setCodeLimit] = useState(0);
  const [qrCaptionText, setQrCaptionText] = useState('');
  const [qrBgUrl, setQrBgUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const hostessUrl = `${window.location.origin}/hostess`;

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/events/settings');
        const data = await res.json();
        setEventStarts(!!data.event_starts);
        setCodeLimit(data.code_limit ?? 0);
        setQrCaptionText(data.qr_caption_text ?? '');
        setQrBgUrl(data.qr_bg_url ?? '');
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await api.put('/api/events/toggle', { enabled: !eventStarts });
      const data = await res.json();
      if (data.ok) setEventStarts(data.event_starts);
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setToggling(false); }
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/api/events/settings', {
        code_limit: Number(codeLimit),
        qr_caption_text: qrCaptionText,
        qr_bg_url: qrBgUrl,
      });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleBgUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const res = await api.post('/api/upload', { data: reader.result });
        const data = await res.json();
        if (data.url) setQrBgUrl(data.url);
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (e) { alert('Ошибка загрузки: ' + e.message); setUploading(false); }
  };

  const handleRemoveBg = () => setQrBgUrl('');

  const handleReset = async () => {
    if (!confirm('Вы уверены? Все QR-коды и сканирования будут удалены. Это необратимо!')) return;
    try {
      const res = await api.delete('/api/events/codes/all');
      const data = await res.json();
      if (data.ok) alert(`Удалено ${data.deleted} кодов. Можно начинать новое мероприятие.`);
    } catch (e) { alert('Ошибка: ' + e.message); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(hostessUrl);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ew-modal-overlay" onClick={onClose}>
      <div className="ew-settings-modal ew-settings-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="ew-settings-modal-header">
          <h2><Settings size={20} /> Настройки мероприятия</h2>
          <button className="ew-qr-modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {loading ? <div className="ew-loading">Загрузка...</div> : (
          <div className="ew-settings-modal-body">

            {/* QR Card Editor */}
            <div className="ew-settings-section">
              <h3><ImageIcon size={18} /> Шаблон QR-карточки</h3>
              <p className="ew-settings-desc">Настройте текст карточки, которую получат пользователи в боте</p>

              <div className="ew-qr-editor ew-qr-editor--vertical">
                {/* Preview — large, on top */}
                <div className="ew-qr-editor-preview ew-qr-editor-preview--large">
                  <QrCardPreview saved={saved} />
                </div>

                {/* Caption + Save — below preview */}
                <div className="ew-qr-editor-controls ew-qr-editor-controls--below">
                  <div className="ew-qr-editor-field">
                    <label>Фоновое изображение</label>
                    <div className="ew-qr-bg-actions">
                      <button className="ew-qr-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <Upload size={14} /> {uploading ? 'Загрузка...' : qrBgUrl ? 'Заменить фон' : 'Загрузить фон'}
                      </button>
                      {qrBgUrl && (
                        <button className="ew-qr-remove-bg-btn" onClick={handleRemoveBg}>
                          <X size={14} /> По умолчанию
                        </button>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />
                    {qrBgUrl ? <span className="ew-qr-bg-hint">Кастомный фон загружен</span> : <span className="ew-qr-bg-hint">Используется шаблон Winline Partners</span>}
                  </div>

                  <div className="ew-qr-editor-field">
                    <label>Текст под QR-кодом</label>
                    <textarea
                      className="ew-settings-textarea"
                      rows={3}
                      value={qrCaptionText}
                      onChange={e => setQrCaptionText(e.target.value)}
                      placeholder="ЭКСПО, стенд F3"
                    />
                  </div>

                  <button className={`ew-save-btn ${saved ? 'saved' : ''}`} onClick={handleSave} disabled={saving}>
                    {saved ? <><Check size={16} /> Сохранено</> : saving ? 'Сохранение...' : 'Сохранить шаблон'}
                  </button>
                </div>
              </div>
            </div>

            {/* Test QR */}
            <div className="ew-settings-section">
              <h3><QrCode size={18} /> Тестовый QR-код</h3>
              <p className="ew-settings-desc">Создайте тестовый код чтобы проверить как он выглядит и как работает сканирование</p>
              <TestQrSection />
            </div>

            {/* Limit */}
            <div className="ew-settings-section">
              <h3>Лимит QR-кодов</h3>
              <p className="ew-settings-desc">Максимальное количество кодов. 0 = безлимит.</p>
              <div className="ew-settings-row">
                <input type="number" className="ew-settings-input" value={codeLimit} onChange={e => setCodeLimit(e.target.value)} min={0} />
              </div>
            </div>

            {/* Hostess link */}
            <div className="ew-settings-section">
              <h3>Страница хостес</h3>
              <div className="ew-hostess-compact">
                <a href="/hostess" target="_blank" rel="noopener noreferrer" className="ew-hostess-open-btn">
                  <ExternalLink size={16} /> Открыть
                </a>
                <button className="ew-hostess-copy-btn" onClick={handleCopy}>
                  {copied ? <><Check size={14} /> Скопировано</> : <><Copy size={14} /> Ссылка</>}
                </button>
                <span className="ew-hostess-url-small">{hostessUrl}</span>
              </div>
            </div>

            {/* Reset */}
            <div className="ew-settings-section ew-danger-section">
              <h3>Сброс кодов</h3>
              <p className="ew-settings-desc">Удалить все коды и сканирования. Необратимо.</p>
              <button className="ew-reset-btn" onClick={handleReset}>
                <Trash2 size={16} /> Сбросить все коды
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

function EventToggle() {
  const [eventStarts, setEventStarts] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/events/settings');
        const data = await res.json();
        setEventStarts(!!data.event_starts);
      } catch {}
      finally { setLoaded(true); }
    })();
  }, []);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await api.put('/api/events/toggle', { enabled: !eventStarts });
      const data = await res.json();
      if (data.ok) setEventStarts(data.event_starts);
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setToggling(false); }
  };

  if (!loaded) return null;

  return (
    <button
      className={`ew-header-toggle ${eventStarts ? 'on' : ''}`}
      onClick={handleToggle}
      disabled={toggling}
      title={eventStarts ? 'Мероприятие активно' : 'Мероприятие выключено'}
    >
      {eventStarts ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
      <span className="ew-header-toggle-label">{eventStarts ? 'Активно' : 'Выключено'}</span>
    </button>
  );
}

export default function EventWork() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="ew-container">
      <div className="ew-header">
        <div className="ew-header-left">
          <div className="ew-header-title-row">
            <h1>Работа на ивенте</h1>
            <EventToggle />
          </div>
          <p>QR-коды, сканирования и управление мероприятием</p>
        </div>
        <button className="ew-settings-btn" onClick={() => setSettingsOpen(true)}>
          <Settings size={18} /> Настройки
        </button>
      </div>

      <StatsBar />
      <CodesSection />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
