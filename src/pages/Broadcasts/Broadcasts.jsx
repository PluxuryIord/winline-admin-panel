import { useState, useEffect, useCallback } from 'react';
import { Plus, Send, Trash2, Search, Hash, AlertCircle, CheckCircle, XCircle, Loader } from 'lucide-react';
import PromptModal from '../KnowledgeBase/PromptModal';
import './Broadcasts.css';

const STATUS_LABELS = {
  published: 'Доставлена',
  partial: 'Частично',
  failed: 'Ошибка',
};

export default function Broadcasts() {
  const [channels, setChannels] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Форма новой рассылки
  const [text, setText] = useState('');
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Модалки
  const [addChannelModal, setAddChannelModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);

  // Поиск
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [chRes, brRes] = await Promise.all([
        fetch('/api/broadcasts/channels'),
        fetch('/api/broadcasts'),
      ]);
      setChannels(await chRes.json());
      setBroadcasts(await brRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Добавить канал
  const handleAddChannel = async (input) => {
    setAddChannelModal(false);
    const chatId = input.trim();
    if (!chatId) return;
    // Если ввели @username — оставляем как есть, Telegram примет
    const title = chatId.startsWith('@') ? chatId : `Канал ${chatId}`;
    try {
      const res = await fetch('/api/broadcasts/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, title }),
      });
      const ch = await res.json();
      if (!res.ok) return alert(ch.error);
      setChannels(prev => [...prev, ch]);
    } catch (err) { alert(err.message); }
  };

  // Удалить канал
  const handleDeleteChannel = async (id) => {
    await fetch(`/api/broadcasts/channels/${id}`, { method: 'DELETE' });
    setChannels(prev => prev.filter(c => c.id !== id));
    setSelectedChannels(prev => prev.filter(cid => {
      const ch = channels.find(c => c.id === id);
      return ch ? cid !== ch.chatId : true;
    }));
  };

  // Выбор/снятие канала
  const toggleChannel = (chatId) => {
    setSelectedChannels(prev =>
      prev.includes(chatId) ? prev.filter(c => c !== chatId) : [...prev, chatId]
    );
  };

  const selectAll = () => {
    if (selectedChannels.length === channels.length) {
      setSelectedChannels([]);
    } else {
      setSelectedChannels(channels.map(c => c.chatId));
    }
  };

  // Отправить рассылку
  const handleSend = async () => {
    if (!text.trim() || !selectedChannels.length) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), channelIds: selectedChannels }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendResult({ error: data.error });
      } else {
        setSendResult(data);
        setText('');
        setSelectedChannels([]);
        setBroadcasts(prev => [data, ...prev]);
      }
    } catch (err) {
      setSendResult({ error: err.message });
    }
    setSending(false);
  };

  // Удалить рассылку из истории
  const handleDeleteBroadcast = async () => {
    if (!deleteModal) return;
    await fetch(`/api/broadcasts/${deleteModal}`, { method: 'DELETE' });
    setBroadcasts(prev => prev.filter(b => b.id !== deleteModal));
    setDeleteModal(null);
  };

  // Фильтр истории
  const filtered = broadcasts.filter(b =>
    b.text.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="broadcasts-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--color-orange)' }} />
      </div>
    );
  }

  return (
    <div className="broadcasts-container">

      {/* === БЛОК: КАНАЛЫ === */}
      <div className="bc-section">
        <div className="bc-section-header">
          <h3 className="bc-section-title">Каналы</h3>
          <button className="bc-add-channel-btn" onClick={() => setAddChannelModal(true)}>
            <Plus size={16} /> Добавить
          </button>
        </div>

        {channels.length === 0 ? (
          <div className="bc-channels-empty">
            Каналы не добавлены. Нажмите «Добавить» и введите @username или chat_id канала.
          </div>
        ) : (
          <div className="bc-channels-list">
            <label className="bc-channel-item bc-channel-item--all" onClick={selectAll}>
              <input type="checkbox" checked={selectedChannels.length === channels.length} readOnly />
              <span>Все каналы ({channels.length})</span>
            </label>
            {channels.map(ch => (
              <label key={ch.id} className="bc-channel-item">
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(ch.chatId)}
                  onChange={() => toggleChannel(ch.chatId)}
                />
                <Hash size={14} className="bc-channel-hash" />
                <span className="bc-channel-name">{ch.title}</span>
                <button
                  className="bc-channel-remove"
                  onClick={(e) => { e.preventDefault(); handleDeleteChannel(ch.id); }}
                  title="Удалить канал"
                >
                  <Trash2 size={13} />
                </button>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* === БЛОК: НОВАЯ РАССЫЛКА === */}
      <div className="bc-section">
        <h3 className="bc-section-title">Новая рассылка</h3>
        <textarea
          className="bc-compose-textarea"
          placeholder="Текст сообщения (поддерживается HTML: <b>, <i>, <a href>...)"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
        />
        <div className="bc-compose-footer">
          <span className="bc-compose-hint">
            {selectedChannels.length > 0
              ? `Выбрано каналов: ${selectedChannels.length}`
              : 'Выберите каналы выше'}
          </span>
          <button
            className="broadcasts-create-btn"
            disabled={sending || !text.trim() || !selectedChannels.length}
            onClick={handleSend}
          >
            {sending ? <Loader size={16} className="spin" /> : <Send size={16} />}
            {sending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>

        {sendResult && (
          <div className={`bc-send-result ${sendResult.error ? 'bc-send-result--error' : 'bc-send-result--ok'}`}>
            {sendResult.error ? (
              <><AlertCircle size={16} /> {sendResult.error}</>
            ) : (
              <><CheckCircle size={16} /> Отправлено: {sendResult.success} из {sendResult.total}</>
            )}
          </div>
        )}
      </div>

      {/* === БЛОК: ИСТОРИЯ === */}
      <div className="bc-section bc-section--grow">
        <div className="bc-section-header">
          <h3 className="bc-section-title">История рассылок</h3>
          <div className="bc-search-box bc-search-box--small">
            <Search size={14} className="bc-search-icon" />
            <input
              className="bc-search-input"
              placeholder="Поиск..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="broadcasts-table-wrap">
          <table className="broadcasts-table">
            <thead>
              <tr>
                <th>Текст</th>
                <th>Каналы</th>
                <th>Статус</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="broadcasts-empty">Рассылок пока нет</td></tr>
              ) : filtered.map(b => (
                <tr key={b.id} className="broadcasts-row">
                  <td className="bc-title-cell">
                    <Send size={14} className="bc-type-icon" />
                    <span>{b.text}</span>
                  </td>
                  <td className="bc-channel">
                    {(b.channels || []).join(', ') || '—'}
                  </td>
                  <td>
                    <span className={`bc-status bc-status--${b.status}`}>
                      {b.status === 'published' && <CheckCircle size={12} />}
                      {b.status === 'failed' && <XCircle size={12} />}
                      {b.status === 'partial' && <AlertCircle size={12} />}
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                  </td>
                  <td className="bc-date">
                    {new Date(b.date).toLocaleDateString('ru-RU')}{' '}
                    {new Date(b.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="bc-actions">
                    <button
                      className="bc-action-btn bc-action-delete"
                      title="Удалить из истории"
                      onClick={() => setDeleteModal(b.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модалки */}
      {addChannelModal && (
        <PromptModal
          title="Добавить канал"
          placeholder="@username или chat_id (например -1001234567890)"
          onConfirm={handleAddChannel}
          onCancel={() => setAddChannelModal(false)}
        />
      )}

      {deleteModal && (
        <PromptModal
          title="Удалить запись из истории?"
          isConfirm
          onConfirm={handleDeleteBroadcast}
          onCancel={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}
