import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Send, Trash2, Search, Hash, AlertCircle, CheckCircle, XCircle,
  Loader, Users, MessageCircle, Filter, Paperclip, X, Image, FileText, Film,
  BarChart2, HelpCircle, Check, Archive, RotateCcw, ChevronDown, ChevronRight, Tag, Eye
} from 'lucide-react';
import { api } from '../../utils/api.js';
import PromptModal from '../KnowledgeBase/PromptModal';
import TgHtmlEditor from '../../components/TgHtmlEditor/TgHtmlEditor';
import './Broadcasts.css';

/** Strip HTML for preview text */
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

/** Sanitize TG HTML for safe rendering */
function renderTgHtml(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/\n/g, '<br>');
  s = s.replace(/<tg-emoji\s+emoji-id="(\d+)">[^<]*<\/tg-emoji>/g,
    (_, id) => `<img src="/emoji/${id}.webp" style="width:18px;height:18px;vertical-align:middle;display:inline" />`);
  s = s.replace(/<(?!\/?(?:b|i|em|strong|a|code|br|img)\b)[^>]*>/gi, '');
  return s;
}

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
function ChannelTagsEditor({ chatId, allChannelTags, onTagsChange }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDD, setShowDD] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const ddRef = useRef(null);

  useEffect(() => {
    api.get(`/api/broadcasts/channels/${encodeURIComponent(chatId)}/tags`)
      .then(r => r.json())
      .then(data => { setTags(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [chatId]);

  useEffect(() => {
    const handler = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setShowDD(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const saveTags = async (newTags) => {
    setTags(newTags);
    try {
      await api.put(`/api/broadcasts/channels/${encodeURIComponent(chatId)}/tags`, { tags: newTags });
      onTagsChange?.();
    } catch { /* ignore */ }
  };

  const toggleTag = (tag) => {
    const newTags = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
    saveTags(newTags);
  };

  const removeTag = (tag) => {
    saveTags(tags.filter(t => t !== tag));
  };

  const addNewTag = () => {
    const t = tagSearch.trim();
    if (t && !tags.includes(t)) {
      saveTags([...tags, t]);
    }
    setTagSearch('');
  };

  if (loading) return null;

  const filteredSuggestions = allChannelTags
    .filter(t => !tags.includes(t))
    .filter(t => !tagSearch.trim() || t.toLowerCase().includes(tagSearch.trim().toLowerCase()));

  return (
    <div className="bc-ch-tags" ref={ddRef}>
      {tags.map(t => (
        <span key={t} className="bc-ch-tag-chip">
          {t}
          <button className="bc-chip-remove" onClick={(e) => { e.stopPropagation(); removeTag(t); }}><X size={10} /></button>
        </span>
      ))}
      <button className="bc-ch-tag-add" onClick={(e) => { e.stopPropagation(); setShowDD(!showDD); }} title="Добавить тег">
        <Plus size={12} />
      </button>
      {showDD && (
        <div className="bc-ch-tag-dropdown">
          <div className="bc-tag-search-wrap">
            <Search size={12} className="bc-tag-search-icon" />
            <input
              className="bc-tag-search-input"
              type="text"
              placeholder="Поиск или новый тег..."
              value={tagSearch}
              onChange={e => setTagSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { addNewTag(); } }}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="bc-tag-options-list">
            {filteredSuggestions.map(t => (
              <div key={t} className="bc-tag-option" onClick={(e) => { e.stopPropagation(); toggleTag(t); }}>
                {t}
              </div>
            ))}
            {tagSearch.trim() && !allChannelTags.includes(tagSearch.trim()) && !tags.includes(tagSearch.trim()) && (
              <div className="bc-tag-option bc-tag-option--create" onClick={(e) => { e.stopPropagation(); addNewTag(); }}>
                <Plus size={12} /> Создать «{tagSearch.trim()}»
              </div>
            )}
            {filteredSuggestions.length === 0 && !tagSearch.trim() && (
              <div className="bc-tag-option bc-tag-option--empty">Введите название тега</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelsTab({ onSendResult }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState([]);

  // Channel tags
  const [allChannelTags, setAllChannelTags] = useState([]);
  const [filterChannelTag, setFilterChannelTag] = useState('');
  const [channelTagsMap, setChannelTagsMap] = useState({});
  const [showChTagDD, setShowChTagDD] = useState(false);
  const [chTagSearch, setChTagSearch] = useState('');
  const chTagRef = useRef(null);

  const loadAllChannelTags = useCallback(() => {
    api.get('/api/broadcasts/channel-tags').then(r => r.json()).then(setAllChannelTags).catch(() => {});
  }, []);

  const loadChannelTagsMap = useCallback(async (chList) => {
    const map = {};
    await Promise.all(chList.map(async (ch) => {
      try {
        const res = await api.get(`/api/broadcasts/channels/${encodeURIComponent(ch.chatId)}/tags`);
        map[ch.chatId] = await res.json();
      } catch { map[ch.chatId] = []; }
    }));
    setChannelTagsMap(map);
  }, []);

  const loadChannels = useCallback(() => {
    api.get('/api/broadcasts/channels').then(r => r.json()).then(data => {
      setChannels(data);
      loadChannelTagsMap(data);
    }).catch(() => {});
  }, [loadChannelTagsMap]);

  const loadArchive = useCallback(() => {
    api.get('/api/broadcasts/channels/archive').then(r => r.json()).then(setArchived).catch(() => {});
  }, []);

  useEffect(() => { loadChannels(); loadAllChannelTags(); }, [loadChannels, loadAllChannelTags]);

  useEffect(() => {
    const handler = (e) => { if (chTagRef.current && !chTagRef.current.contains(e.target)) setShowChTagDD(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleTagsChange = () => {
    loadAllChannelTags();
    loadChannels();
  };

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

  const filteredChannels = filterChannelTag
    ? channels.filter(ch => (channelTagsMap[ch.chatId] || []).includes(filterChannelTag))
    : channels;

  const toggleChannel = (chatId) => {
    setSelectedChannels(prev =>
      prev.includes(chatId) ? prev.filter(c => c !== chatId) : [...prev, chatId]
    );
  };

  const selectAll = () => {
    setSelectedChannels(prev =>
      prev.length === filteredChannels.length ? [] : filteredChannels.map(c => c.chatId)
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
            {allChannelTags.length > 0 && (
              <div className="bc-tag-filter" ref={chTagRef}>
                <button className="bc-tag-filter-btn bc-tag-filter-btn--small" onClick={() => setShowChTagDD(!showChTagDD)}>
                  <Filter size={13} />
                  <span>{filterChannelTag || 'Все теги'}</span>
                  <ChevronDown size={13} className={`bc-tag-chevron ${showChTagDD ? 'open' : ''}`} />
                </button>
                {showChTagDD && (
                  <div className="bc-tag-dropdown">
                    {allChannelTags.length > 5 && (
                      <div className="bc-tag-search-wrap">
                        <Search size={12} className="bc-tag-search-icon" />
                        <input
                          className="bc-tag-search-input"
                          type="text"
                          placeholder="Поиск..."
                          value={chTagSearch}
                          onChange={e => setChTagSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                    )}
                    <div className="bc-tag-options-list">
                      <div className={`bc-tag-option ${!filterChannelTag ? 'active' : ''}`} onClick={() => { setFilterChannelTag(''); setShowChTagDD(false); setChTagSearch(''); }}>
                        Все теги
                      </div>
                      {allChannelTags
                        .filter(t => !chTagSearch.trim() || t.toLowerCase().includes(chTagSearch.trim().toLowerCase()))
                        .map(t => (
                          <div key={t} className={`bc-tag-option ${filterChannelTag === t ? 'active' : ''}`} onClick={() => { setFilterChannelTag(t); setShowChTagDD(false); setChTagSearch(''); }}>
                            {t}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
              <input type="checkbox" checked={selectedChannels.length === filteredChannels.length && filteredChannels.length > 0} onChange={selectAll} />
              <span>{filterChannelTag ? `Каналы с тегом «${filterChannelTag}» (${filteredChannels.length})` : `Все каналы (${channels.length})`}</span>
            </label>
            {filteredChannels.map(ch => (
              <div key={ch.id} className="bc-list-item bc-list-item--with-tags">
                <label className="bc-list-item-main">
                  <input type="checkbox" checked={selectedChannels.includes(ch.chatId)} onChange={() => toggleChannel(ch.chatId)} />
                  <Hash size={14} className="bc-list-icon" />
                  <span className="bc-list-title">{ch.title}</span>
                  <span className="bc-list-id">{ch.chatId}</span>
                </label>
                <ChannelTagsEditor chatId={ch.chatId} allChannelTags={allChannelTags} onTagsChange={handleTagsChange} />
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
  const [selectedTags, setSelectedTags] = useState([]);
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
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));

    api.get(`/api/broadcasts/users/count?${params}`)
      .then(r => r.json())
      .then(data => setUserCount(data.count))
      .catch(() => setUserCount(null))
      .finally(() => setCountLoading(false));
  }, [selectedTags]);

  const toggleTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const removeTag = (tag) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const handleSend = async (composeBody, resetCompose) => {
    setSending(true);
    setSendResult(null);
    try {
      const filters = {};
      if (selectedTags.length > 0) filters.tags = selectedTags;

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
  const [tagSearch, setTagSearch] = useState('');
  const tagRef = useRef(null);
  const tagSearchRef = useRef(null);

  // Recipients list
  const [showRecipients, setShowRecipients] = useState(false);
  const [recipientsList, setRecipientsList] = useState([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  const loadRecipients = async () => {
    if (showRecipients) { setShowRecipients(false); return; }
    setRecipientsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
      const res = await api.get(`/api/broadcasts/users/list?${params}`);
      const data = await res.json();
      setRecipientsList(data);
      setShowRecipients(true);
    } catch { setRecipientsList([]); }
    setRecipientsLoading(false);
  };

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
            <span>{selectedTags.length === 0 ? 'Все теги' : `Тегов: ${selectedTags.length}`}</span>
            <ChevronDown size={14} className={`bc-tag-chevron ${showTagDD ? 'open' : ''}`} />
          </button>
          {showTagDD && (
            <div className="bc-tag-dropdown">
              {tags.length > 5 && (
                <div className="bc-tag-search-wrap">
                  <Search size={13} className="bc-tag-search-icon" />
                  <input
                    ref={tagSearchRef}
                    className="bc-tag-search-input"
                    type="text"
                    placeholder="Поиск тега..."
                    value={tagSearch}
                    onChange={e => setTagSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
              <div className="bc-tag-options-list">
                {(!tagSearch.trim()) && (
                  <div className={`bc-tag-option ${selectedTags.length === 0 ? 'active' : ''}`} onClick={() => { setSelectedTags([]); setTagSearch(''); }}>
                    Все теги
                  </div>
                )}
                {tags
                  .filter(t => !tagSearch.trim() || t.toLowerCase().includes(tagSearch.trim().toLowerCase()))
                  .map(t => (
                    <label key={t} className={`bc-tag-option bc-tag-option--checkbox ${selectedTags.includes(t) ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); toggleTag(t); }}>
                      <input type="checkbox" checked={selectedTags.includes(t)} readOnly className="bc-tag-checkbox" />
                      <span>{t}</span>
                    </label>
                  ))}
                {tagSearch.trim() && tags.filter(t => t.toLowerCase().includes(tagSearch.trim().toLowerCase())).length === 0 && (
                  <div className="bc-tag-option bc-tag-option--empty">Ничего не найдено</div>
                )}
              </div>
            </div>
          )}
        </div>

        {selectedTags.length > 0 && (
          <div className="bc-selected-tags">
            {selectedTags.map(t => (
              <span key={t} className="bc-selected-tag-chip">
                {t}
                <button className="bc-chip-remove" onClick={() => removeTag(t)}><X size={11} /></button>
              </span>
            ))}
            <button className="bc-clear-tags-btn" onClick={() => setSelectedTags([])}>Сбросить</button>
          </div>
        )}

        <div className="bc-user-count">
          <Users size={15} />
          {countLoading ? <span>Подсчёт...</span> : <span>Получателей: <b>{userCount ?? '—'}</b></span>}
          {userCount > 0 && (
            <button
              className="bc-show-recipients-btn"
              onClick={loadRecipients}
              disabled={recipientsLoading}
              title="Показать список получателей"
            >
              {recipientsLoading ? <Loader size={14} className="spin" /> : <Eye size={14} />}
              Показать список
            </button>
          )}
        </div>

        {showRecipients && (
          <div className="bc-recipients-popup">
            <div className="bc-recipients-header">
              <span>Получатели ({recipientsList.length}{userCount > 100 ? ` из ${userCount}` : ''})</span>
              <button className="bc-recipients-close" onClick={() => setShowRecipients(false)}><X size={14} /></button>
            </div>
            <div className="bc-recipients-list">
              {recipientsList.map(u => (
                <div key={u.user_id} className="bc-recipient-row">
                  <span className="bc-recipient-name">{u.full_name || '—'}</span>
                  {u.username && <span className="bc-recipient-username">@{u.username}</span>}
                  <span className="bc-recipient-id">{u.user_id}</span>
                </div>
              ))}
              {recipientsList.length === 0 && <div className="bc-recipients-empty">Нет получателей</div>}
            </div>
          </div>
        )}
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

  // Group tags (reuses same channel_tags table)
  const [allGroupTags, setAllGroupTags] = useState([]);
  const [filterGroupTag, setFilterGroupTag] = useState('');
  const [groupTagsMap, setGroupTagsMap] = useState({});
  const [showGrTagDD, setShowGrTagDD] = useState(false);
  const [grTagSearch, setGrTagSearch] = useState('');
  const grTagRef = useRef(null);

  const loadAllGroupTags = useCallback(() => {
    api.get('/api/broadcasts/channel-tags').then(r => r.json()).then(setAllGroupTags).catch(() => {});
  }, []);

  const loadGroupTagsMap = useCallback(async (grList) => {
    const map = {};
    await Promise.all(grList.map(async (g) => {
      try {
        const res = await api.get(`/api/broadcasts/channels/${encodeURIComponent(g.chatId)}/tags`);
        map[g.chatId] = await res.json();
      } catch { map[g.chatId] = []; }
    }));
    setGroupTagsMap(map);
  }, []);

  const loadGroups = useCallback(() => {
    api.get('/api/broadcasts/groups').then(r => r.json()).then(data => {
      setGroups(data);
      loadGroupTagsMap(data);
    }).catch(() => {});
  }, [loadGroupTagsMap]);

  const loadArchive = useCallback(() => {
    api.get('/api/broadcasts/groups/archive').then(r => r.json()).then(setArchived).catch(() => {});
  }, []);

  useEffect(() => { loadGroups(); loadAllGroupTags(); }, [loadGroups, loadAllGroupTags]);

  useEffect(() => {
    const handler = (e) => { if (grTagRef.current && !grTagRef.current.contains(e.target)) setShowGrTagDD(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleTagsChange = () => {
    loadAllGroupTags();
    loadGroups();
  };

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

  const filteredGroups = filterGroupTag
    ? groups.filter(g => (groupTagsMap[g.chatId] || []).includes(filterGroupTag))
    : groups;

  const toggleGroup = (chatId) => {
    setSelectedGroups(prev =>
      prev.includes(chatId) ? prev.filter(c => c !== chatId) : [...prev, chatId]
    );
  };

  const selectAll = () => {
    setSelectedGroups(prev =>
      prev.length === filteredGroups.length ? [] : filteredGroups.map(g => g.chatId)
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
            {allGroupTags.length > 0 && (
              <div className="bc-tag-filter" ref={grTagRef}>
                <button className="bc-tag-filter-btn bc-tag-filter-btn--small" onClick={() => setShowGrTagDD(!showGrTagDD)}>
                  <Filter size={13} />
                  <span>{filterGroupTag || 'Все теги'}</span>
                  <ChevronDown size={13} className={`bc-tag-chevron ${showGrTagDD ? 'open' : ''}`} />
                </button>
                {showGrTagDD && (
                  <div className="bc-tag-dropdown">
                    {allGroupTags.length > 5 && (
                      <div className="bc-tag-search-wrap">
                        <Search size={12} className="bc-tag-search-icon" />
                        <input
                          className="bc-tag-search-input"
                          type="text"
                          placeholder="Поиск..."
                          value={grTagSearch}
                          onChange={e => setGrTagSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                    )}
                    <div className="bc-tag-options-list">
                      <div className={`bc-tag-option ${!filterGroupTag ? 'active' : ''}`} onClick={() => { setFilterGroupTag(''); setShowGrTagDD(false); setGrTagSearch(''); }}>
                        Все теги
                      </div>
                      {allGroupTags
                        .filter(t => !grTagSearch.trim() || t.toLowerCase().includes(grTagSearch.trim().toLowerCase()))
                        .map(t => (
                          <div key={t} className={`bc-tag-option ${filterGroupTag === t ? 'active' : ''}`} onClick={() => { setFilterGroupTag(t); setShowGrTagDD(false); setGrTagSearch(''); }}>
                            {t}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
              <input type="checkbox" checked={selectedGroups.length === filteredGroups.length && filteredGroups.length > 0} onChange={selectAll} />
              <span>{filterGroupTag ? `Группы с тегом «${filterGroupTag}» (${filteredGroups.length})` : `Все группы (${groups.length})`}</span>
            </label>
            {filteredGroups.map(g => (
              <div key={g.id} className="bc-list-item bc-list-item--with-tags">
                <label className="bc-list-item-main">
                  <input type="checkbox" checked={selectedGroups.includes(g.chatId)} onChange={() => toggleGroup(g.chatId)} />
                  <MessageCircle size={14} className="bc-list-icon" />
                  <span className="bc-list-title">{g.title}</span>
                  <span className="bc-list-id">{g.chatId}</span>
                </label>
                <ChannelTagsEditor chatId={g.chatId} allChannelTags={allGroupTags} onTagsChange={handleTagsChange} />
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
function LoadMoreTrigger({ onVisible }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onVisible(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);
  return <div ref={ref} style={{ height: 1 }} />;
}

export default function Broadcasts() {
  const [openSection, setOpenSection] = useState('channels');
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState(null);
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
                    <span dangerouslySetInnerHTML={{ __html: (b.media ? `[${b.media.originalName}] ` : '') + renderTgHtml(b.text || '') }} />
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
                      {b.total > 0 && (
                        <button className="bc-delivery-btn" onClick={(e) => { e.stopPropagation(); setDeliveryModal(b); }} title="Показать получателей">
                          {b.success}/{b.total}
                        </button>
                      )}
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

        {hasMore && <LoadMoreTrigger onVisible={() => setVisibleCount(prev => prev + 20)} />}
      </div>

      {deleteModal && (
        <PromptModal
          title="Удалить запись из истории?"
          isConfirm
          onConfirm={handleDeleteBroadcast}
          onCancel={() => setDeleteModal(null)}
        />
      )}

      {deliveryModal && (
        <div className="bc-delivery-overlay" onClick={() => setDeliveryModal(null)}>
          <div className="bc-delivery-modal" onClick={e => e.stopPropagation()}>
            <div className="bc-delivery-modal-header">
              <h3>Получатели рассылки</h3>
              <button className="bc-delivery-close" onClick={() => setDeliveryModal(null)}><X size={18} /></button>
            </div>
            <div className="bc-delivery-summary">
              <span className="bc-delivery-ok"><CheckCircle size={14} /> Доставлено: {deliveryModal.success}</span>
              <span className="bc-delivery-fail"><XCircle size={14} /> Ошибки: {deliveryModal.failed}</span>
            </div>
            <div className="bc-delivery-list">
              {(deliveryModal.results || []).map((r, i) => (
                <div key={i} className={`bc-delivery-item ${r.ok ? 'bc-delivery-item--ok' : 'bc-delivery-item--fail'}`}>
                  <span className="bc-delivery-icon">{r.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}</span>
                  <span className="bc-delivery-user-name">{r.name || r.chatId}</span>
                  {r.username && <span className="bc-delivery-username">@{r.username}</span>}
                  {!r.name && <span className="bc-delivery-user-id">{r.chatId}</span>}
                  {r.error && <span className="bc-delivery-error">{r.error}</span>}
                </div>
              ))}
              {(!deliveryModal.results || deliveryModal.results.length === 0) && (
                <div className="bc-delivery-empty">Нет детальных данных</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
