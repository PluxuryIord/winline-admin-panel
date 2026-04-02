import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Loader } from 'lucide-react';
import { api } from '../../utils/api.js';
import './AuditLog.css';

const ACTION_LABELS = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
};

const ENTITY_LABELS = {
  tag: 'Теги',
  scenario: 'Сценарии',
  knowledge: 'База знаний',
};

const ENTITY_OPTIONS = [
  { value: '', label: 'Все типы' },
  { value: 'tag', label: 'Теги' },
  { value: 'scenario', label: 'Сценарии' },
  { value: 'knowledge', label: 'База знаний' },
];

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const limit = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      if (entityType) params.set('entity_type', entityType);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await api.get(`/api/audit-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.items || data.logs || data);
        setTotal(data.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, entityType, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleFilterChange = () => {
    setPage(1);
  };

  const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatJson = (val) => {
    if (!val) return '—';
    try {
      const obj = typeof val === 'string' ? JSON.parse(val) : val;
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(val);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="audit-log-container">
      <h1 className="audit-log-title">Журнал действий</h1>

      <div className="audit-filters">
        <select
          className="audit-filter-select"
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); handleFilterChange(); }}
        >
          {ENTITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="date"
          className="audit-filter-date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); handleFilterChange(); }}
          placeholder="С"
        />
        <input
          type="date"
          className="audit-filter-date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); handleFilterChange(); }}
          placeholder="По"
        />
      </div>

      <div className="audit-table-wrap">
        {loading ? (
          <div className="audit-loading"><Loader size={24} className="spin" /></div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Дата/время</th>
                <th>Пользователь</th>
                <th>Действие</th>
                <th>Тип</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className={`audit-row ${expandedId === log.id ? 'expanded' : ''}`}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td>
                      {expandedId === log.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td>{formatDate(log.created_at)}</td>
                    <td>{log.user_display_name || log.username || '—'}</td>
                    <td>
                      <span className={`action-badge action-${log.action}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td>{ENTITY_LABELS[log.entity_type] || log.entity_type}</td>
                    <td>{log.description || '—'}</td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`${log.id}-detail`} className="audit-detail-row">
                      <td colSpan={6}>
                        <div className="audit-diff">
                          <div className="diff-block">
                            <div className="diff-label">Старое значение</div>
                            <pre className="diff-pre">{formatJson(log.old_value)}</pre>
                          </div>
                          <div className="diff-block">
                            <div className="diff-label">Новое значение</div>
                            <pre className="diff-pre">{formatJson(log.new_value)}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={6} className="empty-row">Нет записей</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="audit-pagination">
          <button
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
          </button>
          <span className="page-info">{page} / {totalPages}</span>
          <button
            className="btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
