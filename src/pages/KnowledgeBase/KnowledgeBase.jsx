import { useState, useEffect } from 'react';
import {
  FileText, Edit3, Save, Loader, BookOpen, Image as ImageIcon, X
} from 'lucide-react';
import { api } from '../../utils/api.js';
import './KnowledgeBase.css';

export default function KnowledgeBase() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => {
    api.get('/api/knowledge')
      .then(res => res.json())
      .then(data => {
        const list = data.articles || [];
        setArticles(list);
        if (list.length > 0) setActiveKey(list[0].key);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
      await api.put(`/api/knowledge/${active.key}`, { content: editContent });
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

  /** Telegram HTML → безопасный HTML для отображения. \n → <br> */
  function tgHtmlToDisplay(text) {
    if (!text) return '';
    // Заменяем \n на <br>, убираем опасные теги
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Восстанавливаем разрешённые теги
      .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
      .replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>')
      .replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>')
      .replace(/&lt;s&gt;/g, '<s>').replace(/&lt;\/s&gt;/g, '</s>')
      .replace(/&lt;code&gt;/g, '<code>').replace(/&lt;\/code&gt;/g, '</code>')
      .replace(/&lt;pre&gt;/g, '<pre>').replace(/&lt;\/pre&gt;/g, '</pre>')
      .replace(/&lt;a href=&quot;([^&]*)&quot;&gt;/g, '<a href="$1" target="_blank" rel="noopener">')
      .replace(/&lt;a href="([^"]*)"&gt;/g, '<a href="$1" target="_blank" rel="noopener">')
      .replace(/&lt;\/a&gt;/g, '</a>')
      .replace(/\n/g, '<br>');
  }

  if (loading) {
    return (
      <div className="kb-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--color-orange)' }} />
      </div>
    );
  }

  return (
    <div className="kb-container">

      {/* ЛЕВАЯ КОЛОНКА — список статей */}
      <div className="kb-sidebar">
        <div className="kb-sidebar-header">
          <h3><BookOpen size={18} /> База знаний</h3>
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
              {article.photoFileId && <ImageIcon size={14} style={{ opacity: 0.4 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* ПРАВАЯ КОЛОНКА — содержимое */}
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

            {/* Фото статьи */}
            {active.photoFileId && !isEditing && (
              <div className="kb-article-photo">
                <img
                  src={`/api/knowledge/photo/${active.photoFileId}`}
                  alt=""
                  onClick={(e) => setLightboxSrc(e.target.src)}
                  style={{ cursor: 'pointer', maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', marginBottom: '16px' }}
                />
              </div>
            )}

            {!isEditing ? (
              <div
                className="kb-article html-content"
                dangerouslySetInnerHTML={{ __html: tgHtmlToDisplay(active.content) }}
              />
            ) : (
              <div className="kb-editor-area">
                <div className="kb-editor-hint">
                  Telegram HTML: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;, &lt;u&gt;подчёркнутый&lt;/u&gt;, &lt;a href="url"&gt;ссылка&lt;/a&gt;. Перенос строки: \n
                </div>
                <textarea
                  className="kb-textarea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={25}
                  spellCheck={false}
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
    </div>
  );
}
