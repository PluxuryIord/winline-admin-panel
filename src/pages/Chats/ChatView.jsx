import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send, X, Plus, Paperclip, FileText, Check, CheckCheck } from 'lucide-react';
import { api } from '../../utils/api.js';
import './ChatView.css';

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function groupByDate(messages) {
  const groups = [];
  let currentDate = null;
  messages.forEach(msg => {
    const date = new Date(msg.time).toDateString();
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ type: 'date', label: formatDate(msg.time) });
    }
    groups.push({ type: 'message', ...msg });
  });
  return groups;
}

export default function ChatView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chat, setChat] = useState(null);
  const [user, setUser] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const [tags, setTags] = useState([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [media, setMedia] = useState(null);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const tagDropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Загрузка чата
  useEffect(() => {
    api.get('/api/chats')
      .then(r => r.json())
      .then(chats => {
        const found = chats.find(c => c.id === Number(id));
        setChat(found || null);
        if (found?.userId) {
          api.get(`/api/users/${found.userId}`)
            .then(r => r.ok ? r.json() : null)
            .then(u => {
              setUser(u);
              if (u) setTags(u.tags || []);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    const handler = (e) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages]);

  // SSE
  useEffect(() => {
    const token = localStorage.getItem('wl_admin_token');
    const url = `/api/chats/stream${token ? `?token=${token}` : ''}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'new_message' && data.chatId === Number(id)) {
          setChat(prev => {
            if (!prev) return prev;
            if (prev.messages.some(m => m.id === data.message.id)) return prev;
            return { ...prev, messages: [...prev.messages, data.message] };
          });
        }
      } catch {}
    };

    return () => es.close();
  }, [id]);

  const saveTags = async (newTags) => {
    setTags(newTags);
    if (!user) return;
    try {
      await api.put(`/api/users/${user.id}/tags`, { tags: newTags });
    } catch (err) {
      console.error('Failed to save tags:', err);
    }
  };

  const handleRemoveTag = (tag) => saveTags(tags.filter(t => t !== tag));

  const handleAddExistingTag = (tag) => {
    if (!tags.includes(tag)) saveTags([...tags, tag]);
    setShowTagDropdown(false);
  };

  const handleCreateTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !tags.includes(trimmed)) saveTags([...tags, trimmed]);
    setNewTagInput('');
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('wl_admin_token');
      const res = await fetch('/api/broadcasts/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed ' + res.status);
      const data = await res.json();
      setMedia({
        filename: data.filename,
        url: data.url,
        originalName: data.originalName,
        mimeType: data.mimeType,
        size: data.size,
        previewUrl: data.mimeType.startsWith('image/') ? data.url : null,
      });
    } catch (err) {
      alert('Ошибка загрузки: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !media) return;
    if (sending) return;
    setSending(true);
    try {
      const body = {};
      if (text) body.text = text;
      if (media) body.media = { filename: media.filename, url: media.url, originalName: media.originalName, mimeType: media.mimeType };
      const res = await api.post(`/api/chats/${id}/messages`, body);
      const newMsg = await res.json();
      // Добавляем только если SSE ещё не добавил
      setChat(prev => {
        if (!prev) return prev;
        if (prev.messages.some(m => m.id === newMsg.id)) return prev;
        return { ...prev, messages: [...prev.messages, newMsg] };
      });
      setInput('');
      setMedia(null);
      if (inputRef.current) inputRef.current.style.height = 'auto';
      inputRef.current?.focus();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextareaChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  };

  if (!chat) {
    return (
      <div className="chatview-not-found">
        <p>Чат не найден</p>
        <button onClick={() => navigate('/chats')}>Назад к чатам</button>
      </div>
    );
  }

  const items = groupByDate(chat.messages);
  const knownTags = ['Старый пользователь', 'VIP', 'Арбитраж', 'SEO', 'Новичок', 'Агентство'];
  const availableTags = knownTags.filter(t => !tags.includes(t));

  return (
    <div className="chatview-container">
      {/* Шапка */}
      <div className="chatview-header">
        <button className="chatview-back-btn" onClick={() => navigate('/chats')}>
          <ArrowLeft size={18} />
        </button>
        {user && (
          <Link to={`/users/${user.id}`} className="chatview-header-user">
            <div className="chatview-header-avatar">{user.fullName.charAt(0)}</div>
            <div className="chatview-header-info">
              <span className="chatview-header-name">{user.fullName}</span>
              <span className="chatview-header-status">
                {user.telegram ? `@${user.telegram.replace('@', '')}` : 'Telegram'}
              </span>
            </div>
          </Link>
        )}
      </div>

      <div className="chatview-body">
        <div className="chatview-main">
          {/* Сообщения */}
          <div className="chatview-messages">
            {items.map((item, i) =>
              item.type === 'date' ? (
                <div key={`date-${i}`} className="chatview-date-pill">
                  <span>{item.label}</span>
                </div>
              ) : (
                <div key={item.id} className={`chatview-msg chatview-msg--${item.from}`}>
                  <div className={`chatview-bubble ${item.media ? 'chatview-bubble--media' : ''}`}>
                    {item.media && (() => {
                      const mediaUrl = item.media.url || `/uploads/${item.media.filename}`;
                      return item.media.mimeType?.startsWith('image/') ? (
                        <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="chatview-img-link">
                          <img src={mediaUrl} alt="" className="chatview-img" />
                        </a>
                      ) : (
                        <a href={mediaUrl} download={item.media.originalName} className="chatview-file">
                          <div className="chatview-file-icon"><FileText size={22} /></div>
                          <div className="chatview-file-info">
                            <span className="chatview-file-name">{item.media.originalName}</span>
                            <span className="chatview-file-size">Файл</span>
                          </div>
                        </a>
                      );
                    })()}
                    {item.text && <span className="chatview-text">{item.text}</span>}
                    <span className="chatview-meta">
                      <span className="chatview-time">{formatTime(item.time)}</span>
                      {item.from === 'admin' && <CheckCheck size={14} className="chatview-read-icon" />}
                    </span>
                  </div>
                </div>
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Превью прикрепления */}
          {media && (
            <div className="chatview-attach-bar">
              {media.previewUrl ? (
                <img src={media.previewUrl} alt="" className="chatview-attach-thumb" />
              ) : (
                <div className="chatview-attach-file-icon"><FileText size={20} /></div>
              )}
              <span className="chatview-attach-name">{media.originalName}</span>
              <button className="chatview-attach-remove" onClick={() => setMedia(null)}><X size={14} /></button>
            </div>
          )}

          {/* Поле ввода */}
          <div className="chatview-composer">
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            <button className="chatview-composer-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Paperclip size={20} />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              className="chatview-composer-input"
              placeholder={media ? 'Подпись (необязательно)...' : 'Сообщение...'}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
            />
            <button
              className="chatview-composer-send"
              onClick={handleSend}
              disabled={(!input.trim() && !media) || sending}
            >
              <Send size={20} />
            </button>
          </div>
        </div>

        {/* Сайдбар */}
        <div className="chatview-sidebar">
          {user ? (
            <>
              <Link to={`/users/${user.id}`} className="chatview-user-hero">
                <div className="chatview-hero-avatar">{user.fullName.charAt(0)}</div>
                <div className="chatview-hero-name">{user.fullName}</div>
                <span className="chatview-hero-badge badge-guest">
                  {(tags[0]) || 'Пользователь'}
                </span>
              </Link>

              <div className="chatview-sidebar-section">
                <h4 className="chatview-sidebar-title">Теги</h4>
                <div className="chatview-tags-row">
                  {tags.map(tag => (
                    <span key={tag} className="chatview-tag-editable">
                      {tag}
                      <button className="chatview-tag-x" onClick={() => handleRemoveTag(tag)}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  <div className="chatview-tag-add-wrapper" ref={tagDropdownRef}>
                    <button className="chatview-tag-add-btn" onClick={() => setShowTagDropdown(!showTagDropdown)}>
                      <Plus size={13} />
                    </button>
                    {showTagDropdown && (
                      <div className="chatview-tag-dropdown">
                        {availableTags.map(tag => (
                          <div key={tag} className="chatview-tag-dropdown-item" onClick={() => handleAddExistingTag(tag)}>
                            {tag}
                          </div>
                        ))}
                        <div className="chatview-tag-dropdown-input-row">
                          <input
                            className="chatview-tag-dropdown-input"
                            placeholder="Новый тег..."
                            value={newTagInput}
                            onChange={e => setNewTagInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
                            autoFocus
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="chatview-sidebar-section">
                <h4 className="chatview-sidebar-title">Информация</h4>
                <div className="chatview-info-grid">
                  <div className="chatview-info-row">
                    <span className="chatview-info-label">Telegram</span>
                    <span className="chatview-info-value">{user.telegram}</span>
                  </div>
                  <div className="chatview-info-row">
                    <span className="chatview-info-label">Телефон</span>
                    <span className="chatview-info-value">{user.phone}</span>
                  </div>
                  <div className="chatview-info-row">
                    <span className="chatview-info-label">Регистрация</span>
                    <span className="chatview-info-value">{user.registrationDate}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="chatview-sidebar-unknown">Пользователь не найден</p>
          )}
        </div>
      </div>
    </div>
  );
}
