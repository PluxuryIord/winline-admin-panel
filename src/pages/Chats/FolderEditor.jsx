import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';

export default function FolderEditor({ value, allTags = [], onSave, onDelete, onCancel }) {
  const [name, setName] = useState(value.name || '');
  const [filters, setFilters] = useState(value.filters || { tags: [], tagMode: 'any', activeOnly: false, bannedOnly: false, unreadOnly: false });

  const toggleTag = (tag) => {
    const tags = filters.tags || [];
    setFilters({
      ...filters,
      tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag],
    });
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ id: value.id, name: name.trim(), filters });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{value.id ? 'Изменить папку' : 'Новая папка'}</h2>
          <button className="icon-btn" onClick={onCancel}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <label className="form-label">Название</label>
          <input
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Новички"
            autoFocus
          />

          <label className="form-label" style={{ marginTop: 16 }}>Теги пользователей</label>
          <div className="folder-editor-tags">
            {allTags.length === 0 && <span className="muted">Нет тегов</span>}
            {allTags.map(tag => (
              <button
                key={tag}
                type="button"
                className={`tag-badge${filters.tags?.includes(tag) ? ' tag-active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          {filters.tags?.length > 0 && (
            <div className="folder-editor-mode">
              <label>
                <input
                  type="radio"
                  checked={filters.tagMode !== 'all'}
                  onChange={() => setFilters({ ...filters, tagMode: 'any' })}
                /> Любой из тегов
              </label>
              <label>
                <input
                  type="radio"
                  checked={filters.tagMode === 'all'}
                  onChange={() => setFilters({ ...filters, tagMode: 'all' })}
                /> Все теги
              </label>
            </div>
          )}

          <div className="folder-editor-checks">
            <label>
              <input
                type="checkbox"
                checked={!!filters.activeOnly}
                onChange={(e) => setFilters({ ...filters, activeOnly: e.target.checked })}
              /> Только активные (пользователь сам писал)
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!filters.unreadOnly}
                onChange={(e) => setFilters({ ...filters, unreadOnly: e.target.checked })}
              /> Только непрочитанные
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!filters.bannedOnly}
                onChange={(e) => setFilters({ ...filters, bannedOnly: e.target.checked })}
              /> Только заблокировавшие бота
            </label>
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          {onDelete ? (
            <button className="btn-danger" onClick={onDelete}>
              <Trash2 size={14} /> Удалить
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={onCancel}>Отмена</button>
            <button className="btn-primary" onClick={handleSave} disabled={!name.trim()}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
}
