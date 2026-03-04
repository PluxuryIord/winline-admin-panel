import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { usersData } from '../../data/usersData';
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
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch('/api/chats')
      .then(r => r.json())
      .then(chats => {
        const found = chats.find(c => c.id === Number(id));
        setChat(found || null);
      })
      .catch(() => {});
  }, [id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages]);

  const user = chat ? usersData.find(u => u.id === chat.userId) : null;

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
      inputRef.current?.focus();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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

  return (
    <div className="chatview-container">
      <button className="chatview-back-btn" onClick={() => navigate('/chats')}>
        <ArrowLeft size={18} /> Назад
      </button>

      <div className="chatview-body">
        {/* Левая часть — чат */}
        <div className="chatview-main">
          <div className="chatview-messages">
            {items.map((item, i) =>
              item.type === 'date' ? (
                <div key={`date-${i}`} className="chatview-date-divider">
                  <span>{item.label}</span>
                </div>
              ) : (
                <div
                  key={item.id}
                  className={`chatview-msg chatview-msg--${item.from}`}
                >
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
              className="chatview-input"
              placeholder="Написать сообщение..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className="chatview-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || sending}
            >
              <Send size={18} />
            </button>
          </div>
        </div>

        {/* Правый сайдбар — инфо о пользователе */}
        <div className="chatview-sidebar">
          {user ? (
            <>
              <Link to={`/users/${user.id}`} className="chatview-user-link">
                <div className="chatview-sidebar-avatar">
                  {user.fullName.charAt(0)}
                </div>
                <div className="chatview-sidebar-name">
                  {user.fullName}
                  <span className="chatview-sidebar-status">
                    {user.isPartner ? 'Партнёр' : 'Гость'}
                  </span>
                </div>
              </Link>

              <div className="chatview-sidebar-section">
                <h4 className="chatview-sidebar-title">Информация</h4>
                <div className="chatview-info-grid">
                  <div className="chatview-info-row">
                    <span className="chatview-info-label">Telegram</span>
                    <span className="chatview-info-value">{user.telegram}</span>
                  </div>
                  <div className="chatview-info-row">
                    <span className="chatview-info-label">Страна</span>
                    <span className="chatview-info-value">{user.country}</span>
                  </div>
                  <div className="chatview-info-row">
                    <span className="chatview-info-label">Тип лица</span>
                    <span className="chatview-info-value">{user.entityType}</span>
                  </div>
                  <div className="chatview-info-row">
                    <span className="chatview-info-label">Комиссия</span>
                    <span className="chatview-info-value">
                      {user.commission.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                  {user.tags.length > 0 && (
                    <div className="chatview-info-row">
                      <span className="chatview-info-label">Теги</span>
                      <span className="chatview-info-value chatview-tags">
                        {user.tags.map(t => (
                          <span key={t} className="chatview-tag">{t}</span>
                        ))}
                      </span>
                    </div>
                  )}
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
