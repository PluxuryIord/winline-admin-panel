import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, List, LayoutGrid } from 'lucide-react';
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
    fetch('/api/chats').then(r => r.json()).then(setChats).catch(() => {});
    fetch('/api/users?limit=200').then(r => r.json()).then(data => setUsers(data.users || data)).catch(() => {});
  }, []);

  const getUser = (userId) => users.find(u => u.id === userId);

  const handleDelete = (e, chatId, userName) => {
    e.stopPropagation();
    setDeleteModal({ chatId, userName });
  };

  const confirmDelete = async () => {
    const { chatId } = deleteModal;
    setDeleteModal(null);
    await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
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
