import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  Folder, FileText, Plus, Edit3, Save, Trash2,
  ChevronRight, ChevronDown, Loader, MoreHorizontal
} from 'lucide-react';
import WysiwygEditor from './WysiwygEditor';
import PromptModal from './PromptModal';
import './KnowledgeBase.css';

export default function KnowledgeBase() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [modal, setModal] = useState(null);
  const [editingTitle, setEditingTitle] = useState(null); // { id, value, content }
  const [openMenu, setOpenMenu] = useState(null); // id элемента с открытым меню
  const [lightboxSrc, setLightboxSrc] = useState(null); // src открытой картинки

  // Закрываем меню по клику снаружи
  useEffect(() => {
    if (!openMenu) return;
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenu]);

  // Загрузка данных из API
  useEffect(() => {
    fetch('/api/knowledge')
      .then(res => res.json())
      .then(data => {
        setTopics(data);
        if (data.length > 0) {
          setActiveItem({ type: 'topic', id: data[0].id, data: data[0] });
          setExpandedFolders([data[0].id]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleFolder = (id) => {
    setExpandedFolders(prev =>
      prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]
    );
  };

  const handleSelectTopic = (topic) => {
    setActiveItem({ type: 'topic', id: topic.id, data: topic });
    setIsEditing(false);
    if (!expandedFolders.includes(topic.id)) {
      setExpandedFolders(prev => [...prev, topic.id]);
    }
  };

  const handleSelectSubtopic = (subtopic, parentTopic) => {
    setActiveItem({ type: 'subtopic', id: subtopic.id, data: subtopic, parentTitle: parentTopic.title });
    setIsEditing(false);
  };

  const handleEditClick = () => {
    setEditContent(activeItem.data.content);
    setIsEditing(true);
  };

  const handleSaveClick = async () => {
    await fetch(`/api/knowledge/${activeItem.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: activeItem.data.title, content: editContent })
    });
    const updatedData = { ...activeItem.data, content: editContent };
    setActiveItem(prev => ({ ...prev, data: updatedData }));
    if (activeItem.type === 'topic') {
      setTopics(prev => prev.map(t => t.id === activeItem.id ? { ...t, content: editContent } : t));
    } else {
      setTopics(prev => prev.map(t => ({
        ...t,
        subtopics: t.subtopics.map(s => s.id === activeItem.id ? { ...s, content: editContent } : s)
      })));
    }
    setIsEditing(false);
  };

  const handleAddTopic = () => {
    setModal({
      title: 'Название новой темы',
      placeholder: 'Введите название...',
      onConfirm: async (title) => {
        setModal(null);
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content: '' })
        });
        const newTopic = await res.json();
        const topicWithSubs = { ...newTopic, subtopics: [] };
        setTopics(prev => [...prev, topicWithSubs]);
        setActiveItem({ type: 'topic', id: newTopic.id, data: topicWithSubs });
      }
    });
  };

  const handleAddSubtopic = (parentId) => {
    setModal({
      title: 'Название подтемы',
      placeholder: 'Введите название...',
      onConfirm: async (title) => {
        setModal(null);
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content: '', parent_id: parentId })
        });
        const newSub = await res.json();
        setTopics(prev => prev.map(t =>
          t.id === parentId ? { ...t, subtopics: [...t.subtopics, newSub] } : t
        ));
        if (!expandedFolders.includes(parentId)) {
          setExpandedFolders(prev => [...prev, parentId]);
        }
      }
    });
  };

  const handleRenameStart = (item) => {
    setEditingTitle({ id: item.id, value: item.title, content: item.content || '' });
  };

  const handleRenameSave = async () => {
    if (!editingTitle) return;
    const { id, value, content } = editingTitle;
    setEditingTitle(null);
    if (!value.trim()) return;
    await fetch(`/api/knowledge/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: value.trim(), content }),
    });
    setTopics(prev => prev.map(t => {
      if (t.id === id) return { ...t, title: value.trim() };
      return { ...t, subtopics: t.subtopics.map(s => s.id === id ? { ...s, title: value.trim() } : s) };
    }));
    if (activeItem?.id === id) {
      setActiveItem(prev => ({ ...prev, data: { ...prev.data, title: value.trim() } }));
    }
  };

  const handleRenameKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleRenameSave();
    if (e.key === 'Escape') setEditingTitle(null);
  };

  const handleDelete = (id, type, parentId) => {
    const label = type === 'topic' ? 'тему и все подтемы' : 'подтему';
    setModal({
      title: `Удалить ${label}?`,
      placeholder: null,
      onConfirm: async () => {
        setModal(null);
        await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
        if (type === 'topic') {
          const updated = topics.filter(t => t.id !== id);
          setTopics(updated);
          if (activeItem?.id === id) {
            setActiveItem(updated.length > 0 ? { type: 'topic', id: updated[0].id, data: updated[0] } : null);
          }
        } else {
          setTopics(prev => prev.map(t => ({
            ...t,
            subtopics: t.subtopics.filter(s => s.id !== id)
          })));
          if (activeItem?.id === id) {
            const parent = topics.find(t => t.id === parentId);
            if (parent) setActiveItem({ type: 'topic', id: parent.id, data: parent });
          }
        }
        setIsEditing(false);
      }
    });
  };

  // Кнопка ⋯ с выпадающим меню
  const ItemMenu = ({ id, actions }) => (
    <div className="kb-item-menu-wrapper" onClick={e => e.stopPropagation()}>
      <button
        className={`kb-item-menu-btn${openMenu === id ? ' open' : ''}`}
        onClick={(e) => { e.stopPropagation(); setOpenMenu(prev => prev === id ? null : id); }}
      >
        <MoreHorizontal size={15} />
      </button>
      {openMenu === id && (
        <div className="kb-item-menu-dropdown">
          {actions.map(action => (
            <button
              key={action.label}
              className={`kb-item-menu-item${action.danger ? ' danger' : ''}`}
              onClick={() => { setOpenMenu(null); action.fn(); }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="kb-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--color-orange)' }} />
      </div>
    );
  }

  return (
    <div className="kb-container">

      {/* ЛЕВАЯ КОЛОНКА */}
      <div className="kb-sidebar">
        <div className="kb-sidebar-header">
          <h3>Разделы Wiki</h3>
          <button className="add-topic-btn" title="Создать новую тему" onClick={handleAddTopic}>
            <Plus size={18} />
          </button>
        </div>

        <div className="kb-topic-list">
          {topics.map((topic) => {
            const isFolderExpanded = expandedFolders.includes(topic.id);
            const isTopicActive = activeItem?.type === 'topic' && activeItem?.id === topic.id;

            return (
              <div key={topic.id}>
                <div
                  className={`kb-topic-item ${isTopicActive ? 'active' : ''}`}
                  onClick={() => handleSelectTopic(topic)}
                >
                  <span onClick={(e) => { e.stopPropagation(); toggleFolder(topic.id); }}>
                    {isFolderExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <Folder size={18} color={isTopicActive ? "#FF7E00" : "currentColor"} />
                  {editingTitle?.id === topic.id ? (
                    <input
                      className="kb-title-input"
                      value={editingTitle.value}
                      onChange={e => setEditingTitle(prev => ({ ...prev, value: e.target.value }))}
                      onBlur={handleRenameSave}
                      onKeyDown={handleRenameKeyDown}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span style={{ flex: 1 }}>{topic.title}</span>
                  )}
                  <ItemMenu
                    id={topic.id}
                    actions={[
                      { label: 'Переименовать', fn: () => handleRenameStart(topic) },
                      { label: 'Добавить подтему', fn: () => handleAddSubtopic(topic.id) },
                      { label: 'Удалить', fn: () => handleDelete(topic.id, 'topic'), danger: true },
                    ]}
                  />
                </div>

                {isFolderExpanded && topic.subtopics.length > 0 && (
                  <div className="kb-subtopics">
                    {topic.subtopics.map(sub => {
                      const isSubActive = activeItem?.type === 'subtopic' && activeItem?.id === sub.id;
                      return (
                        <div
                          key={sub.id}
                          className={`kb-subtopic-item ${isSubActive ? 'active' : ''}`}
                          onClick={() => handleSelectSubtopic(sub, topic)}
                        >
                          <FileText size={14} />
                          {editingTitle?.id === sub.id ? (
                            <input
                              className="kb-title-input"
                              value={editingTitle.value}
                              onChange={e => setEditingTitle(prev => ({ ...prev, value: e.target.value }))}
                              onBlur={handleRenameSave}
                              onKeyDown={handleRenameKeyDown}
                              onClick={e => e.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <span style={{ flex: 1 }}>{sub.title}</span>
                          )}
                          <ItemMenu
                            id={sub.id}
                            actions={[
                              { label: 'Переименовать', fn: () => handleRenameStart(sub) },
                              { label: 'Удалить', fn: () => handleDelete(sub.id, 'subtopic', topic.id), danger: true },
                            ]}
                          />
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

      {/* ПРАВАЯ КОЛОНКА */}
      <div className="kb-content">
        {activeItem ? (
          <>
            <div className="kb-content-header">
              <div>
                <div className="kb-breadcrumbs">
                  База знаний {activeItem.type === 'subtopic' && <> <ChevronRight size={12} /> {activeItem.parentTitle} </>}
                </div>
                <h2>{activeItem.data.title}</h2>
              </div>
              {!isEditing ? (
                <button className="kb-edit-btn" onClick={handleEditClick}>
                  <Edit3 size={18} /> Редактировать
                </button>
              ) : (
                <button className="kb-edit-btn kb-save-btn" onClick={handleSaveClick}>
                  <Save size={18} /> Сохранить
                </button>
              )}
            </div>

            {!isEditing ? (
              <div
                className="kb-article html-content"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeItem.data.content) }}
                onClick={(e) => { if (e.target.tagName === 'IMG') setLightboxSrc(e.target.src); }}
              />
            ) : (
              <WysiwygEditor
                key={activeItem.id}
                initialContent={activeItem.data.content}
                onContentChange={setEditContent}
              />
            )}
          </>
        ) : (
          <div className="kb-empty">
            <p>Выберите тему или создайте новую</p>
          </div>
        )}
      </div>

      {lightboxSrc && (
        <div className="kb-lightbox" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" className="kb-lightbox-img" />
        </div>
      )}

      {modal && (
        <PromptModal
          title={modal.title}
          placeholder={modal.placeholder}
          isConfirm={!modal.placeholder}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
