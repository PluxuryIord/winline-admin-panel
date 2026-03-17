import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, X, Plus, Edit3, Trash2, Ban,
  MessageSquare, Download, ChevronDown, Save, Loader
} from 'lucide-react';
import { api } from '../../utils/api.js';
import './UserProfile.css';

export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState('');
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [fullName, setFullName] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [showEditDropdown, setShowEditDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const tagDropdownRef = useRef(null);
  const editDropdownRef = useRef(null);
  const exportDropdownRef = useRef(null);

  // Загрузка пользователя из API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/users/${id}`);
        if (!res.ok) throw new Error(`Ошибка ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setUser(data);
          setTags(data.tags || []);
          setComment('');
          setFullName(data.fullName || '');
          setEditNameValue(data.fullName || '');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target)) setShowTagDropdown(false);
      if (editDropdownRef.current && !editDropdownRef.current.contains(e.target)) setShowEditDropdown(false);
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) setShowExportDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Сохранение тегов на сервер
  const saveTags = useCallback(async (newTags) => {
    setTags(newTags);
    try {
      await api.put(`/api/users/${id}/tags`, { tags: newTags });
    } catch (err) {
      console.error('Failed to save tags:', err);
    }
  }, [id]);

  if (loading) {
    return (
      <div className="profile-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Loader size={32} className="spinner" />
        <span style={{ marginLeft: 12, color: '#aaa' }}>Загрузка...</span>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="profile-not-found">
        <p>{error || 'Пользователь не найден'}</p>
        <button onClick={() => navigate('/users')}>Назад к списку</button>
      </div>
    );
  }

  // --- Tag operations ---
  const handleRemoveTag = (tag) => {
    const newTags = tags.filter(t => t !== tag);
    saveTags(newTags);
  };

  const handleAddExistingTag = (tag) => {
    if (!tags.includes(tag)) {
      saveTags([...tags, tag]);
    }
  };

  const handleCreateTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      saveTags([...tags, trimmed]);
    }
    setNewTagInput('');
  };

  const handleSaveComment = () => setIsEditingComment(false);

  const handleSaveName = () => {
    const trimmed = editNameValue.trim();
    if (trimmed) setFullName(trimmed);
    setIsEditingName(false);
  };

  const handleOpenChat = async () => {
    try {
      const res = await api.get(`/api/chats/by-user/${user.id}`);
      const chat = await res.json();
      navigate(`/chats/${chat.id}`);
    } catch {
      navigate('/chats');
    }
  };

  const exportTXT = () => {
    const lines = [
      `Пользователь: ${fullName}`,
      `Telegram: ${user.telegram}`,
      `Роль: ${user.role}`,
      `Дата регистрации: ${user.registrationDate}`,
      `Забанен: ${user.banned ? 'Да' : 'Нет'}`,
      `Телефон: ${user.phone}`,
      `Теги: ${tags.join(', ') || '—'}`,
      `Комментарий: ${comment || '—'}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fullName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDropdown(false);
  };

  const exportPDF = () => { window.print(); setShowExportDropdown(false); };

  const knownTags = ['Старый пользователь', 'VIP', 'Арбитраж', 'SEO', 'Новичок', 'Агентство'];
  const availableTags = knownTags.filter(t => !tags.includes(t));

  return (
    <div className="profile-container">
      <button className="profile-back-btn" onClick={() => navigate('/users')}>
        <ArrowLeft size={18} /> Назад
      </button>

      {/* ВЕРХНЯЯ КАРТОЧКА */}
      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-avatar-large">
            {fullName.charAt(0)}
          </div>
          <div className="profile-header-info">
            {isEditingName ? (
              <div className="profile-name-edit">
                <input
                  className="profile-name-input"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                />
                <button className="profile-name-save" onClick={handleSaveName}>
                  <Save size={16} />
                </button>
              </div>
            ) : (
              <h1 className="profile-name">{fullName}</h1>
            )}

            {/* Теги */}
            <div className="profile-tags-row">
              {tags.map(tag => (
                <span key={tag} className="profile-tag">
                  {tag}
                  <button className="profile-tag-x" onClick={() => handleRemoveTag(tag)}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              {user.banned && (
                <span className="profile-tag">Забанен</span>
              )}

              <div className="profile-tag-add-wrapper" ref={tagDropdownRef}>
                <button className="profile-tag-add-btn" onClick={() => setShowTagDropdown(!showTagDropdown)}>
                  <Plus size={14} /> Добавить тег
                </button>
                {showTagDropdown && (
                  <div className="profile-tag-dropdown">
                    {availableTags.map(tag => (
                      <div key={tag} className="profile-tag-dropdown-item" onClick={() => handleAddExistingTag(tag)}>
                        {tag}
                      </div>
                    ))}
                    <div className="profile-tag-dropdown-input-row">
                      <input
                        className="profile-tag-dropdown-input"
                        placeholder="Новый тег..."
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                        autoFocus
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* СРЕДНЯЯ ЧАСТЬ */}
      <div className="profile-panels">
        <div className="profile-panel">
          <h3 className="profile-panel-title">Информация</h3>
          <div className="profile-info-grid">
            <div className="info-row"><span className="info-label">Telegram</span><span className="info-value">{user.telegram}</span></div>
            <div className="info-row"><span className="info-label">Роль</span><span className="info-value">{user.role}</span></div>
            <div className="info-row"><span className="info-label">График</span><span className="info-value">{user.graph}</span></div>
            <div className="info-row"><span className="info-label">Телефон</span><span className="info-value">{user.phone}</span></div>
            <div className="info-row"><span className="info-label">Дата регистрации</span><span className="info-value">{user.registrationDate}</span></div>
            <div className="info-row"><span className="info-label">Забанен</span><span className="info-value">{user.banned ? 'Да' : 'Нет'}</span></div>
            <div className="info-row"><span className="info-label">Зарегистрирован</span><span className="info-value">{user.registered ? 'Да' : 'Нет'}</span></div>
          </div>
        </div>

        <div className="profile-panel">
          <div className="profile-panel-header">
            <h3 className="profile-panel-title">Комментарий</h3>
            <button
              className="profile-comment-edit-btn"
              onClick={() => { if (isEditingComment) handleSaveComment(); else setIsEditingComment(true); }}
            >
              {isEditingComment ? <><Save size={16} /> Сохранить</> : <><Edit3 size={16} /> Редактировать</>}
            </button>
          </div>
          {isEditingComment ? (
            <textarea
              className="profile-comment-textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Добавьте комментарий..."
              autoFocus
            />
          ) : (
            <p className="profile-comment-text">{comment || 'Нет комментария'}</p>
          )}
        </div>
      </div>

      {/* НИЖНЯЯ ЧАСТЬ */}
      <div className="profile-actions">
        <div className="profile-action-wrapper" ref={editDropdownRef}>
          <button className="profile-action-btn" onClick={() => setShowEditDropdown(!showEditDropdown)}>
            <Edit3 size={16} /> Редактировать <ChevronDown size={14} />
          </button>
          {showEditDropdown && (
            <div className="profile-action-dropdown">
              <div className="profile-action-dropdown-item" onClick={() => { setIsEditingName(true); setShowEditDropdown(false); }}>
                <Edit3 size={14} /> Изменить имя
              </div>
            </div>
          )}
        </div>

        <button className="profile-action-btn" onClick={handleOpenChat}>
          <MessageSquare size={16} /> Чат
        </button>

        <div className="profile-action-wrapper" ref={exportDropdownRef}>
          <button className="profile-action-btn" onClick={() => setShowExportDropdown(!showExportDropdown)}>
            <Download size={16} /> Экспорт карточки <ChevronDown size={14} />
          </button>
          {showExportDropdown && (
            <div className="profile-action-dropdown">
              <div className="profile-action-dropdown-item" onClick={exportTXT}>
                <Download size={14} /> Скачать TXT
              </div>
              <div className="profile-action-dropdown-item" onClick={exportPDF}>
                <Download size={14} /> Сохранить PDF
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
