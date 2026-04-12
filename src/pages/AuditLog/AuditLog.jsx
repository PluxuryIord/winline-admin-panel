import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, Loader } from 'lucide-react';
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

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/&\w+;/g, ' ').trim();
}

function truncate(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '...' : s;
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
        <select
          className="audit-filter-select"
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); }}
        >
          {ENTITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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

                {isExpanded && (log.old_value || log.new_value) && (
                  <div className="audit-card-raw">
                    {log.old_value && (
                      <details>
                        <summary>{'\u0421\u0442\u0430\u0440\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 (JSON)'}</summary>
                        <pre className="audit-raw-json">{JSON.stringify(parseVal(log.old_value), null, 2)}</pre>
                      </details>
                    )}
                    {log.new_value && (
                      <details>
                        <summary>{'\u041D\u043E\u0432\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 (JSON)'}</summary>
                        <pre className="audit-raw-json">{JSON.stringify(parseVal(log.new_value), null, 2)}</pre>
                      </details>
                    )}
                  </div>
                )}
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
