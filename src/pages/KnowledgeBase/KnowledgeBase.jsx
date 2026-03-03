import { useState } from 'react';
import DOMPurify from 'dompurify'; // Импортируем наш щит от XSS
import { 
  Folder, FileText, Plus, Edit3, Save, 
  ChevronRight, ChevronDown, 
  Image as ImageIcon, Video, Link as LinkIcon, Bold, Italic, AlignLeft
} from 'lucide-react';
import './KnowledgeBase.css';
import { knowledgeData as mockData } from '../../data/knowledgeData';



export default function KnowledgeBase() {
  const [expandedFolders, setExpandedFolders] = useState([1]);
  const [activeItem, setActiveItem] = useState({ type: 'topic', id: 1, data: mockData[0] });
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const toggleFolder = (id) => {
    if (expandedFolders.includes(id)) {
      setExpandedFolders(expandedFolders.filter(folderId => folderId !== id));
    } else {
      setExpandedFolders([...expandedFolders, id]);
    }
  };

  const handleSelectTopic = (topic) => {
    setActiveItem({ type: 'topic', id: topic.id, data: topic });
    setIsEditing(false);
    if (!expandedFolders.includes(topic.id)) {
      setExpandedFolders([...expandedFolders, topic.id]);
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

  const handleSaveClick = () => {
    // В реальном приложении отправляем editContent на сервер.
    // Пока просто обновляем локальный стейт для презентации:
    setActiveItem({
      ...activeItem,
      data: { ...activeItem.data, content: editContent }
    });
    setIsEditing(false);
  };

  return (
    <div className="kb-container">
      
      {/* ЛЕВАЯ КОЛОНКА */}
      <div className="kb-sidebar">
        <div className="kb-sidebar-header">
          <h3>Разделы Wiki</h3>
          <button className="add-topic-btn" title="Создать новую тему">
            <Plus size={18} />
          </button>
        </div>

        <div className="kb-topic-list">
          {mockData.map((topic) => {
            const isFolderExpanded = expandedFolders.includes(topic.id);
            const isTopicActive = activeItem.type === 'topic' && activeItem.id === topic.id;

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
                </div>

                {isFolderExpanded && topic.subtopics.length > 0 && (
                  <div className="kb-subtopics">
                    {topic.subtopics.map(sub => {
                      const isSubActive = activeItem.type === 'subtopic' && activeItem.id === sub.id;
                      return (
                        <div 
                          key={sub.id}
                          className={`kb-subtopic-item ${isSubActive ? 'active' : ''}`}
                          onClick={() => handleSelectSubtopic(sub, topic)}
                        >
                          <FileText size={14} />
                          {sub.title}
                        </div>
                      )
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
            <button className="kb-edit-btn" style={{ backgroundColor: '#00ff88', color: '#000' }} onClick={handleSaveClick}>
              <Save size={18} /> Сохранить
            </button>
          )}
        </div>

        {!isEditing ? (
          <div 
            className="kb-article html-content" 
            // МАКСИМАЛЬНАЯ БЕЗОПАСНОСТЬ: Очищаем HTML перед рендером
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeItem.data.content) }} 
          />
        ) : (
          <div className="kb-editor">
            <div className="editor-toolbar">
              <button className="toolbar-btn" title="Жирный"><Bold size={16} /></button>
              <button className="toolbar-btn" title="Курсив"><Italic size={16} /></button>
              <button className="toolbar-btn" title="Выравнивание"><AlignLeft size={16} /></button>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 8px', alignSelf: 'center' }}></div>
              <button className="toolbar-btn" title="Добавить ссылку"><LinkIcon size={16} /></button>
              <button className="toolbar-btn" title="Добавить картинку"><ImageIcon size={16} /></button>
              <button className="toolbar-btn" title="Добавить видео"><Video size={16} /></button>
            </div>
            <textarea 
              className="editor-textarea"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Введите HTML контент..."
            />
          </div>
        )}
      </div>

    </div>
  );
}