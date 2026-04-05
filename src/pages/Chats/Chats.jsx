import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, List, LayoutGrid, Plus, Folder, FolderInput, MoreVertical } from 'lucide-react';
import { api } from '../../utils/api.js';
import { useUnread } from '../../contexts/UnreadContext.jsx';
import PromptModal from '../KnowledgeBase/PromptModal';
import './Chats.css';

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
  const [activeFolderId, setActiveFolderId] = useState(null); // null = All, 0 = "Без папки"
  const [createPrompt, setCreatePrompt] = useState(false);
  const [renamePrompt, setRenamePrompt] = useState(null); // folder obj
  const [deleteFolderPrompt, setDeleteFolderPrompt] = useState(null);
  const [moveMenu, setMoveMenu] = useState(null); // { chatId, x, y }
  const moveMenuRef = useRef(null);

  useEffect(() => {
    api.get('/api/chats').then(r => r.json()).then(setChats).catch(() => {});
    api.get('/api/users?limit=200').then(r => r.json()).then(data => setUsers(data.users || data)).catch(() => {});
    reloadFolders();
  }, []);

  const reloadFolders = () => api.get('/api/chat-folders').then(r => r.json()).then(setFolders).catch(() => {});

  // SSE — realtime
  useEffect(() => {
    const es = new EventSource('/api/chats/stream', { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'new_message') {
          setChats(prev => {
            const idx = prev.findIndex(c => c.id === data.chatId);
            if (idx >= 0) {
              const updated = [...prev];
              const chat = { ...updated[idx] };
              if (!chat.messages.some(m => m.id === data.message.id)) {
                chat.messages = [...chat.messages, data.message];
              }
              updated.splice(idx, 1);
              return [chat, ...updated];
            }
            return [{ id: data.chatId, userId: data.userId, folderId: null, messages: [data.message] }, ...prev];
          });
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  // Close move menu on outside click
  useEffect(() => {
    if (!moveMenu) return;
    const handler = (e) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target)) setMoveMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moveMenu]);

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

  const createFolder = async (name) => {
    setCreatePrompt(false);
    if (!name?.trim()) return;
    await api.post('/api/chat-folders', { name: name.trim() });
    reloadFolders();
  };

  const renameFolder = async (name) => {
    const folder = renamePrompt;
    setRenamePrompt(null);
    if (!name?.trim()) return;
    await api.put(`/api/chat-folders/${folder.id}`, { name: name.trim() });
    reloadFolders();
  };

  const deleteFolder = async () => {
    const folder = deleteFolderPrompt;
    setDeleteFolderPrompt(null);
    await api.delete(`/api/chat-folders/${folder.id}`);
    if (activeFolderId === folder.id) setActiveFolderId(null);
    // Drop folderId locally for any chat that was in it
    setChats(prev => prev.map(c => c.folderId === folder.id ? { ...c, folderId: null } : c));
    reloadFolders();
  };

  const assignChatToFolder = async (chatId, folderId) => {
    setMoveMenu(null);
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, folderId } : c));
    await api.put('/api/chat-folders/assign', { chatId, folderId });
  };

  const lastMsg = (chat) => chat.messages.at(-1);

  // Filter by active folder
  const visibleChats = activeFolderId === null
    ? chats
    : chats.filter(c => (c.folderId || null) === activeFolderId);

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
              onDoubleClick={() => setRenamePrompt(f)}
              title="Двойной клик — переименовать"
            >
              <Folder size={14} /> {f.name}
            </button>
            <button
              className="chats-folder-edit"
              onClick={(e) => { e.stopPropagation(); setDeleteFolderPrompt(f); }}
              title="Удалить папку"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          className="chats-folder-add"
          onClick={() => setCreatePrompt(true)}
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
        {sortedChats.length === 0 && (
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
              <div className="chat-item-avatar">{chatName.charAt(0)}</div>
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
                className="chat-item-move"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMoveMenu({ chatId: chat.id, x: rect.right, y: rect.bottom });
                }}
                title="Переместить в папку"
              >
                <FolderInput size={14} />
              </button>
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

      {moveMenu && (
        <div
          ref={moveMenuRef}
          className="chats-move-menu"
          style={{ top: moveMenu.y + 4, left: Math.max(8, moveMenu.x - 180) }}
        >
          <div className="chats-move-menu-title">Переместить в…</div>
          <button onClick={() => assignChatToFolder(moveMenu.chatId, null)}>
            <Folder size={12} /> Без папки
          </button>
          {folders.map(f => (
            <button key={f.id} onClick={() => assignChatToFolder(moveMenu.chatId, f.id)}>
              <Folder size={12} /> {f.name}
            </button>
          ))}
          {folders.length === 0 && (
            <div className="chats-move-menu-empty">Сначала создайте папку</div>
          )}
        </div>
      )}

      {createPrompt && (
        <PromptModal
          title="Новая папка"
          placeholder="Название"
          onConfirm={createFolder}
          onCancel={() => setCreatePrompt(false)}
        />
      )}

      {renamePrompt && (
        <PromptModal
          title="Переименовать папку"
          placeholder="Название"
          defaultValue={renamePrompt.name}
          onConfirm={renameFolder}
          onCancel={() => setRenamePrompt(null)}
        />
      )}

      {deleteFolderPrompt && (
        <PromptModal
          title={`Удалить папку «${deleteFolderPrompt.name}»?`}
          isConfirm
          onConfirm={deleteFolder}
          onCancel={() => setDeleteFolderPrompt(null)}
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
