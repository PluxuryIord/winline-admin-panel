import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, Loader, Check } from 'lucide-react';
import { api } from '../../utils/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import IosDatePicker from '../../components/UI/IosDatePicker';
import './AuditLog.css';

const ACTION_LABELS = {
  create: '\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435',
  update: '\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435',
  delete: '\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435',
  rollback: '\u041E\u0442\u043A\u0430\u0442',
};

const ACTION_COLORS = {
  create: '#22c55e',
  update: '#f59e0b',
  delete: '#ef4444',
  rollback: '#8b5cf6',
};

const ENTITY_LABELS = {
  tag: '\u0422\u0435\u0433\u0438',
  user_tags: '\u0422\u0435\u0433\u0438 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F',
  channel_tags: '\u0422\u0435\u0433\u0438 \u043A\u0430\u043D\u0430\u043B\u0430',
  group_tags: '\u0422\u0435\u0433\u0438 \u0433\u0440\u0443\u043F\u043F\u044B',
  scenarios: '\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0438',
  knowledge: '\u0411\u0430\u0437\u0430 \u0437\u043D\u0430\u043D\u0438\u0439',
};

const ENTITY_OPTIONS = [
  { value: '', label: '\u0412\u0441\u0435 \u0442\u0438\u043F\u044B' },
  { value: 'scenarios', label: '\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0438' },
  { value: 'knowledge', label: '\u0411\u0430\u0437\u0430 \u0437\u043D\u0430\u043D\u0438\u0439' },
  { value: 'user_tags', label: '\u0422\u0435\u0433\u0438 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439' },
  { value: 'channel_tags', label: '\u0422\u0435\u0433\u0438 \u043A\u0430\u043D\u0430\u043B\u043E\u0432' },
  { value: 'group_tags', label: '\u0422\u0435\u0433\u0438 \u0433\u0440\u0443\u043F\u043F' },
];

const LIMIT = 20;

function formatDate(d) {
  if (!d) return '\u2014';
  const dt = new Date(d);
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function parseVal(val) {
  if (!val) return null;
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return null; }
}

function describeChange(log) {
  const oldVal = parseVal(log.old_value);
  const newVal = parseVal(log.new_value);
  const parts = [];

  if (log.entity_type === 'scenarios') {
    if (log.entity_id && log.entity_id.includes('/')) {
      const [screen, key] = log.entity_id.split('/');
      if (oldVal?.text !== undefined && newVal?.text !== undefined) {
        parts.push(`\u042D\u043A\u0440\u0430\u043D "${screen}", \u043F\u043E\u043B\u0435 "${key}"`);
        parts.push(`\u0411\u044B\u043B\u043E: ${truncate(stripHtml(oldVal.text), 80)}`);
        parts.push(`\u0421\u0442\u0430\u043B\u043E: ${truncate(stripHtml(newVal.text), 80)}`);
      } else if (oldVal?.label !== undefined && newVal?.label !== undefined) {
        parts.push(`\u042D\u043A\u0440\u0430\u043D "${screen}", \u043A\u043D\u043E\u043F\u043A\u0430 "${key}"`);
        parts.push(`\u0411\u044B\u043B\u043E: "${oldVal.label}"`);
        parts.push(`\u0421\u0442\u0430\u043B\u043E: "${newVal.label}"`);
      }
    } else if (log.entity_label === 'full save') {
      parts.push('\u041F\u043E\u043B\u043D\u043E\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0435\u0432');
    }
  } else if (log.entity_type === 'knowledge') {
    if (log.action === 'create') {
      parts.push(`\u0421\u043E\u0437\u0434\u0430\u043D\u0430 \u0441\u0442\u0430\u0442\u044C\u044F: "${newVal?.title || log.entity_label || log.entity_id}"`);
    } else if (log.action === 'delete') {
      parts.push(`\u0423\u0434\u0430\u043B\u0435\u043D\u0430 \u0441\u0442\u0430\u0442\u044C\u044F: "${oldVal?.title || log.entity_label || log.entity_id}"`);
    } else if (log.action === 'update') {
      const label = log.entity_label || log.entity_id;
      if (oldVal?.title && newVal?.title && oldVal.title !== newVal.title) {
        parts.push(`\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0430: "${oldVal.title}" \u2192 "${newVal.title}"`);
      } else if (oldVal?.content !== undefined && newVal?.content !== undefined) {
        parts.push(`\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435: "${label}"`);
        const oldSnip = truncate(stripHtml(oldVal.content), 60);
        const newSnip = truncate(stripHtml(newVal.content), 60);
        if (oldSnip) parts.push(`\u0411\u044B\u043B\u043E: ${oldSnip}`);
        if (newSnip) parts.push(`\u0421\u0442\u0430\u043B\u043E: ${newSnip}`);
      } else {
        parts.push(`\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u043E: "${label}"`);
      }
    }
  } else if (log.entity_type?.includes('tags')) {
    const oldTags = oldVal?.tags || [];
    const newTags = newVal?.tags || [];
    const added = newTags.filter(t => !oldTags.includes(t));
    const removed = oldTags.filter(t => !newTags.includes(t));
    if (added.length) parts.push(`\u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B: ${added.join(', ')}`);
    if (removed.length) parts.push(`\u0423\u0434\u0430\u043B\u0435\u043D\u044B: ${removed.join(', ')}`);
    if (!added.length && !removed.length) parts.push(`\u0422\u0435\u0433\u0438: [${newTags.join(', ')}]`);
  }

  if (parts.length === 0 && log.entity_label) {
    parts.push(log.entity_label);
  }

  return parts;
}

function renderDetails(log) {
  const oldVal = parseVal(log.old_value);
  const newVal = parseVal(log.new_value);
  // If JSON was truncated and can't parse, show raw preview
  if (!oldVal && !newVal) {
    const raw = log.new_value || log.old_value;
    if (!raw) return null;
    return (
      <div className="audit-details">
        <div className="audit-detail-label">{log.entity_label || log.entity_id || '\u0414\u0430\u043D\u043D\u044B\u0435'}</div>
        <div className="audit-detail-diff audit-detail-new">{truncate(String(raw), 300)}</div>
      </div>
    );
  }

  // Tags
  if (log.entity_type?.includes('tags')) {
    const oldTags = oldVal?.tags || [];
    const newTags = newVal?.tags || [];
    const added = newTags.filter(t => !oldTags.includes(t));
    const removed = oldTags.filter(t => !newTags.includes(t));
    const kept = newTags.filter(t => oldTags.includes(t));
    return (
      <div className="audit-details">
        {removed.map(t => <span key={'r-' + t} className="audit-tag audit-tag-removed">{t}</span>)}
        {added.map(t => <span key={'a-' + t} className="audit-tag audit-tag-added">{t}</span>)}
        {kept.map(t => <span key={'k-' + t} className="audit-tag audit-tag-kept">{t}</span>)}
      </div>
    );
  }

  // Scenarios
  if (log.entity_type === 'scenarios') {
    if (log.entity_id?.includes('/')) {
      const [screen, key] = log.entity_id.split('/');
      const oldText = oldVal?.text ?? oldVal?.label ?? '';
      const newText = newVal?.text ?? newVal?.label ?? '';
      return (
        <div className="audit-details">
          <div className="audit-detail-label">{'\u042D\u043A\u0440\u0430\u043D'}: <strong>{screen}</strong> &rarr; {key}</div>
          {oldText && <div className="audit-detail-diff audit-detail-old">{stripHtml(String(oldText))}</div>}
          {newText && <div className="audit-detail-diff audit-detail-new">{stripHtml(String(newText))}</div>}
        </div>
      );
    }
    // Full save or other scenario changes without screen/field split
    if (log.entity_label === 'full save') {
      // Try to show a summary of what screens changed
      const oldScreens = oldVal ? Object.keys(oldVal) : [];
      const newScreens = newVal ? Object.keys(newVal) : [];
      const allScreens = [...new Set([...oldScreens, ...newScreens])];
      const changedScreens = allScreens.filter(s =>
        JSON.stringify(oldVal?.[s]) !== JSON.stringify(newVal?.[s])
      );
      return (
        <div className="audit-details">
          <div className="audit-detail-label">{'\u041F\u043E\u043B\u043D\u043E\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0435\u0432'}</div>
          {changedScreens.length > 0 ? (
            changedScreens.map(screen => (
              <span key={screen} className="audit-tag audit-tag-added">{screen}</span>
            ))
          ) : (
            <span className="audit-tag audit-tag-kept">{'\u0411\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439'}</span>
          )}
        </div>
      );
    }

    // Per-screen scenario diff — show changed messages & buttons in detail
    const diffs = [];

    // Compare messages
    const oldMsgs = oldVal?.messages || {};
    const newMsgs = newVal?.messages || {};
    for (const mk of new Set([...Object.keys(oldMsgs), ...Object.keys(newMsgs)])) {
      if (JSON.stringify(oldMsgs[mk]) !== JSON.stringify(newMsgs[mk])) {
        const label = newMsgs[mk]?.label || oldMsgs[mk]?.label || mk;
        const oText = stripHtml(String(oldMsgs[mk]?.text || ''));
        const nText = stripHtml(String(newMsgs[mk]?.text || ''));
        if (oText !== nText) {
          diffs.push({ type: 'msg', label, old: oText, new: nText });
        }
        // Check media change
        const oMedia = oldMsgs[mk]?.media?.url || '';
        const nMedia = newMsgs[mk]?.media?.url || '';
        if (oMedia !== nMedia) {
          diffs.push({ type: 'media', label, old: oMedia ? 'Было фото' : '', new: nMedia ? 'Добавлено фото' : 'Фото удалено' });
        }
      }
    }

    // Compare buttons
    const oldBtns = oldVal?.buttons || {};
    const newBtns = newVal?.buttons || {};
    for (const bk of new Set([...Object.keys(oldBtns), ...Object.keys(newBtns)])) {
      if (JSON.stringify(oldBtns[bk]) !== JSON.stringify(newBtns[bk])) {
        const oBtn = oldBtns[bk];
        const nBtn = newBtns[bk];
        if (!oBtn) {
          diffs.push({ type: 'btn', label: nBtn?.label || bk, old: '', new: 'Добавлена кнопка' });
        } else if (!nBtn) {
          diffs.push({ type: 'btn', label: oBtn?.label || bk, old: 'Удалена кнопка', new: '' });
        } else {
          if (oBtn.label !== nBtn.label) {
            diffs.push({ type: 'btn', label: bk, old: oBtn.label, new: nBtn.label });
          }
          if (oBtn.action !== nBtn.action) {
            diffs.push({ type: 'btn', label: nBtn.label || bk, old: `Действие: ${oBtn.action || '—'}`, new: `Действие: ${nBtn.action || '—'}` });
          }
        }
      }
    }

    // Compare other top-level fields (title, description, buttonOrder)
    const skipKeys = new Set(['messages', 'buttons', 'title', 'description']);
    for (const k of new Set([...Object.keys(oldVal || {}), ...Object.keys(newVal || {})])) {
      if (skipKeys.has(k)) continue;
      if (JSON.stringify(oldVal?.[k]) !== JSON.stringify(newVal?.[k])) {
        if (k === 'buttonOrder') {
          diffs.push({ type: 'order', label: 'Порядок кнопок', old: '', new: 'Изменён' });
        } else {
          diffs.push({ type: 'other', label: k, old: String(oldVal?.[k] ?? ''), new: String(newVal?.[k] ?? '') });
        }
      }
    }

    if (diffs.length === 0) {
      return (
        <div className="audit-details">
          <div className="audit-detail-label">{log.entity_label || log.entity_id || 'Сценарии'}</div>
          <span className="audit-tag audit-tag-kept">Без видимых изменений</span>
        </div>
      );
    }

    return (
      <div className="audit-details">
        {diffs.map((d, i) => (
          <div key={i} className="audit-detail-row">
            <span className="audit-detail-key">
              {d.type === 'msg' ? '💬 ' : d.type === 'btn' ? '🔘 ' : d.type === 'media' ? '🖼 ' : ''}{d.label}
            </span>
            {d.old && <span className="audit-detail-diff audit-detail-old">{truncate(d.old, 200)}</span>}
            {d.new && <span className="audit-detail-diff audit-detail-new">{truncate(d.new, 200)}</span>}
          </div>
        ))}
      </div>
    );
  }

  // Knowledge
  if (log.entity_type === 'knowledge') {
    const title = newVal?.title || oldVal?.title || log.entity_label || '';
    const oldContent = oldVal?.content ? stripHtml(oldVal.content) : '';
    const newContent = newVal?.content ? stripHtml(newVal.content) : '';
    return (
      <div className="audit-details">
        {title && <div className="audit-detail-label">{'\u0421\u0442\u0430\u0442\u044C\u044F'}: <strong>{title}</strong></div>}
        {oldContent && <div className="audit-detail-diff audit-detail-old">{truncate(oldContent, 200)}</div>}
        {newContent && <div className="audit-detail-diff audit-detail-new">{truncate(newContent, 200)}</div>}
      </div>
    );
  }

  // Fallback: show key-value pairs
  const allKeys = new Set([...Object.keys(oldVal || {}), ...Object.keys(newVal || {})]);
  const changed = [...allKeys].filter(k => JSON.stringify(oldVal?.[k]) !== JSON.stringify(newVal?.[k]));
  if (changed.length === 0) return null;
  return (
    <div className="audit-details">
      {changed.map(k => (
        <div key={k} className="audit-detail-row">
          <span className="audit-detail-key">{k}</span>
          {oldVal?.[k] !== undefined && <span className="audit-detail-diff audit-detail-old">{String(oldVal[k])}</span>}
          {newVal?.[k] !== undefined && <span className="audit-detail-diff audit-detail-new">{String(newVal[k])}</span>}
        </div>
      ))}
    </div>
  );
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/&\w+;/g, ' ').trim();
}

function truncate(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '...' : s;
}

function CustomSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="custom-select" ref={ref}>
      <button className="custom-select-trigger" onClick={() => setOpen(!open)}>
        <span>{selected.label}</span>
        <ChevronDown size={14} className={`custom-select-arrow ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <div className="custom-select-dropdown">
          {options.map(o => (
            <div
              key={o.value}
              className={`custom-select-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AuditLog() {
  const { user, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const loadMoreRef = useRef(null);

  const hasMore = logs.length < total;

  const fetchLogs = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const offset = reset ? 0 : logs.length;
      const params = new URLSearchParams({ limit: LIMIT, offset });
      if (entityType) params.set('entity_type', entityType);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await api.get(`/api/audit-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        setLogs(prev => reset ? items : [...prev, ...items]);
        setTotal(data.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [logs.length, entityType, dateFrom, dateTo]);

  // Initial load & filter changes
  useEffect(() => {
    if (authLoading || !user) return;
    setLogs([]);
    setTotal(0);
    fetchLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, dateFrom, dateTo, authLoading, user]);

  // Infinite scroll via IntersectionObserver on workspace scroll container
  useEffect(() => {
    if (!hasMore || loadingMore || loading) return;
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchLogs(false);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, fetchLogs]);

  return (
    <div className="audit-log-container">
      <h1 className="audit-log-title">{'\u0416\u0443\u0440\u043D\u0430\u043B \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439'}</h1>

      <div className="audit-filters">
        <CustomSelect
          options={ENTITY_OPTIONS}
          value={entityType}
          onChange={setEntityType}
        />
        <IosDatePicker
          compact
          value={dateFrom}
          onChange={(v) => { setDateFrom(v); }}
        />
        <IosDatePicker
          compact
          value={dateTo}
          onChange={(v) => { setDateTo(v); }}
        />
      </div>

      {loading ? (
        <div className="audit-loading"><Loader size={24} className="spin" /></div>
      ) : logs.length === 0 ? (
        <div className="audit-empty">{'\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439'}</div>
      ) : (
        <div className="audit-list">
          {logs.map((log) => {
            const changes = describeChange(log);
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id} className={`audit-card ${isExpanded ? 'expanded' : ''}`}>
                <div className="audit-card-header" onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                  <div className="audit-card-left">
                    <span
                      className="audit-action-dot"
                      style={{ background: ACTION_COLORS[log.action] || '#888' }}
                    />
                    <span className="audit-action-label">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                    <span className="audit-entity-label">
                      {ENTITY_LABELS[log.entity_type] || log.entity_type}
                    </span>
                  </div>
                  <div className="audit-card-right">
                    <span className="audit-user">{log.user_name || '\u2014'}</span>
                    <span className="audit-date">{formatDate(log.created_at)}</span>
                    {(log.old_value || log.new_value) && (
                      isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                  </div>
                </div>

                {changes.length > 0 && (
                  <div className="audit-card-summary">
                    {changes.map((line, i) => (
                      <div key={i} className={`audit-change-line ${i > 0 ? 'audit-change-detail' : ''}`}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}

                {isExpanded && renderDetails(log)}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div ref={loadMoreRef} className="audit-load-more">
          {loadingMore && <Loader size={20} className="spin" />}
        </div>
      )}
    </div>
  );
}
