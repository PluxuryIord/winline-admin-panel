import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, X, Plus, Edit3, Trash2, Ban,
  MessageSquare, Download, ChevronDown, Save
} from 'lucide-react';
import { usersData } from '../../data/usersData';
import './UserProfile.css';

export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const user = usersData.find(u => u.id === Number(id));

  // --- State (all hooks BEFORE early return) ---
  const [tags, setTags] = useState(user?.tags || []);
  const [comment, setComment] = useState(user?.comment || '');
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [showEditDropdown, setShowEditDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(user?.fullName || '');

  const tagDropdownRef = useRef(null);
  const editDropdownRef = useRef(null);
  const exportDropdownRef = useRef(null);

  const allTags = useMemo(() => {
    const tagSet = new Set();
    usersData.forEach(u => u.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet);
  }, [tags]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target)) {
        setShowTagDropdown(false);
      }
      if (editDropdownRef.current && !editDropdownRef.current.contains(e.target)) {
        setShowEditDropdown(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // --- Early return AFTER hooks ---
  if (!user) {
    return (
      <div className="profile-not-found">
        <p>Пользователь не найден</p>
        <button onClick={() => navigate('/users')}>Назад к списку</button>
      </div>
    );
  }

  // --- Tag operations ---
  const handleRemoveTag = (tag) => {
    const updated = tags.filter(t => t !== tag);
    setTags(updated);
    user.tags = updated;
  };

  const handleAddExistingTag = (tag) => {
    if (!tags.includes(tag)) {
      const updated = [...tags, tag];
      setTags(updated);
      user.tags = updated;
    }
  };

  const handleCreateTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const updated = [...tags, trimmed];
      setTags(updated);
      user.tags = updated;
    }
    setNewTagInput('');
  };

  // --- Comment ---
  const handleSaveComment = () => {
    user.comment = comment;
    setIsEditingComment(false);
  };

  // --- Edit actions ---
  const handleSaveName = () => {
    const trimmed = editNameValue.trim();
    if (trimmed) {
      user.fullName = trimmed;
      setFullName(trimmed);
    }
    setIsEditingName(false);
  };

  const handleDeleteUser = () => {
    const idx = usersData.findIndex(u => u.id === user.id);
    if (idx !== -1) usersData.splice(idx, 1);
    navigate('/users');
  };

  const handleBanUser = () => {
    alert(`Пользователь ${fullName} заблокирован в боте (заглушка)`);
    setShowEditDropdown(false);
  };

  // --- Export ---
  const exportTXT = () => {
    const lines = [
      `Пользователь: ${fullName}`,
      `Telegram: ${user.telegram}`,
      `Статус: ${user.isPartner ? 'Партнёр' : 'Гость'}`,
      `Тип лица: ${user.entityType}`,
      `Страна: ${user.country}`,
      `Пол: ${user.gender}`,
      `Дата регистрации: ${user.registrationDate}`,
      `Комиссия: ${user.commission.toLocaleString('ru-RU')} ₽`,
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

  const exportPDF = () => {
    window.print();
    setShowExportDropdown(false);
  };

  return (
    <div className="profile-container">
      {/* Назад */}
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

              <div className="profile-tag-add-wrapper" ref={tagDropdownRef}>
                <button
                  className="profile-tag-add-btn"
                  onClick={() => setShowTagDropdown(!showTagDropdown)}
                >
                  <Plus size={14} /> Добавить тег
                </button>
                {showTagDropdown && (
                  <div className="profile-tag-dropdown">
                    {allTags.filter(t => !tags.includes(t)).length > 0 && (
                      allTags.filter(t => !tags.includes(t)).map(tag => (
                        <div
                          key={tag}
                          className="profile-tag-dropdown-item"
                          onClick={() => handleAddExistingTag(tag)}
                        >
                          {tag}
                        </div>
                      ))
                    )}
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

      {/* СРЕДНЯЯ ЧАСТЬ — два панели */}
      <div className="profile-panels">
        <div className="profile-panel">
          <h3 className="profile-panel-title">Информация</h3>
          <div className="profile-info-grid">
            <div className="info-row"><span className="info-label">Telegram</span><span className="info-value">{user.telegram}</span></div>
            <div className="info-row"><span className="info-label">Статус</span><span className="info-value">{user.isPartner ? 'Партнёр' : 'Гость'}</span></div>
            <div className="info-row"><span className="info-label">Тип лица</span><span className="info-value">{user.entityType}</span></div>
            <div className="info-row"><span className="info-label">Страна</span><span className="info-value">{user.country}</span></div>
            <div className="info-row"><span className="info-label">Пол</span><span className="info-value">{user.gender}</span></div>
            <div className="info-row"><span className="info-label">Дата регистрации</span><span className="info-value">{user.registrationDate}</span></div>
            <div className="info-row"><span className="info-label">Комиссия</span><span className="info-value">{user.commission.toLocaleString('ru-RU')} ₽</span></div>
          </div>
        </div>

        <div className="profile-panel">
          <div className="profile-panel-header">
            <h3 className="profile-panel-title">Комментарий</h3>
            <button
              className="profile-comment-edit-btn"
              onClick={() => {
                if (isEditingComment) handleSaveComment();
                else setIsEditingComment(true);
              }}
            >
              {isEditingComment ? (
                <><Save size={16} /> Сохранить</>
              ) : (
                <><Edit3 size={16} /> Редактировать</>
              )}
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
            <p className="profile-comment-text">
              {comment || 'Нет комментария'}
            </p>
          )}
        </div>
      </div>

      {/* НИЖНЯЯ ЧАСТЬ — кнопки */}
      <div className="profile-actions">
        <div className="profile-action-wrapper" ref={editDropdownRef}>
          <button
            className="profile-action-btn"
            onClick={() => setShowEditDropdown(!showEditDropdown)}
          >
            <Edit3 size={16} /> Редактировать <ChevronDown size={14} />
          </button>
          {showEditDropdown && (
            <div className="profile-action-dropdown">
              <div className="profile-action-dropdown-item" onClick={() => { setIsEditingName(true); setShowEditDropdown(false); }}>
                <Edit3 size={14} /> Изменить имя
              </div>
              <div className="profile-action-dropdown-item danger" onClick={handleDeleteUser}>
                <Trash2 size={14} /> Удалить карточку
              </div>
              <div className="profile-action-dropdown-item danger" onClick={handleBanUser}>
                <Ban size={14} /> Заблокировать в боте
              </div>
            </div>
          )}
        </div>

        <button className="profile-action-btn" onClick={() => alert('Чат (заглушка)')}>
          <MessageSquare size={16} /> Чат
        </button>

        <div className="profile-action-wrapper" ref={exportDropdownRef}>
          <button
            className="profile-action-btn"
            onClick={() => setShowExportDropdown(!showExportDropdown)}
          >
            <Download size={16} /> Экспорт карточки <ChevronDown size={14} />
          </button>
          {showExportDropdown && (
            <div className="profile-action-dropdown">
              <div className="profile-action-dropdown-item" onClick={exportTXT}>
                <Download size={14} /> Скачать TXT
              </div>
              <div className="profile-action-dropdown-item" onClick={exportPDF}>
                <Download size={14} /> Печать / PDF
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
