import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, List, LayoutGrid, Plus, Pencil, Folder } from 'lucide-react';
import { api } from '../../utils/api.js';
import { useUnread } from '../../contexts/UnreadContext.jsx';
import PromptModal from '../KnowledgeBase/PromptModal';
import FolderEditor from './FolderEditor.jsx';
import './Chats.css';

function chatMatchesFolder(chat, user, filters, unreadSet) {
  if (!filters) return true;
  const f = filters;
  if (f.unreadOnly && !unreadSet.has(chat.id)) return false;
  if (f.activeOnly) {
    const hasUserMsg = chat.messages?.some(m => m.from === 'user');
    if (!hasUserMsg) return false;
  }
  if (f.bannedOnly && !chat.banned && !user?.banned) return false;
  if (Array.isArray(f.tags) && f.tags.length) {
    const userTags = user?.tags || [];
    const mode = f.tagMode === 'all' ? 'all' : 'any';
    if (mode === 'all') {
      if (!f.tags.every(t => userTags.includes(t))) return false;
    } else {
      if (!f.tags.some(t => userTags.includes(t))) return false;
    }
  }
  return true;
}

/** Strip HTML tags for preview, keep text only */
function stripTgHtml(html) {
  if (!html) return '';
  return html
    .replace(/<tg-emoji[^>]*>[^<]*<\/tg-emoji>/g, '⭐')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n/g, ' ')
    .trim();
}

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
  const { unreadChats } = useUnread();
  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null); // null = All
  const [folderEditor, setFolderEditor] = useState(null); // {id?, name, filters}
  const [allTags, setAllTags] = useState([]);

  useEffect(() => {
    api.get('/api/chats').then(r => r.json()).then(setChats).catch(() => {});
    api.get('/api/users?limit=200').then(r => r.json()).then(data => setUsers(data.users || data)).catch(() => {});
    api.get('/api/chat-folders').then(r => r.json()).then(setFolders).catch(() => {});
    api.get('/api/users/all-tags').then(r => r.json()).then(setAllTags).catch(() => {});
  }, []);

  const reloadFolders = () => api.get('/api/chat-folders').then(r => r.json()).then(setFolders).catch(() => {});

  const saveFolder = async (data) => {
    if (data.id) {
      await api.put(`/api/chat-folders/${data.id}`, { name: data.name, filters: data.filters });
    } else {
      await api.post('/api/chat-folders', { name: data.name, filters: data.filters });
    }
    setFolderEditor(null);
    reloadFolders();
  };
  const deleteFolder = async (id) => {
    await api.delete(`/api/chat-folders/${id}`);
    if (activeFolderId === id) setActiveFolderId(null);
    reloadFolders();
  };

  // SSE — реалтайм обновление списка чатов
  useEffect(() => {
    // Cookie-based auth — EventSource sends wl_token cookie automatically on same-origin
    const es = new EventSource('/api/chats/stream', { withCredentials: true });

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

  // Apply active folder filter
  const activeFolder = folders.find(f => f.id === activeFolderId) || null;
  const visibleChats = activeFolder
    ? chats.filter(c => chatMatchesFolder(c, getUser(c.userId), activeFolder.filters, unreadChats))
    : chats;

  // Sort by last message time (newest first)
  const sortedChats = [...visibleChats].sort((a, b) => {
    const timeA = lastMsg(a)?.time ? new Date(lastMsg(a).time).getTime() : 0;
    const timeB = lastMsg(b)?.time ? new Date(lastMsg(b).time).getTime() : 0;
    return timeB - timeA;
  });

  return (
    <div className="chats-container">
      <div className="chats-folders">
        <button
          className={`chats-folder-tab${activeFolderId === null ? ' active' : ''}`}
          onClick={() => setActiveFolderId(null)}
        >
          <Folder size={14} /> Все
        </button>
        {folders.map(f => (
          <div key={f.id} className={`chats-folder-tab-wrap${activeFolderId === f.id ? ' active' : ''}`}>
            <button
              className="chats-folder-tab"
              onClick={() => setActiveFolderId(f.id)}
              title={f.name}
            >
              <Folder size={14} /> {f.name}
            </button>
            <button
              className="chats-folder-edit"
              onClick={(e) => { e.stopPropagation(); setFolderEditor({ ...f }); }}
              title="Изменить"
            >
              <Pencil size={12} />
            </button>
          </div>
        ))}
        <button
          className="chats-folder-add"
          onClick={() => setFolderEditor({ name: '', filters: { tags: [], tagMode: 'any', activeOnly: false, bannedOnly: false, unreadOnly: false } })}
          title="Новая папка"
        >
          <Plus size={14} /> Папка
        </button>
      </div>

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
        {sortedChats.map(chat => {
          const user = getUser(chat.userId);
          const chatName = chat.fullName || (user ? user.fullName : null) || `Пользователь #${chat.userId}`;
          const msg = lastMsg(chat);
          return (
            <div
              key={chat.id}
              className={`chat-item${unreadChats.has(chat.id) ? ' chat-item--unread' : ''}`}
              onClick={() => navigate(`/chats/${chat.id}`)}
            >
              <div className="chat-item-avatar">
                {chatName.charAt(0)}
              </div>
              <div className="chat-item-info">
                <span className="chat-item-name">
                  {chatName}
                  {chat.banned && <span className="chat-blocked-badge" title="Заблокировал бота" />}
                </span>
                {msg && (
                  <span className="chat-item-last">
                    {msg.from === 'admin' ? 'Вы: ' : ''}{stripTgHtml(msg.text)}
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

      {folderEditor && (
        <FolderEditor
          value={folderEditor}
          allTags={allTags}
          onSave={saveFolder}
          onDelete={folderEditor.id ? () => deleteFolder(folderEditor.id) : null}
          onCancel={() => setFolderEditor(null)}
        />
      )}

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
