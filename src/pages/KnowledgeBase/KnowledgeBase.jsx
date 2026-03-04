import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  Folder, FileText, Plus, Edit3, Save, Trash2,
  ChevronRight, ChevronDown, Loader
} from 'lucide-react';
import WysiwygEditor from './WysiwygEditor';
import './KnowledgeBase.css';

export default function KnowledgeBase() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

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

  const handleAddTopic = async () => {
    const title = prompt('Название новой темы:');
    if (!title?.trim()) return;

    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), content: '' })
    });
    const newTopic = await res.json();
    const topicWithSubs = { ...newTopic, subtopics: [] };
    setTopics(prev => [...prev, topicWithSubs]);
    setActiveItem({ type: 'topic', id: newTopic.id, data: topicWithSubs });
  };

  const handleAddSubtopic = async (e, parentId) => {
    e.stopPropagation();
    const title = prompt('Название подтемы:');
    if (!title?.trim()) return;

    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), content: '', parent_id: parentId })
    });
    const newSub = await res.json();
    setTopics(prev => prev.map(t =>
      t.id === parentId ? { ...t, subtopics: [...t.subtopics, newSub] } : t
    ));
    if (!expandedFolders.includes(parentId)) {
      setExpandedFolders(prev => [...prev, parentId]);
    }
  };

  const handleDelete = async (e, id, type, parentId) => {
    e.stopPropagation();
    const label = type === 'topic' ? 'тему и все подтемы' : 'подтему';
    if (!confirm(`Удалить ${label}?`)) return;

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
  };

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
                  <span style={{ flex: 1 }}>{topic.title}</span>
                  <button className="add-sub-btn" title="Добавить подтему" onClick={(e) => handleAddSubtopic(e, topic.id)}>
                    <Plus size={14} />
                  </button>
                  <button className="delete-btn" title="Удалить тему" onClick={(e) => handleDelete(e, topic.id, 'topic')}>
                    <Trash2 size={14} />
                  </button>
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
                          <span style={{ flex: 1 }}>{sub.title}</span>
                          <button className="delete-btn" title="Удалить подтему" onClick={(e) => handleDelete(e, sub.id, 'subtopic', topic.id)}>
                            <Trash2 size={14} />
                          </button>
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

    </div>
  );
}
