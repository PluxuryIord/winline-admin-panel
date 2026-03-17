import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, List, LayoutGrid } from 'lucide-react';
import { api } from '../../utils/api.js';
import PromptModal from '../KnowledgeBase/PromptModal';
import './Chats.css';

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export default function Chats() {
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [users, setUsers] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [deleteModal, setDeleteModal] = useState(null);

  useEffect(() => {
    api.get('/api/chats').then(r => r.json()).then(setChats).catch(() => {});
    api.get('/api/users?limit=200').then(r => r.json()).then(data => setUsers(data.users || data)).catch(() => {});
  }, []);

  // SSE — реалтайм обновление списка чатов
  useEffect(() => {
    const token = localStorage.getItem('token');
    const url = `/api/chats/stream${token ? `?token=${token}` : ''}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'new_message') {
          setChats(prev => {
            const idx = prev.findIndex(c => c.id === data.chatId);
            if (idx >= 0) {
              // Обновляем существующий чат — добавляем сообщение
              const updated = [...prev];
              const chat = { ...updated[idx] };
              if (!chat.messages.some(m => m.id === data.message.id)) {
                chat.messages = [...chat.messages, data.message];
              }
              updated.splice(idx, 1);
              return [chat, ...updated]; // Наверх
            } else {
              // Новый чат
              return [{
                id: data.chatId,
                userId: data.userId,
                messages: [data.message],
              }, ...prev];
            }
          });
        }
      } catch {}
    };

    return () => es.close();
  }, []);

  const getUser = (userId) => users.find(u => u.id === userId);

  const handleDelete = (e, chatId, userName) => {
    e.stopPropagation();
    setDeleteModal({ chatId, userName });
  };

  const confirmDelete = async () => {
    const { chatId } = deleteModal;
    setDeleteModal(null);
    await api.delete(`/api/chats/${chatId}`);
    setChats(prev => prev.filter(c => c.id !== chatId));
  };

  const lastMsg = (chat) => chat.messages.at(-1);

  return (
    <div className="chats-container">
      <div className="chats-header">
        <div className="chats-view-toggle">
          <button
            className={`chats-view-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <List size={16} /> Список
          </button>
          <button
            className={`chats-view-btn${viewMode === 'columns' ? ' active' : ''}`}
            onClick={() => setViewMode('columns')}
          >
            <LayoutGrid size={16} /> Колонки
          </button>
        </div>
      </div>

      <div className={`chats-list${viewMode === 'columns' ? ' chats-list--columns' : ''}`}>
        {chats.length === 0 && (
          <p className="chats-empty">Чатов пока нет</p>
        )}
        {chats.map(chat => {
          const user = getUser(chat.userId);
          const msg = lastMsg(chat);
          return (
            <div
              key={chat.id}
              className="chat-item"
              onClick={() => navigate(`/chats/${chat.id}`)}
            >
              <div className="chat-item-avatar">
                {user ? user.fullName.charAt(0) : '?'}
              </div>
              <div className="chat-item-info">
                <span className="chat-item-name">
                  {user ? user.fullName : `Пользователь #${chat.userId}`}
                </span>
                {msg && (
                  <span className="chat-item-last">
                    {msg.from === 'admin' ? 'Вы: ' : ''}{msg.text}
                  </span>
                )}
              </div>
              {msg && (
                <span className="chat-item-time">{formatTime(msg.time)}</span>
              )}
              <button
                className="chat-item-delete"
                onClick={(e) => handleDelete(e, chat.id, user ? user.fullName : `#${chat.userId}`)}
                title="Удалить чат"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {deleteModal && (
        <PromptModal
          title={`Удалить чат с ${deleteModal.userName}?`}
          isConfirm
          onConfirm={confirmDelete}
          onCancel={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}
