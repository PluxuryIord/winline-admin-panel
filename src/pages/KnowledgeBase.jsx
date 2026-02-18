import { useState } from 'react';
import { 
  Folder, FileText, Plus, Edit3, Save, 
  ChevronRight, ChevronDown, 
  Image as ImageIcon, Video, Link as LinkIcon, Bold, Italic, AlignLeft
} from 'lucide-react';
import './KnowledgeBase.css';

// Фейковые данные для презентации (потом заменим на API)
const mockData = [
  {
    id: 1,
    title: 'Правила работы',
    content: 'Здесь описаны правила',
    subtopics: [
      { id: 11, title: 'Регистрация пользователей', content: 'Процесс регистрации состоит из 3 этапов: логин, пароль, ещё пароль)' },
      { id: 12, title: 'Система штрафов', content: 'Штрафы начисляются за следующие нарушения:\n\n1. Читы\n2. Кемперствоооо\n3. Оскорбление администрации' }
    ]
  },
  {
    id: 2,
    title: 'Скрипты общения',
    content: 'Скрипты и шаблоны ответов для технической поддержки.',
    subtopics: [
      { id: 21, title: 'Приветствие', content: 'Здравствуйте! Меня зовут Ибрагим, я специалист технической поддержки. Чем могу вам помочь?' },
      { id: 22, title: 'Решение проблем с оплатой', content: 'Пожалуйста, пришлите фото карты с 2 сторон, с которой производилась оплата.' }
    ]
  },
];

export default function KnowledgeBase() {
  // Состояния для управления логикой интерфейса
  const [expandedFolders, setExpandedFolders] = useState([1]); // Какие папки раскрыты
  const [activeItem, setActiveItem] = useState({ type: 'topic', id: 1, data: mockData[0] }); // Что сейчас открыто справа
  const [isEditing, setIsEditing] = useState(false); // Режим редактирования
  const [editContent, setEditContent] = useState(''); // Текст в редакторе

  // Функция открытия/закрытия папок
  const toggleFolder = (id) => {
    if (expandedFolders.includes(id)) {
      setExpandedFolders(expandedFolders.filter(folderId => folderId !== id));
    } else {
      setExpandedFolders([...expandedFolders, id]);
    }
  };

  // Выбор темы (родительской папки)
  const handleSelectTopic = (topic) => {
    setActiveItem({ type: 'topic', id: topic.id, data: topic });
    setIsEditing(false);
    if (!expandedFolders.includes(topic.id)) {
      setExpandedFolders([...expandedFolders, topic.id]);
    }
  };

  // Выбор подтемы
  const handleSelectSubtopic = (subtopic, parentTopic) => {
    setActiveItem({ 
      type: 'subtopic', 
      id: subtopic.id, 
      data: subtopic,
      parentTitle: parentTopic.title 
    });
    setIsEditing(false);
  };

  // Переход в режим редактирования
  const handleEditClick = () => {
    setEditContent(activeItem.data.content);
    setIsEditing(true);
  };

  // Имитация сохранения
  const handleSaveClick = () => {
    // В реальном приложении здесь был бы POST/PUT запрос на бэкенд
    setIsEditing(false);
    alert('Изменения успешно сохранены! (Имитация)');
  };

  return (
    <div className="kb-container">
      
      {/* ЛЕВАЯ КОЛОНКА: Навигация */}
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
                {/* Сама тема */}
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

                {/* Подтемы (рендерим только если папка открыта) */}
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

      {/* ПРАВАЯ КОЛОНКА: Просмотр и редактирование */}
      <div className="kb-content">
        <div className="kb-content-header">
          <div>
            <div className="kb-breadcrumbs">
              База знаний 
              {activeItem.type === 'subtopic' && (
                <> <ChevronRight size={12} /> {activeItem.parentTitle} </>
              )}
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

        {/* Тело контента */}
        {!isEditing ? (
          <div className="kb-article">
            {/* В будущем здесь можно рендерить HTML или Markdown */}
            {activeItem.data.content.split('\n').map((paragraph, index) => (
              <p key={index} style={{ marginBottom: '16px' }}>{paragraph}</p>
            ))}
          </div>
        ) : (
          <div className="kb-editor">
            {/* Фейковая панель инструментов для презентации возможностей */}
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
              placeholder="Начните писать контент здесь..."
            />
          </div>
        )}
      </div>

    </div>
  );
}