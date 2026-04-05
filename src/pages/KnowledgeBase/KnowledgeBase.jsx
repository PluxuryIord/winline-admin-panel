import { useState, useEffect, useRef } from 'react';
import {
  FileText, Edit3, Save, Loader, BookOpen, Image as ImageIcon, X, Upload, Trash2,
  Plus, MoreHorizontal, Pencil
} from 'lucide-react';
import { api, getToken } from '../../utils/api.js';
import './KnowledgeBase.css';
import TgHtmlEditor from '../../components/TgHtmlEditor/TgHtmlEditor';

export default function KnowledgeBase() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteModal, setDeleteModal] = useState(null); // { key, title } or null
  const [deleting, setDeleting] = useState(false);

  const [renameModal, setRenameModal] = useState(null); // { key, title } or null
  const [renameTitle, setRenameTitle] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Kebab menu
  const [openMenu, setOpenMenu] = useState(null); // key of open menu
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const fetchArticles = () => {
    api.get('/api/knowledge')
      .then(res => {
        if (!res.ok) throw new Error(`Ошибка ${res.status}`);
        return res.json();
      })
      .then(data => {
        const list = data.articles || [];
        setArticles(list);
        if (list.length > 0 && !list.find(a => a.key === activeKey)) {
          setActiveKey(list[0].key);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchArticles(); }, []);

  // Close kebab menu on click outside
  useEffect(() => {
    if (!openMenu) return;
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenu]);

  const active = articles.find(a => a.key === activeKey);

  const handleEdit = () => {
    if (!active) return;
    setEditContent(active.content);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const res = await api.put(`/api/knowledge/${active.key}`, { content: editContent });
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      setArticles(prev => prev.map(a => a.key === active.key ? { ...a, content: editContent } : a));
      setIsEditing(false);
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent('');
  };

  /** Get photo display URL — prefer S3, fallback to proxy */
  function getPhotoSrc(article) {
    if (article.photoS3Url) return article.photoS3Url;
    if (article.photoFileId) return `/api/knowledge/photo/${article.photoFileId}`;
    return null;
  }

  /** Upload new photo for current article */
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !active?.photoKey) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const token = getToken();
      const res = await fetch(`/api/knowledge/photo/${active.photoKey}`, {
        method: 'POST',
        body: formData,
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        setArticles(prev => prev.map(a => {
          if (a.key !== active.key) return a;
          return {
            ...a,
            photoFileId: data.fileId || a.photoFileId,
            photoS3Url: data.s3Url || a.photoS3Url,
          };
        }));
      } else {
        alert('Ошибка загрузки: ' + (data.error || 'unknown'));
      }
    } catch (err) {
      alert('Ошибка загрузки: ' + err.message);
    }
    setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Delete photo from current article */
  const handlePhotoDelete = async () => {
    if (!active?.photoKey || !active?.photoFileId) return;
    if (!confirm('Удалить фото из статьи?')) return;
    try {
      const res = await api.delete(`/api/knowledge/photo/${active.photoKey}`);
      const result = await res.json();
      if (result.ok) {
        setArticles(prev => prev.map(a => {
          if (a.key !== active.key) return a;
          return { ...a, photoFileId: null, photoS3Url: null };
        }));
      }
    } catch (err) {
      alert('Ошибка удаления: ' + err.message);
    }
  };

  /** Create new topic */
  const handleCreate = async () => {
    if (!createTitle.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/api/knowledge', { title: createTitle.trim() });
      const result = await res.json();
      if (result.ok) {
        setCreateModal(false);
        setCreateTitle('');
        fetchArticles();
        setActiveKey(result.key);
        setIsEditing(false);
      } else {
        alert('Ошибка: ' + (result.error || 'unknown'));
      }
    } catch (err) {
      alert('Ошибка создания: ' + err.message);
    }
    setCreating(false);
  };

  /** Delete topic */
  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const res = await api.delete(`/api/knowledge/${deleteModal.key}`);
      const result = await res.json();
      if (result.ok) {
        setDeleteModal(null);
        if (activeKey === deleteModal.key) setActiveKey(null);
        setIsEditing(false);
        fetchArticles();
      } else {
        alert('Ошибка: ' + (result.error || 'unknown'));
      }
    } catch (err) {
      alert('Ошибка удаления: ' + err.message);
    }
    setDeleting(false);
  };

  /** Rename topic */
  const handleRename = async () => {
    if (!renameModal || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      const res = await api.put(`/api/knowledge/${renameModal.key}/title`, { title: renameTitle.trim() });
      const result = await res.json();
      if (result.ok) {
        setArticles(prev => prev.map(a =>
          a.key === renameModal.key ? { ...a, title: renameTitle.trim() } : a
        ));
        setRenameModal(null);
        setRenameTitle('');
      } else {
        alert('Ошибка: ' + (result.error || 'unknown'));
      }
    } catch (err) {
      alert('Ошибка переименования: ' + err.message);
    }
    setRenaming(false);
  };

  /** Telegram HTML → safe display HTML */
  function tgHtmlToDisplay(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
      .replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>')
      .replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>')
      .replace(/&lt;s&gt;/g, '<s>').replace(/&lt;\/s&gt;/g, '</s>')
      .replace(/&lt;code&gt;/g, '<code>').replace(/&lt;\/code&gt;/g, '</code>')
      .replace(/&lt;pre&gt;/g, '<pre>').replace(/&lt;\/pre&gt;/g, '</pre>')
      .replace(/&lt;a href=&quot;([^&]*)&quot;&gt;/g, '<a href="$1" target="_blank" rel="noopener">')
      .replace(/&lt;a href="([^"]*)"&gt;/g, '<a href="$1" target="_blank" rel="noopener">')
      .replace(/&lt;\/a&gt;/g, '</a>')
      .replace(/&lt;tg-emoji emoji-id=&quot;(\d+)&quot;&gt;[^&]*&lt;\/tg-emoji&gt;/g,
        '<img src="/emoji/$1.webp" class="tg-emoji-inline" alt="emoji" />')
      .replace(/&lt;tg-emoji emoji-id="(\d+)"&gt;[^<]*&lt;\/tg-emoji&gt;/g,
        '<img src="/emoji/$1.webp" class="tg-emoji-inline" alt="emoji" />')
      .replace(/\n/g, '<br>');
  }

  if (loading) {
    return (
      <div className="kb-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--color-orange)' }} />
      </div>
    );
  }

  const photoSrc = active ? getPhotoSrc(active) : null;

  return (
    <div className="kb-container">

      {/* LEFT SIDEBAR */}
      <div className="kb-sidebar">
        <div className="kb-sidebar-header">
          <h3><BookOpen size={18} /> База знаний</h3>
          <button className="add-topic-btn" onClick={() => { setCreateModal(true); setCreateTitle(''); }} title="Добавить тему">
            <Plus size={18} />
          </button>
        </div>

        <div className="kb-topic-list">
          {articles.map((article) => (
            <div
              key={article.key}
              className={`kb-topic-item ${activeKey === article.key ? 'active' : ''}`}
              onClick={() => { setActiveKey(article.key); setIsEditing(false); }}
            >
              <FileText size={16} />
              <span style={{ flex: 1 }}>{article.title}</span>
              {(article.photoFileId || article.photoS3Url) && <ImageIcon size={14} style={{ opacity: 0.4 }} />}

              {/* Kebab menu */}
              <div className="kb-item-menu-wrapper" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`kb-item-menu-btn ${openMenu === article.key ? 'open' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (openMenu === article.key) {
                      setOpenMenu(null);
                    } else {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const spaceBelow = window.innerHeight - rect.bottom;
                      setMenuPos({
                        top: spaceBelow < 120 ? rect.top - 90 : rect.bottom + 4,
                        left: Math.min(rect.right, window.innerWidth - 180),
                      });
                      setOpenMenu(article.key);
                    }
                  }}
                >
                  <MoreHorizontal size={16} />
                </button>
                {openMenu === article.key && (
                  <div className="kb-item-menu-dropdown" style={{ top: menuPos.top, left: menuPos.left }}>
                    <button
                      className="kb-item-menu-item"
                      onClick={() => {
                        setOpenMenu(null);
                        setRenameModal({ key: article.key, title: article.title });
                        setRenameTitle(article.title);
                      }}
                    >
                      <Pencil size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                      Переименовать
                    </button>
                    <button
                      className="kb-item-menu-item danger"
                      onClick={() => {
                        setOpenMenu(null);
                        setDeleteModal({ key: article.key, title: article.title });
                      }}
                    >
                      <Trash2 size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                      Удалить
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT CONTENT */}
      <div className="kb-content">
        {active ? (
          <>
            <div className="kb-content-header">
              <div className="kb-breadcrumbs">База знаний</div>
              <div className="kb-header-row">
                <h2>{active.title}</h2>
                {!isEditing ? (
                  <button className="kb-edit-btn" onClick={handleEdit}>
                    <Edit3 size={18} /> Редактировать
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="kb-edit-btn" onClick={handleCancel}>
                      <X size={18} /> Отмена
                    </button>
                    <button className="kb-edit-btn kb-save-btn" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader size={18} className="spin" /> : <Save size={18} />}
                      {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Photo section */}
            {active.photoKey && (
              <div className="kb-article-photo">
                {photoSrc ? (
                  <div className="kb-photo-wrapper">
                    <img
                      src={photoSrc}
                      alt=""
                      onClick={(e) => !isEditing && setLightboxSrc(e.target.src)}
                      style={{ cursor: isEditing ? 'default' : 'pointer', maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }}
                    />
                    {isEditing && (
                      <div className="kb-photo-actions">
                        <label className="kb-photo-action-btn">
                          <Upload size={14} /> Заменить
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handlePhotoUpload}
                          />
                        </label>
                        <button className="kb-photo-action-btn kb-photo-delete-btn" onClick={handlePhotoDelete}>
                          <Trash2 size={14} /> Удалить
                        </button>
                      </div>
                    )}
                    {uploadingPhoto && (
                      <div className="kb-photo-uploading">
                        <Loader size={20} className="spin" /> Загрузка...
                      </div>
                    )}
                  </div>
                ) : (
                  isEditing && (
                    <label className="kb-photo-upload-empty">
                      <Upload size={24} />
                      <span>Загрузить фото</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handlePhotoUpload}
                      />
                      {uploadingPhoto && (
                        <div className="kb-photo-uploading">
                          <Loader size={20} className="spin" /> Загрузка...
                        </div>
                      )}
                    </label>
                  )
                )}
              </div>
            )}

            {!isEditing ? (
              <div
                className="kb-article html-content"
                dangerouslySetInnerHTML={{ __html: tgHtmlToDisplay(active.content) }}
              />
            ) : (
              <div className="kb-editor-area">
                <TgHtmlEditor
                  value={editContent}
                  onChange={setEditContent}
                  minRows={15}
                  placeholder="Содержимое статьи..."
                />
              </div>
            )}
          </>
        ) : (
          <div className="kb-empty">
            <p>Выберите статью из списка слева</p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="kb-lightbox" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" className="kb-lightbox-img" />
        </div>
      )}

      {/* Create topic modal */}
      {createModal && (
        <div className="prompt-overlay" onClick={() => setCreateModal(false)}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-title">Новая тема</div>
            <input
              className="prompt-input"
              placeholder="Название темы"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="prompt-actions">
              <button className="prompt-btn prompt-btn-cancel" onClick={() => setCreateModal(false)}>Отмена</button>
              <button className="prompt-btn prompt-btn-ok" onClick={handleCreate} disabled={creating || !createTitle.trim()}>
                {creating ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete topic modal */}
      {deleteModal && (
        <div className="prompt-overlay" onClick={() => setDeleteModal(null)}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-title">Удалить тему</div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: 0 }}>
              Тема <b>"{deleteModal.title}"</b> будет удалена вместе с фото. Это действие нельзя отменить.
            </p>
            <div className="prompt-actions">
              <button className="prompt-btn prompt-btn-cancel" onClick={() => setDeleteModal(null)}>Отмена</button>
              <button className="prompt-btn prompt-btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename topic modal */}
      {renameModal && (
        <div className="prompt-overlay" onClick={() => setRenameModal(null)}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-title">Переименовать тему</div>
            <input
              className="prompt-input"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
            />
            <div className="prompt-actions">
              <button className="prompt-btn prompt-btn-cancel" onClick={() => setRenameModal(null)}>Отмена</button>
              <button className="prompt-btn prompt-btn-ok" onClick={handleRename} disabled={renaming || !renameTitle.trim()}>
                {renaming ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
