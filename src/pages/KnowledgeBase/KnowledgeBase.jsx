import { useState, useEffect, useRef } from 'react';
import {
  FileText, Edit3, Save, Loader, BookOpen, Image as ImageIcon, X, Upload, Trash2,
  Plus, MoreHorizontal, Pencil, ChevronRight, ChevronDown, FolderPlus, GripVertical,
} from 'lucide-react';
import { api } from '../../utils/api.js';
import { sanitizeHtml } from '../../utils/sanitize.js';
import './KnowledgeBase.css';
import TgHtmlEditor, { tgHtmlToEditable } from '../../components/TgHtmlEditor/TgHtmlEditor';

export default function KnowledgeBase() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState(null);
  const [activeSubKey, setActiveSubKey] = useState(null); // если выбрана подтема
  const [expanded, setExpanded] = useState({}); // { parentKey: bool }
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

  // { kind: 'topic'|'subtopic', parentKey?, key, title, subCount? }
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // { kind, parentKey?, key, title }
  const [renameModal, setRenameModal] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renaming, setRenaming] = useState(false);

  // { parentKey, parentTitle }
  const [createSubModal, setCreateSubModal] = useState(null);
  const [createSubTitle, setCreateSubTitle] = useState('');
  const [creatingSub, setCreatingSub] = useState(false);

  // Kebab menu — { kind, key, parentKey? }
  const [openMenu, setOpenMenu] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  // D&D state
  const [dragTopic, setDragTopic] = useState(null);          // key being dragged
  const [dragSub, setDragSub] = useState(null);              // { parentKey, key }

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
          setActiveSubKey(null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchArticles(); }, []);

  useEffect(() => {
    if (!openMenu) return;
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenu]);

  const activeTopic = articles.find(a => a.key === activeKey);
  const activeSub = activeSubKey && activeTopic
    ? (activeTopic.subtopics || []).find(s => s.key === activeSubKey)
    : null;
  const active = activeSub || activeTopic;

  /** Open menu helper */
  const openKebab = (e, descriptor) => {
    e.stopPropagation();
    if (openMenu && openMenu.uniq === descriptor.uniq) {
      setOpenMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setMenuPos({
      top: spaceBelow < 160 ? rect.top - 130 : rect.bottom + 4,
      left: Math.min(rect.right, window.innerWidth - 200),
    });
    setOpenMenu(descriptor);
  };

  // ─── EDIT / SAVE ────────────────────────────────────────────────────────────
  const handleEdit = () => {
    if (!active) return;
    setEditContent(active.content);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const url = activeSub
        ? `/api/knowledge/${activeKey}/subtopic/${activeSub.key}`
        : `/api/knowledge/${active.key}`;
      const res = await api.put(url, { content: editContent });
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      setArticles(prev => prev.map(a => {
        if (activeSub) {
          if (a.key !== activeKey) return a;
          return {
            ...a,
            subtopics: (a.subtopics || []).map(s =>
              s.key === activeSub.key ? { ...s, content: editContent } : s
            ),
          };
        }
        return a.key === active.key ? { ...a, content: editContent } : a;
      }));
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

  // ─── PHOTO ──────────────────────────────────────────────────────────────────
  const getPhotoSrc = (item) => {
    if (!item) return null;
    if (item.photoS3Url) return item.photoS3Url;
    if (item.photoFileId) return `/api/knowledge/photo/${item.photoFileId}`;
    return null;
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !active?.photoKey) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`/api/knowledge/photo/${active.photoKey}`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        setArticles(prev => prev.map(a => {
          if (activeSub) {
            if (a.key !== activeKey) return a;
            return {
              ...a,
              subtopics: (a.subtopics || []).map(s =>
                s.key === activeSub.key
                  ? { ...s, photoFileId: data.fileId || s.photoFileId, photoS3Url: data.s3Url || s.photoS3Url }
                  : s
              ),
            };
          }
          if (a.key !== active.key) return a;
          return { ...a, photoFileId: data.fileId || a.photoFileId, photoS3Url: data.s3Url || a.photoS3Url };
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

  const handlePhotoDelete = async () => {
    if (!active?.photoKey || !active?.photoFileId) return;
    if (!confirm('Удалить фото из статьи?')) return;
    try {
      const res = await api.delete(`/api/knowledge/photo/${active.photoKey}`);
      const result = await res.json();
      if (result.ok) {
        setArticles(prev => prev.map(a => {
          if (activeSub) {
            if (a.key !== activeKey) return a;
            return {
              ...a,
              subtopics: (a.subtopics || []).map(s =>
                s.key === activeSub.key ? { ...s, photoFileId: null, photoS3Url: null } : s
              ),
            };
          }
          if (a.key !== active.key) return a;
          return { ...a, photoFileId: null, photoS3Url: null };
        }));
      }
    } catch (err) {
      alert('Ошибка удаления: ' + err.message);
    }
  };

  // ─── CRUD ───────────────────────────────────────────────────────────────────
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
        setActiveSubKey(null);
        setIsEditing(false);
      } else {
        alert('Ошибка: ' + (result.error || 'unknown'));
      }
    } catch (err) {
      alert('Ошибка создания: ' + err.message);
    }
    setCreating(false);
  };

  const handleCreateSub = async () => {
    if (!createSubModal || !createSubTitle.trim()) return;
    setCreatingSub(true);
    try {
      const res = await api.post(`/api/knowledge/${createSubModal.parentKey}/subtopic`,
        { title: createSubTitle.trim() });
      const result = await res.json();
      if (result.ok) {
        setCreateSubModal(null);
        setCreateSubTitle('');
        fetchArticles();
        setExpanded(prev => ({ ...prev, [result.parentKey]: true }));
        setActiveKey(result.parentKey);
        setActiveSubKey(result.key);
        setIsEditing(false);
      } else {
        alert('Ошибка: ' + (result.error || 'unknown'));
      }
    } catch (err) {
      alert('Ошибка создания: ' + err.message);
    }
    setCreatingSub(false);
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const url = deleteModal.kind === 'subtopic'
        ? `/api/knowledge/${deleteModal.parentKey}/subtopic/${deleteModal.key}`
        : `/api/knowledge/${deleteModal.key}`;
      const res = await api.delete(url);
      const result = await res.json();
      if (result.ok) {
        if (deleteModal.kind === 'topic' && activeKey === deleteModal.key) {
          setActiveKey(null);
          setActiveSubKey(null);
        }
        if (deleteModal.kind === 'subtopic' && activeSubKey === deleteModal.key) {
          setActiveSubKey(null);
        }
        setDeleteModal(null);
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

  const handleRename = async () => {
    if (!renameModal || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      const url = renameModal.kind === 'subtopic'
        ? `/api/knowledge/${renameModal.parentKey}/subtopic/${renameModal.key}/title`
        : `/api/knowledge/${renameModal.key}/title`;
      const res = await api.put(url, { title: renameTitle.trim() });
      const result = await res.json();
      if (result.ok) {
        setArticles(prev => prev.map(a => {
          if (renameModal.kind === 'subtopic') {
            if (a.key !== renameModal.parentKey) return a;
            return {
              ...a,
              subtopics: (a.subtopics || []).map(s =>
                s.key === renameModal.key ? { ...s, title: renameTitle.trim() } : s
              ),
            };
          }
          return a.key === renameModal.key ? { ...a, title: renameTitle.trim() } : a;
        }));
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

  // ─── D&D ────────────────────────────────────────────────────────────────────
  const persistTopicOrder = async (newOrder) => {
    try {
      await api.put('/api/knowledge/order', { order: newOrder });
    } catch (e) {
      console.error('reorder topics failed', e);
      fetchArticles(); // откатить через перезагрузку
    }
  };

  const persistSubOrder = async (parentKey, newOrder) => {
    try {
      await api.put(`/api/knowledge/${parentKey}/subtopics/order`, { order: newOrder });
    } catch (e) {
      console.error('reorder subtopics failed', e);
      fetchArticles();
    }
  };

  const onTopicDragStart = (key) => setDragTopic(key);
  const onTopicDragOver = (e) => e.preventDefault();
  const onTopicDrop = (targetKey) => {
    if (!dragTopic || dragTopic === targetKey) { setDragTopic(null); return; }
    setArticles(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(a => a.key === dragTopic);
      const toIdx = arr.findIndex(a => a.key === targetKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      persistTopicOrder(arr.map(a => a.key));
      return arr;
    });
    setDragTopic(null);
  };

  const onSubDragStart = (parentKey, subK) => setDragSub({ parentKey, key: subK });
  const onSubDrop = (parentKey, targetSubKey) => {
    if (!dragSub || dragSub.parentKey !== parentKey || dragSub.key === targetSubKey) {
      setDragSub(null);
      return;
    }
    setArticles(prev => prev.map(a => {
      if (a.key !== parentKey) return a;
      const subs = [...(a.subtopics || [])];
      const fromIdx = subs.findIndex(s => s.key === dragSub.key);
      const toIdx = subs.findIndex(s => s.key === targetSubKey);
      if (fromIdx < 0 || toIdx < 0) return a;
      const [moved] = subs.splice(fromIdx, 1);
      subs.splice(toIdx, 0, moved);
      persistSubOrder(parentKey, subs.map(s => s.key));
      return { ...a, subtopics: subs };
    }));
    setDragSub(null);
  };

  const tgHtmlToDisplay = tgHtmlToEditable;

  if (loading) {
    return (
      <div className="kb-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--color-orange)' }} />
      </div>
    );
  }

  const photoSrc = active ? getPhotoSrc(active) : null;
  // На странице темы с подтемами показываем сверху её собственный контент
  // и снизу — карточки подтем (если выбрана сама тема, не подтема).
  const isParentView = !!activeTopic && !activeSub && (activeTopic.subtopics?.length > 0);

  return (
    <div className="kb-container">

      {/* LEFT SIDEBAR */}
      <div className="kb-sidebar">
        <div className="kb-sidebar-header">
          <h3><BookOpen size={18} /> База знаний</h3>
          <button
            className="add-topic-btn"
            onClick={() => { setCreateModal(true); setCreateTitle(''); }}
            title="Добавить тему"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="kb-topic-list">
          {articles.map((article) => {
            const hasSubs = (article.subtopics || []).length > 0;
            const isOpen = !!expanded[article.key];
            const topicMenuId = `topic:${article.key}`;
            return (
              <div key={article.key}>
                <div
                  className={`kb-topic-item ${activeKey === article.key && !activeSubKey ? 'active' : ''}`}
                  draggable
                  onDragStart={() => onTopicDragStart(article.key)}
                  onDragOver={onTopicDragOver}
                  onDrop={() => onTopicDrop(article.key)}
                  onClick={() => {
                    setActiveKey(article.key);
                    setActiveSubKey(null);
                    setIsEditing(false);
                    if (hasSubs) setExpanded(prev => ({ ...prev, [article.key]: true }));
                  }}
                >
                  <GripVertical size={14} style={{ opacity: 0.3, cursor: 'grab' }} />
                  {hasSubs ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(prev => ({ ...prev, [article.key]: !prev[article.key] }));
                      }}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}
                      title={isOpen ? 'Свернуть' : 'Развернуть'}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : (
                    <FileText size={16} />
                  )}
                  <span style={{ flex: 1 }}>{article.title}</span>
                  {(article.photoFileId || article.photoS3Url) && <ImageIcon size={14} style={{ opacity: 0.4 }} />}

                  <div className="kb-item-menu-wrapper" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`kb-item-menu-btn ${openMenu?.uniq === topicMenuId ? 'open' : ''}`}
                      onClick={(e) => openKebab(e, { uniq: topicMenuId, kind: 'topic', key: article.key })}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {openMenu?.uniq === topicMenuId && (
                      <div className="kb-item-menu-dropdown" style={{ top: menuPos.top, left: menuPos.left }}>
                        <button
                          className="kb-item-menu-item"
                          onClick={() => {
                            setOpenMenu(null);
                            setCreateSubModal({ parentKey: article.key, parentTitle: article.title });
                            setCreateSubTitle('');
                          }}
                        >
                          <FolderPlus size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                          Добавить подтему
                        </button>
                        <button
                          className="kb-item-menu-item"
                          onClick={() => {
                            setOpenMenu(null);
                            setRenameModal({ kind: 'topic', key: article.key, title: article.title });
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
                            setDeleteModal({
                              kind: 'topic',
                              key: article.key,
                              title: article.title,
                              subCount: (article.subtopics || []).length,
                            });
                          }}
                        >
                          <Trash2 size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                          Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {hasSubs && isOpen && (
                  <div className="kb-subtopics">
                    {article.subtopics.map((sub) => {
                      const subMenuId = `sub:${article.key}:${sub.key}`;
                      const isActive = activeKey === article.key && activeSubKey === sub.key;
                      return (
                        <div
                          key={sub.key}
                          className={`kb-subtopic-item ${isActive ? 'active' : ''}`}
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); onSubDragStart(article.key, sub.key); }}
                          onDragOver={onTopicDragOver}
                          onDrop={(e) => { e.stopPropagation(); onSubDrop(article.key, sub.key); }}
                          onClick={() => {
                            setActiveKey(article.key);
                            setActiveSubKey(sub.key);
                            setIsEditing(false);
                          }}
                        >
                          <GripVertical size={12} style={{ opacity: 0.3, cursor: 'grab' }} />
                          <FileText size={13} />
                          <span style={{ flex: 1 }}>{sub.title}</span>
                          {(sub.photoFileId || sub.photoS3Url) && <ImageIcon size={12} style={{ opacity: 0.4 }} />}
                          <div className="kb-item-menu-wrapper" onClick={(e) => e.stopPropagation()}>
                            <button
                              className={`kb-item-menu-btn ${openMenu?.uniq === subMenuId ? 'open' : ''}`}
                              onClick={(e) => openKebab(e, { uniq: subMenuId, kind: 'subtopic', parentKey: article.key, key: sub.key })}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {openMenu?.uniq === subMenuId && (
                              <div className="kb-item-menu-dropdown" style={{ top: menuPos.top, left: menuPos.left }}>
                                <button
                                  className="kb-item-menu-item"
                                  onClick={() => {
                                    setOpenMenu(null);
                                    setRenameModal({
                                      kind: 'subtopic',
                                      parentKey: article.key,
                                      key: sub.key,
                                      title: sub.title,
                                    });
                                    setRenameTitle(sub.title);
                                  }}
                                >
                                  <Pencil size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                                  Переименовать
                                </button>
                                <button
                                  className="kb-item-menu-item danger"
                                  onClick={() => {
                                    setOpenMenu(null);
                                    setDeleteModal({
                                      kind: 'subtopic',
                                      parentKey: article.key,
                                      key: sub.key,
                                      title: sub.title,
                                    });
                                  }}
                                >
                                  <Trash2 size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                                  Удалить
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT CONTENT */}
      <div className="kb-content">
        {active ? (
          <>
            <div className="kb-content-header">
              <div className="kb-breadcrumbs">
                База знаний
                {activeSub && <> / {activeTopic?.title}</>}
              </div>
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
              <>
                <div
                  className="kb-article html-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(tgHtmlToDisplay(active.content)) }}
                />
                {isParentView && (
                  <div className="kb-subtopic-cards">
                    {activeTopic.subtopics.map(sub => (
                      <div
                        key={sub.key}
                        className="kb-subtopic-card"
                        onClick={() => { setActiveSubKey(sub.key); setIsEditing(false); }}
                      >
                        <FileText size={16} />
                        <span style={{ flex: 1 }}>{sub.title}</span>
                        <ChevronRight size={16} style={{ opacity: 0.5 }} />
                      </div>
                    ))}
                  </div>
                )}
              </>
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

      {lightboxSrc && (
        <div className="kb-lightbox" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" className="kb-lightbox-img" />
        </div>
      )}

      {/* Create topic */}
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

      {/* Create subtopic */}
      {createSubModal && (
        <div className="prompt-overlay" onClick={() => setCreateSubModal(null)}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-title">Новая подтема</div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: 0 }}>
              В теме <b>"{createSubModal.parentTitle}"</b>
            </p>
            <input
              className="prompt-input"
              placeholder="Название подтемы"
              value={createSubTitle}
              onChange={(e) => setCreateSubTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSub()}
              autoFocus
            />
            <div className="prompt-actions">
              <button className="prompt-btn prompt-btn-cancel" onClick={() => setCreateSubModal(null)}>Отмена</button>
              <button className="prompt-btn prompt-btn-ok" onClick={handleCreateSub} disabled={creatingSub || !createSubTitle.trim()}>
                {creatingSub ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete */}
      {deleteModal && (
        <div className="prompt-overlay" onClick={() => setDeleteModal(null)}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-title">
              {deleteModal.kind === 'subtopic' ? 'Удалить подтему' : 'Удалить тему'}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: 0 }}>
              {deleteModal.kind === 'subtopic' ? (
                <>Подтема <b>"{deleteModal.title}"</b> будет удалена вместе с фото. Это действие нельзя отменить.</>
              ) : deleteModal.subCount > 0 ? (
                <>
                  Тема <b>"{deleteModal.title}"</b> содержит <b>{deleteModal.subCount}</b>{' '}
                  {deleteModal.subCount === 1 ? 'подтему' : (deleteModal.subCount < 5 ? 'подтемы' : 'подтем')}.
                  Они будут удалены вместе с темой. Это действие нельзя отменить.
                </>
              ) : (
                <>Тема <b>"{deleteModal.title}"</b> будет удалена вместе с фото. Это действие нельзя отменить.</>
              )}
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

      {/* Rename */}
      {renameModal && (
        <div className="prompt-overlay" onClick={() => setRenameModal(null)}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-title">
              {renameModal.kind === 'subtopic' ? 'Переименовать подтему' : 'Переименовать тему'}
            </div>
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
