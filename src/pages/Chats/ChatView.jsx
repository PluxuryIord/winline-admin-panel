import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send, X, Plus } from 'lucide-react';
import './ChatView.css';

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
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

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const tagDropdownRef = useRef(null);

  // Загрузка чата
  useEffect(() => {
    fetch('/api/chats')
      .then(r => r.json())
      .then(chats => {
        const found = chats.find(c => c.id === Number(id));
        setChat(found || null);
        // Загрузить пользователя
        if (found?.userId) {
          fetch(`/api/users/${found.userId}`)
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

  // Сохранение тегов на сервер
  const saveTags = async (newTags) => {
    setTags(newTags);
    if (!user) return;
    try {
      await fetch(`/api/users/${user.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      });
    } catch (err) {
      console.error('Failed to save tags:', err);
    }
  };

  const handleRemoveTag = (tag) => {
    saveTags(tags.filter(t => t !== tag));
  };

  const handleAddExistingTag = (tag) => {
    if (!tags.includes(tag)) saveTags([...tags, tag]);
    setShowTagDropdown(false);
  };

  const handleCreateTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !tags.includes(trimmed)) saveTags([...tags, trimmed]);
    setNewTagInput('');
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chats/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const newMsg = await res.json();
      setChat(prev => ({ ...prev, messages: [...prev.messages, newMsg] }));
      setInput('');
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
      <div className="chatview-header">
        <button className="chatview-back-btn" onClick={() => navigate('/chats')}>
          <ArrowLeft size={18} /> Назад
        </button>
        {user && (
          <Link to={`/users/${user.id}`} className="chatview-profile-link">
            <div className="chatview-profile-link-avatar">{user.fullName.charAt(0)}</div>
            <span className="chatview-profile-link-name">{user.fullName}</span>
          </Link>
        )}
      </div>

      <div className="chatview-body">
        <div className="chatview-main">
          <div className="chatview-messages">
            {items.map((item, i) =>
              item.type === 'date' ? (
                <div key={`date-${i}`} className="chatview-date-divider">
                  <span>{item.label}</span>
                </div>
              ) : (
                <div key={item.id} className={`chatview-msg chatview-msg--${item.from}`}>
                  <div className="chatview-msg-bubble">
                    {item.text}
                    <span className="chatview-msg-time">{formatTime(item.time)}</span>
                  </div>
                </div>
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chatview-input-row">
            <textarea
              ref={inputRef}
              rows={1}
              className="chatview-input"
              placeholder="Написать сообщение..."
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
            />
            <button className="chatview-send-btn" onClick={handleSend} disabled={!input.trim() || sending}>
              <Send size={18} />
            </button>
          </div>
        </div>

        <div className="chatview-sidebar">
          {user ? (
            <>
              <Link to={`/users/${user.id}`} className="chatview-user-hero">
                <div className="chatview-hero-avatar">{user.fullName.charAt(0)}</div>
                <div className="chatview-hero-name">{user.fullName}</div>
                <span className="chatview-hero-badge badge-guest">
                  {user.role !== '—' ? user.role : 'Пользователь'}
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
                    <span className="chatview-info-label">Роль</span>
                    <span className="chatview-info-value">{user.role}</span>
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
