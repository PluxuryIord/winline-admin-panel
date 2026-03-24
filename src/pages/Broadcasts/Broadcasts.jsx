import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Send, Trash2, Search, Hash, AlertCircle, CheckCircle, XCircle,
  Loader, Users, MessageCircle, Filter, Paperclip, X, Image, FileText, Film,
  BarChart2, HelpCircle, Check, Archive, RotateCcw, ChevronDown, ChevronRight, Tag
} from 'lucide-react';
import { api } from '../../utils/api.js';
import PromptModal from '../KnowledgeBase/PromptModal';
import TgHtmlEditor from '../../components/TgHtmlEditor/TgHtmlEditor';
import './Broadcasts.css';

const STATUS_LABELS = {
  published: 'Доставлена',
  partial: 'Частично',
  failed: 'Ошибка',
};

const SECTIONS = [
  { id: 'channels', label: 'Каналы', icon: Hash },
  { id: 'users', label: 'Пользователи', icon: Users },
  { id: 'groups', label: 'Группы', icon: MessageCircle },
];

const COMPOSE_MODES = [
  { id: 'text', label: 'Текст', icon: FileText },
  { id: 'poll', label: 'Опрос', icon: BarChart2 },
  { id: 'quiz', label: 'Викторина', icon: HelpCircle },
];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ═══ Компонент прикрепления медиа ═══ */
function MediaAttach({ media, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('wl_admin_token');
      const res = await fetch('/api/broadcasts/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      let previewUrl = null;
      if (data.mimeType.startsWith('image/')) {
        previewUrl = data.url || URL.createObjectURL(file);
      }

      onChange({ ...data, previewUrl });
    } catch (err) {
      alert('Ошибка загрузки: ' + err.message);
    }
    setUploading(false);
  };

  const handleRemove = () => {
    if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
    onChange(null);
  };

  const MediaIcon = media?.mimeType?.startsWith('image/') ? Image
    : media?.mimeType?.startsWith('video/') ? Film
    : FileText;

  return (
    <div className="bc-media-attach">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {!media ? (
        <button
          className="bc-media-btn"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader size={14} className="spin" /> : <Paperclip size={14} />}
          {uploading ? 'Загрузка...' : 'Прикрепить файл'}
        </button>
      ) : (
        <div className="bc-media-preview">
          {media.previewUrl ? (
            <img src={media.previewUrl} alt="" className="bc-media-thumb" />
          ) : (
            <div className="bc-media-icon">
              <MediaIcon size={24} />
            </div>
          )}
          <div className="bc-media-info">
            <span className="bc-media-name">{media.originalName}</span>
            <span className="bc-media-size">{formatSize(media.size)}</span>
          </div>
          <button className="bc-media-remove" onClick={handleRemove} title="Удалить вложение">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══ Блок составления сообщения (текст / опрос / викторина) ═══ */
function ComposeBlock({ title, hintText, canSend, sending, sendResult, onSend }) {
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [media, setMedia] = useState(null);

  // Poll state
  const [question, setQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Quiz state
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptions, setQuizOptions] = useState(['', '']);
  const [correctIndex, setCorrectIndex] = useState(0);

  const addPollOption = () => setPollOptions(prev => [...prev, '']);
  const removePollOption = (i) => setPollOptions(prev => prev.filter((_, idx) => idx !== i));
  const editPollOption = (i, val) => setPollOptions(prev => { const n = [...prev]; n[i] = val; return n; });

  const addQuizOption = () => setQuizOptions(prev => [...prev, '']);
  const removeQuizOption = (i) => {
    setQuizOptions(prev => prev.filter((_, idx) => idx !== i));
    if (correctIndex === i) setCorrectIndex(0);
    else if (correctIndex > i) setCorrectIndex(prev => prev - 1);
  };
  const editQuizOption = (i, val) => setQuizOptions(prev => { const n = [...prev]; n[i] = val; return n; });

  const isValid = () => {
    if (mode === 'text') return !!(text.trim() || media);
    if (mode === 'poll') {
      return !!question.trim() && pollOptions.filter(o => o.trim()).length >= 2;
    }
    if (mode === 'quiz') {
      const opts = quizOptions.filter(o => o.trim());
      return !!quizQuestion.trim() && opts.length >= 2 && correctIndex < opts.length;
    }
    return false;
  };

  const handleSend = () => {
    if (mode === 'text') {
      const body = {};
      if (text.trim()) body.text = text.trim();
      if (media) body.media = { filename: media.filename, url: media.url, originalName: media.originalName, mimeType: media.mimeType };
      onSend(body, () => { setText(''); setMedia(null); });
    } else if (mode === 'poll') {
      const opts = pollOptions.filter(o => o.trim());
      if (!question.trim()) { alert('Введите вопрос опроса!'); return; }
      if (opts.length < 2) { alert('Добавьте минимум 2 варианта ответа!'); return; }
      onSend({ poll: { question: question.trim(), options: opts, type: 'regular' } }, () => {
        setQuestion(''); setPollOptions(['', '']);
      });
    } else if (mode === 'quiz') {
      const opts = quizOptions.filter(o => o.trim());
      if (!quizQuestion.trim()) { alert('Введите вопрос викторины!'); return; }
      if (opts.length < 2) { alert('Добавьте минимум 2 варианта ответа!'); return; }
      if (correctIndex >= opts.length) { alert('Выберите правильный ответ!'); return; }
      onSend({ poll: { question: quizQuestion.trim(), options: opts, type: 'quiz', correctIndex } }, () => {
        setQuizQuestion(''); setQuizOptions(['', '']); setCorrectIndex(0);
      });
    }
  };

  return (
    <div className="bc-section">
      <h3 className="bc-section-title">{title}</h3>

      {/* Переключатель режима */}
      <div className="bc-mode-tabs">
        {COMPOSE_MODES.map(m => {
          const MIcon = m.icon;
          return (
            <button
              key={m.id}
              className={`bc-mode-tab${mode === m.id ? ' bc-mode-tab--active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              <MIcon size={14} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Текстовый режим */}
      {mode === 'text' && (
        <>
          <TgHtmlEditor
            value={text}
            onChange={setText}
            placeholder="Текст сообщения..."
            minRows={3}
          />
          <MediaAttach media={media} onChange={setMedia} />
        </>
      )}

      {/* Опрос */}
      {mode === 'poll' && (
        <div className="bc-poll-editor">
          <input
            className="bc-poll-question"
            type="text"
            placeholder="Вопрос опроса..."
            value={question}
            onChange={e => setQuestion(e.target.value)}
          />
          <div className="bc-poll-options">
            {pollOptions.map((opt, i) => (
              <div key={i} className="bc-poll-option-row">
                <span className="bc-poll-option-num">{i + 1}</span>
                <input
                  className="bc-poll-option-input"
                  type="text"
                  placeholder={`Вариант ${i + 1}`}
                  value={opt}
                  onChange={e => editPollOption(i, e.target.value)}
                />
                {pollOptions.length > 2 && (
                  <button className="bc-poll-option-remove" onClick={() => removePollOption(i)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {pollOptions.length < 10 && (
            <button className="bc-poll-add-btn" onClick={addPollOption}>
              <Plus size={14} /> Добавить вариант
            </button>
          )}
        </div>
      )}

      {/* Викторина */}
      {mode === 'quiz' && (
        <div className="bc-poll-editor">
          <input
            className="bc-poll-question"
            type="text"
            placeholder="Вопрос викторины..."
            value={quizQuestion}
            onChange={e => setQuizQuestion(e.target.value)}
          />
          <div className="bc-poll-hint">Нажмите на галочку, чтобы отметить правильный ответ</div>
          <div className="bc-poll-options">
            {quizOptions.map((opt, i) => (
              <div key={i} className={`bc-poll-option-row${correctIndex === i ? ' bc-poll-option-row--correct' : ''}`}>
                <button
                  className={`bc-quiz-correct-btn${correctIndex === i ? ' bc-quiz-correct-btn--active' : ''}`}
                  onClick={() => setCorrectIndex(i)}
                  title="Правильный ответ"
                >
                  <Check size={12} />
                </button>
                <input
                  className="bc-poll-option-input"
                  type="text"
                  placeholder={`Вариант ${i + 1}`}
                  value={opt}
                  onChange={e => editQuizOption(i, e.target.value)}
                />
                {quizOptions.length > 2 && (
                  <button className="bc-poll-option-remove" onClick={() => removeQuizOption(i)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {quizOptions.length < 10 && (
            <button className="bc-poll-add-btn" onClick={addQuizOption}>
              <Plus size={14} /> Добавить вариант
            </button>
          )}
        </div>
      )}

      <div className="bc-compose-footer">
        <span className="bc-compose-hint">{hintText}</span>
        <button className="broadcasts-create-btn" disabled={sending || !(canSend && isValid())} onClick={handleSend}>
          {sending ? <Loader size={16} className="spin" /> : <Send size={16} />}
          {sending ? 'Отправка...' : 'Отправить'}
        </button>
      </div>
      {sendResult && (
        <div className={`bc-send-result ${sendResult.error ? 'bc-send-result--error' : 'bc-send-result--ok'}`}>
          {sendResult.error ? <><AlertCircle size={16} /> {sendResult.error}</> : <><CheckCircle size={16} /> Отправлено: {sendResult.success} из {sendResult.total}</>}
        </div>
      )}
    </div>
  );
}

/* ═══ Вкладка «Каналы» ═══ */
function ChannelsTab({ onSendResult }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState([]);

  const loadChannels = useCallback(() => {
    api.get('/api/broadcasts/channels').then(r => r.json()).then(setChannels).catch(() => {});
  }, []);
  const loadArchive = useCallback(() => {
    api.get('/api/broadcasts/channels/archive').then(r => r.json()).then(setArchived).catch(() => {});
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const handleArchive = async (id) => {
    try {
      await api.post(`/api/broadcasts/channels/${id}/archive`);
      loadChannels();
      loadArchive();
    } catch (e) { alert('Ошибка: ' + e.message); }
  };

  const handleRestore = async (id) => {
    try {
      await api.post(`/api/broadcasts/channels/restore/${id}`);
      loadChannels();
      loadArchive();
    } catch (e) { alert('Ошибка: ' + e.message); }
  };

  const handleAddChannel = async (input) => {
    setAddModal(false);
    const chatId = input.trim();
    if (!chatId) return;
    const title = chatId.startsWith('@') ? chatId : `Канал ${chatId}`;
    try {
      const res = await api.post('/api/broadcasts/channels', { chatId, title });
      const ch = await res.json();
      if (!res.ok) return alert(ch.error);
      setChannels(prev => [...prev, ch]);
    } catch (err) { alert(err.message); }
  };

  const handleDeleteChannel = async (id) => {
    await api.delete(`/api/broadcasts/channels/${id}`);
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  const toggleChannel = (chatId) => {
    setSelectedChannels(prev =>
      prev.includes(chatId) ? prev.filter(c => c !== chatId) : [...prev, chatId]
    );
  };

  const selectAll = () => {
    setSelectedChannels(prev =>
      prev.length === channels.length ? [] : channels.map(c => c.chatId)
    );
  };

  const handleSend = async (composeBody, resetCompose) => {
    if (!selectedChannels.length) return;
    setSending(true);
    setSendResult(null);
    try {
      const body = { channelIds: selectedChannels, ...composeBody };
      const res = await api.post('/api/broadcasts', body);
      const data = await res.json();
      if (!res.ok) {
        setSendResult({ error: data.error });
      } else {
        setSendResult(data);
        resetCompose();
        setSelectedChannels([]);
        onSendResult?.(data);
      }
    } catch (err) {
      setSendResult({ error: err.message });
    }
    setSending(false);
  };

  return (
    <>
      <div className="bc-section">
        <div className="bc-section-header">
          <h3 className="bc-section-title">Каналы</h3>
          <div className="bc-header-actions">
            <button className="bc-archive-toggle" onClick={() => { setShowArchive(!showArchive); if (!showArchive) loadArchive(); }}>
              <Archive size={14} /> {showArchive ? 'Скрыть архив' : 'Архив'}
              {archived.length > 0 && !showArchive && <span className="bc-archive-count">{archived.length}</span>}
            </button>
            <button className="bc-add-channel-btn" onClick={() => setAddModal(true)}>
              <Plus size={16} /> Добавить
            </button>
          </div>
        </div>

        {/* Active channels list */}
        {channels.length === 0 ? (
          <div className="bc-channels-empty">
            Каналы не добавлены. Нажмите «Добавить» и введите @username или chat_id канала.
          </div>
        ) : (
          <div className="bc-list-view">
            <label className="bc-list-item bc-list-item--all">
              <input type="checkbox" checked={selectedChannels.length === channels.length && channels.length > 0} onChange={selectAll} />
              <span>Все каналы ({channels.length})</span>
            </label>
            {channels.map(ch => (
              <div key={ch.id} className="bc-list-item">
                <label className="bc-list-item-main">
                  <input type="checkbox" checked={selectedChannels.includes(ch.chatId)} onChange={() => toggleChannel(ch.chatId)} />
                  <Hash size={14} className="bc-list-icon" />
                  <span className="bc-list-title">{ch.title}</span>
                  <span className="bc-list-id">{ch.chatId}</span>
                </label>
                <button className="bc-list-archive-btn" onClick={() => handleArchive(ch.id)} title="В архив">
                  <Archive size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Archived channels */}
        {showArchive && (
          <div className="bc-archive-section">
            <h4 className="bc-archive-title"><Archive size={14} /> Архив каналов</h4>
            {archived.length === 0 ? (
              <div className="bc-channels-empty">Архив пуст</div>
            ) : (
              <div className="bc-list-view bc-list-view--archive">
                {archived.map(ch => (
                  <div key={ch.id} className="bc-list-item bc-list-item--archived">
                    <div className="bc-list-item-main">
                      <Hash size={14} className="bc-list-icon" />
                      <span className="bc-list-title">{ch.title}</span>
                      <span className="bc-list-id">{ch.chatId}</span>
                    </div>
                    <button className="bc-list-restore-btn" onClick={() => handleRestore(ch.id)} title="Восстановить">
                      <RotateCcw size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ComposeBlock
        title="Новая рассылка в каналы"
        hintText={selectedChannels.length > 0 ? `Выбрано каналов: ${selectedChannels.length}` : 'Выберите каналы выше'}
        canSend={selectedChannels.length > 0}
        sending={sending}
        sendResult={sendResult}
        onSend={handleSend}
      />

      {addModal && (
        <PromptModal
          title="Добавить канал"
          placeholder="@username или chat_id (например -1001234567890)"
          onConfirm={handleAddChannel}
          onCancel={() => setAddModal(false)}
        />
      )}
    </>
  );
}

/* ═══ Вкладка «Пользователи» ═══ */
function UsersTab({ onSendResult }) {
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Фильтры
  const [tags, setTags] = useState([]);
  const [filterTag, setFilterTag] = useState('all');
  const [userCount, setUserCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);

  // Загрузка тегов
  useEffect(() => {
    api.get('/api/broadcasts/users/tags').then(r => r.json()).then(setTags).catch(() => {});
  }, []);

  // Подсчёт по фильтрам
  useEffect(() => {
    setCountLoading(true);
    const params = new URLSearchParams();
    if (filterTag !== 'all') params.set('tag', filterTag);

    api.get(`/api/broadcasts/users/count?${params}`)
      .then(r => r.json())
      .then(data => setUserCount(data.count))
      .catch(() => setUserCount(null))
      .finally(() => setCountLoading(false));
  }, [filterTag]);

  const handleSend = async (composeBody, resetCompose) => {
    setSending(true);
    setSendResult(null);
    try {
      const filters = {};
      if (filterTag !== 'all') filters.tag = filterTag;

      const body = { filters, ...composeBody };

      const res = await api.post('/api/broadcasts/users', body);
      const data = await res.json();
      if (!res.ok) {
        setSendResult({ error: data.error });
      } else {
        setSendResult(data);
        resetCompose();
        onSendResult?.(data);
      }
    } catch (err) {
      setSendResult({ error: err.message });
    }
    setSending(false);
  };

  const [showTagDD, setShowTagDD] = useState(false);
  const tagRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e) => {
      if (tagRef.current && !tagRef.current.contains(e.target)) setShowTagDD(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <>
      <div className="bc-users-filters">
        <div className="bc-tag-filter" ref={tagRef}>
          <button className="bc-tag-filter-btn" onClick={() => setShowTagDD(!showTagDD)}>
            <Tag size={14} />
            <span>{filterTag === 'all' ? 'Все теги' : filterTag}</span>
            <ChevronDown size={14} className={`bc-tag-chevron ${showTagDD ? 'open' : ''}`} />
          </button>
          {showTagDD && (
            <div className="bc-tag-dropdown">
              <div className={`bc-tag-option ${filterTag === 'all' ? 'active' : ''}`} onClick={() => { setFilterTag('all'); setShowTagDD(false); }}>
                Все теги
              </div>
              {tags.map(t => (
                <div key={t} className={`bc-tag-option ${filterTag === t ? 'active' : ''}`} onClick={() => { setFilterTag(t); setShowTagDD(false); }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bc-user-count">
          <Users size={15} />
          {countLoading ? <span>Подсчёт...</span> : <span>Получателей: <b>{userCount ?? '—'}</b></span>}
        </div>
      </div>

      <ComposeBlock
        title="Рассылка пользователям бота"
        hintText={userCount != null && userCount > 0 ? `Будет отправлено ${userCount} пользователям` : 'Нет пользователей по фильтрам'}
        canSend={userCount > 0}
        sending={sending}
        sendResult={sendResult}
        onSend={handleSend}
      />
    </>
  );
}

/* ═══ Вкладка «Группы» ═══ */
function GroupsTab({ onSendResult }) {
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState([]);

  const loadGroups = useCallback(() => {
    api.get('/api/broadcasts/groups').then(r => r.json()).then(setGroups).catch(() => {});
  }, []);
  const loadArchive = useCallback(() => {
    api.get('/api/broadcasts/groups/archive').then(r => r.json()).then(setArchived).catch(() => {});
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleArchive = async (id) => {
    try {
      await api.post(`/api/broadcasts/groups/${id}/archive`);
      loadGroups();
      loadArchive();
    } catch (e) { alert('Ошибка: ' + e.message); }
  };

  const handleRestore = async (id) => {
    try {
      await api.post(`/api/broadcasts/groups/restore/${id}`);
      loadGroups();
      loadArchive();
    } catch (e) { alert('Ошибка: ' + e.message); }
  };

  const handleAddGroup = async (input) => {
    setAddModal(false);
    const chatId = input.trim();
    if (!chatId) return;
    const title = chatId.startsWith('@') ? chatId : `Группа ${chatId}`;
    try {
      const res = await api.post('/api/broadcasts/groups', { chatId, title });
      const g = await res.json();
      if (!res.ok) return alert(g.error);
      setGroups(prev => [...prev, g]);
    } catch (err) { alert(err.message); }
  };

  const handleDeleteGroup = async (id) => {
    await api.delete(`/api/broadcasts/groups/${id}`);
    setGroups(prev => prev.filter(g => g.id !== id));
  };

  const toggleGroup = (chatId) => {
    setSelectedGroups(prev =>
      prev.includes(chatId) ? prev.filter(c => c !== chatId) : [...prev, chatId]
    );
  };

  const selectAll = () => {
    setSelectedGroups(prev =>
      prev.length === groups.length ? [] : groups.map(g => g.chatId)
    );
  };

  const handleSend = async (composeBody, resetCompose) => {
    if (!selectedGroups.length) return;
    setSending(true);
    setSendResult(null);
    try {
      const body = { groupIds: selectedGroups, ...composeBody };
      const res = await api.post('/api/broadcasts/groups/send', body);
      const data = await res.json();
      if (!res.ok) {
        setSendResult({ error: data.error });
      } else {
        setSendResult(data);
        resetCompose();
        setSelectedGroups([]);
        onSendResult?.(data);
      }
    } catch (err) {
      setSendResult({ error: err.message });
    }
    setSending(false);
  };

  return (
    <>
      <div className="bc-section">
        <div className="bc-section-header">
          <h3 className="bc-section-title">Группы / чаты</h3>
          <div className="bc-header-actions">
            <button className="bc-archive-toggle" onClick={() => { setShowArchive(!showArchive); if (!showArchive) loadArchive(); }}>
              <Archive size={14} /> {showArchive ? 'Скрыть архив' : 'Архив'}
              {archived.length > 0 && !showArchive && <span className="bc-archive-count">{archived.length}</span>}
            </button>
            <button className="bc-add-channel-btn" onClick={() => setAddModal(true)}>
              <Plus size={16} /> Добавить
            </button>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="bc-channels-empty">
            Группы не добавлены. Нажмите «Добавить» и введите chat_id группы где есть бот.
          </div>
        ) : (
          <div className="bc-list-view">
            <label className="bc-list-item bc-list-item--all">
              <input type="checkbox" checked={selectedGroups.length === groups.length && groups.length > 0} onChange={selectAll} />
              <span>Все группы ({groups.length})</span>
            </label>
            {groups.map(g => (
              <div key={g.id} className="bc-list-item">
                <label className="bc-list-item-main">
                  <input type="checkbox" checked={selectedGroups.includes(g.chatId)} onChange={() => toggleGroup(g.chatId)} />
                  <MessageCircle size={14} className="bc-list-icon" />
                  <span className="bc-list-title">{g.title}</span>
                  <span className="bc-list-id">{g.chatId}</span>
                </label>
                <button className="bc-list-archive-btn" onClick={() => handleArchive(g.id)} title="В архив">
                  <Archive size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showArchive && (
          <div className="bc-archive-section">
            <h4 className="bc-archive-title"><Archive size={14} /> Архив групп</h4>
            {archived.length === 0 ? (
              <div className="bc-channels-empty">Архив пуст</div>
            ) : (
              <div className="bc-list-view bc-list-view--archive">
                {archived.map(g => (
                  <div key={g.id} className="bc-list-item bc-list-item--archived">
                    <div className="bc-list-item-main">
                      <MessageCircle size={14} className="bc-list-icon" />
                      <span className="bc-list-title">{g.title}</span>
                      <span className="bc-list-id">{g.chatId}</span>
                    </div>
                    <button className="bc-list-restore-btn" onClick={() => handleRestore(g.id)} title="Восстановить">
                      <RotateCcw size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ComposeBlock
        title="Рассылка в группы"
        hintText={selectedGroups.length > 0 ? `Выбрано групп: ${selectedGroups.length}` : 'Выберите группы выше'}
        canSend={selectedGroups.length > 0}
        sending={sending}
        sendResult={sendResult}
        onSend={handleSend}
      />

      {addModal && (
        <PromptModal
          title="Добавить группу"
          placeholder="Chat ID группы (например -1001234567890)"
          onConfirm={handleAddGroup}
          onCancel={() => setAddModal(false)}
        />
      )}
    </>
  );
}

/* ═══ Главный компонент ═══ */
export default function Broadcasts() {
  const [openSection, setOpenSection] = useState('channels');
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const [visibleCount, setVisibleCount] = useState(20);

  const fetchBroadcasts = useCallback(async () => {
    try {
      const res = await api.get('/api/broadcasts');
      setBroadcasts(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBroadcasts(); }, [fetchBroadcasts]);

  const handleSendResult = (data) => {
    if (data && !data.error) {
      setBroadcasts(prev => [data, ...prev]);
    }
  };

  const handleDeleteBroadcast = async () => {
    if (!deleteModal) return;
    await api.delete(`/api/broadcasts/${deleteModal}`);
    setBroadcasts(prev => prev.filter(b => b.id !== deleteModal));
    setDeleteModal(null);
  };

  const filtered = broadcasts.filter(b =>
    (b.text || '').toLowerCase().includes(search.toLowerCase())
  );

  const paginatedFiltered = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const TYPE_ICONS = { users: '👤', groups: '💬', poll: '📊', quiz: '🧠' };

  const [mounted, setMounted] = useState({ channels: true }); // track which sections have been opened
  const toggleSection = (id) => {
    setOpenSection(prev => prev === id ? null : id);
    setMounted(prev => ({ ...prev, [id]: true }));
  };

  if (loading) {
    return (
      <div className="broadcasts-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--color-orange)' }} />
      </div>
    );
  }

  return (
    <div className="broadcasts-container">

      {/* Аккордеон секций */}
      {SECTIONS.map(s => {
        const Icon = s.icon;
        const isOpen = openSection === s.id;
        return (
          <div key={s.id} className={`bc-accordion ${isOpen ? 'open' : ''}`}>
            <button className="bc-accordion-header" onClick={() => toggleSection(s.id)}>
              <Icon size={18} />
              <span className="bc-accordion-label">{s.label}</span>
              <ChevronDown size={18} className={`bc-accordion-chevron ${isOpen ? 'open' : ''}`} />
            </button>
            <div className="bc-accordion-body-wrap">
              <div className="bc-accordion-body">
                <div className="bc-accordion-body-inner">
                  {mounted[s.id] && (
                    <>
                      {s.id === 'channels' && <ChannelsTab onSendResult={handleSendResult} />}
                      {s.id === 'users' && <UsersTab onSendResult={handleSendResult} />}
                      {s.id === 'groups' && <GroupsTab onSendResult={handleSendResult} />}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* История */}
      <div className="bc-section bc-section--grow">
        <div className="bc-section-header">
          <h3 className="bc-section-title">История рассылок</h3>
          <div className="bc-search-box bc-search-box--small">
            <Search size={14} className="bc-search-icon" />
            <input
              className="bc-search-input"
              placeholder="Поиск..."
              value={search}
              onChange={e => { setSearch(e.target.value); setVisibleCount(20); }}
            />
          </div>
        </div>

        <div className="broadcasts-table-wrap">
          <table className="broadcasts-table">
            <thead>
              <tr>
                <th>Текст</th>
                <th>Получатели</th>
                <th>Статус</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedFiltered.length === 0 ? (
                <tr><td colSpan={5} className="broadcasts-empty">Рассылок пока нет</td></tr>
              ) : paginatedFiltered.map(b => (
                <tr key={b.id} className="broadcasts-row">
                  <td className="bc-title-cell">
                    <span className="bc-type-badge">{TYPE_ICONS[b.type] || '📢'}</span>
                    <span>{b.media ? `[${b.media.originalName}] ` : ''}{b.text}</span>
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
                      {b.total > 1 && ` ${b.success}/${b.total}`}
                    </span>
                  </td>
                  <td className="bc-date">
                    {new Date(b.date).toLocaleDateString('ru-RU')}{' '}
                    {new Date(b.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="bc-actions">
                    <button className="bc-action-btn bc-action-delete" title="Удалить из истории" onClick={() => setDeleteModal(b.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <button
            className="broadcasts-create-btn"
            style={{ alignSelf: 'center', margin: '12px auto 0' }}
            onClick={() => setVisibleCount(prev => prev + 20)}
          >
            Загрузить ещё ({filtered.length - visibleCount} осталось)
          </button>
        )}
      </div>

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
