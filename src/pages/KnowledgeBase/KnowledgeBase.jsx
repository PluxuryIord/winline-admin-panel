import { useState, useEffect, useRef } from 'react';
import {
  FileText, Edit3, Save, Loader, BookOpen, Image as ImageIcon, X, Upload, Trash2
} from 'lucide-react';
import { api, getToken } from '../../utils/api.js';
import './KnowledgeBase.css';

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

  /** Telegram HTML → безопасный HTML для отображения. \n → <br> */
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
              {(article.photoFileId || article.photoS3Url) && <ImageIcon size={14} style={{ opacity: 0.4 }} />}
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
