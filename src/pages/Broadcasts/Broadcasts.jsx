import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Send, Trash2, Search, Hash, AlertCircle, CheckCircle, XCircle,
  Loader, Users, MessageCircle, Filter, Paperclip, X, Image, FileText, Film,
  BarChart2, HelpCircle, Check, Archive, RotateCcw, ChevronDown, ChevronRight, Tag, Eye,
  Save, Clock, Calendar, Play, Edit3, FileBox, MoreVertical, Pencil
} from 'lucide-react';
import { api } from '../../utils/api.js';
import { sanitizeHtml } from '../../utils/sanitize.js';
import { validateBroadcastContent, tgVisibleLength, TG_LIMITS } from '../../shared/telegramLimits.js';
import PromptModal from '../KnowledgeBase/PromptModal';
import TgHtmlEditor from '../../components/TgHtmlEditor/TgHtmlEditor';
import IosDatePicker from '../../components/UI/IosDatePicker';
import Raffle from '../Raffle/Raffle.jsx';
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
  partial: 'Доставлена', // legacy 'partial' теперь показываем как «Доставлена»
  failed: 'Ошибка',
  scheduled: 'Отложена',
  queued: 'В процессе',  // рассылка в очереди / отправляется прямо сейчас
};

// Нормализация статуса для отображения: partial и published — одно и то же,
// показываем «Доставлена» если хоть кому-то ушло. failed — только когда никому.
function displayStatus(s) {
  return s === 'partial' ? 'published' : s;
}

const SECTIONS = [
  { id: 'channels', label: 'Каналы', icon: Hash },
  { id: 'users', label: 'Пользователи', icon: Users },
  { id: 'groups', label: 'Группы', icon: MessageCircle },
  { id: 'drafts', label: 'Черновики', icon: FileBox },
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

/* ═══ iOS-style Time Picker ═══ */
function IosTimePicker({ value, onChange, minTime = null }) {
  const [hours, minutes] = (value || '12:00').split(':').map(Number);
  const hoursRef = useRef(null);
  const minsRef = useRef(null);

  const ITEM_H = 36;
  const VISIBLE = 5;

  const minH = minTime ? parseInt(minTime.split(':')[0], 10) : null;
  const minM = minTime ? parseInt(minTime.split(':')[1], 10) : null;

  const scrollToValue = (ref, val) => {
    if (ref.current) {
      ref.current.scrollTop = val * ITEM_H;
    }
  };

  const isHourDisabled = (h) => minH != null && h < minH;
  const isMinDisabled = (m) => minH != null && hours === minH && minM != null && m < minM;

  const clampTime = (h, m) => {
    if (minH != null) {
      if (h < minH) { h = minH; m = minM || 0; }
      else if (h === minH && minM != null && m < minM) { m = minM; }
    }
    return [h, m];
  };

  // Build filtered item lists for scroll offset calculation
  const hourItems = [];
  for (let i = 0; i < 24; i++) { if (!isHourDisabled(i)) hourItems.push(i); }
  const minItems = [];
  for (let i = 0; i < 60; i++) { if (!isMinDisabled(i)) minItems.push(i); }

  useEffect(() => {
    const hIdx = hourItems.indexOf(hours);
    const mIdx = minItems.indexOf(minutes);
    scrollToValue(hoursRef, hIdx >= 0 ? hIdx : 0);
    scrollToValue(minsRef, mIdx >= 0 ? mIdx : 0);
  }, []); // eslint-disable-line

  const renderColumn = (ref, count, val, isHours) => {
    const items = [];
    for (let i = 0; i < count; i++) {
      const disabled = isHours ? isHourDisabled(i) : isMinDisabled(i);
      if (!disabled) items.push(i);
    }
    const activeIdx = items.indexOf(val);
    return (
      <div className="ios-tp-col" ref={ref}
        onScroll={() => {
          const idx = Math.round(ref.current.scrollTop / ITEM_H);
          const clamped = Math.max(0, Math.min(items.length - 1, idx));
          const realVal = items[clamped];
          let h = isHours ? realVal : hours;
          let m = isHours ? minutes : realVal;
          [h, m] = clampTime(h, m);
          onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }}
        style={{ height: ITEM_H * VISIBLE }}
      >
        <div style={{ height: ITEM_H * 2 }} />
        {items.map((realI, idx) => (
          <div key={realI}
            className={`ios-tp-item ${realI === val ? 'ios-tp-item--active' : ''}`}
            style={{ height: ITEM_H }}
            onClick={() => scrollToValue(ref, idx)}
          >
            {String(realI).padStart(2, '0')}
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    );
  };

  return (
    <div className="ios-tp">
      <div className="ios-tp-highlight" style={{ height: ITEM_H, top: ITEM_H * 2 }} />
      {renderColumn(hoursRef, 24, hours, true)}
      <span className="ios-tp-sep">:</span>
      {renderColumn(minsRef, 60, minutes, false)}
    </div>
  );
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
      const res = await fetch('/api/broadcasts/upload', {
        method: 'POST',
        credentials: 'same-origin',
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
function ComposeBlock({ title, hintText, canSend, sending, sendResult, onSend, onSaveDraft, savingDraft, targetType, getTargetFilter, initialDraft }) {
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [media, setMedia] = useState(null);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);

  // Poll state
  const [question, setQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Quiz state
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptions, setQuizOptions] = useState(['', '']);
  const [correctIndex, setCorrectIndex] = useState(0);

  // Load initial draft data when editing
  useEffect(() => {
    if (initialDraft) {
      if (initialDraft.poll) {
        if (initialDraft.poll.type === 'quiz') {
          setMode('quiz');
          setQuizQuestion(initialDraft.poll.question || '');
          setQuizOptions(initialDraft.poll.options?.length ? initialDraft.poll.options : ['', '']);
          setCorrectIndex(initialDraft.poll.correctIndex || 0);
        } else {
          setMode('poll');
          setQuestion(initialDraft.poll.question || '');
          setPollOptions(initialDraft.poll.options?.length ? initialDraft.poll.options : ['', '']);
        }
      } else {
        setMode('text');
        setText(initialDraft.text || '');
        setMedia(initialDraft.media || null);
      }
      // Restore schedule state if draft was scheduled
      if (initialDraft.scheduledAt && initialDraft.scheduleStatus === 'pending') {
        setScheduleMode(true);
        // Convert to local datetime for inputs (YYYY-MM-DDTHH:MM)
        const d = new Date(initialDraft.scheduledAt);
        const local = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        setScheduledAt(local);
      } else {
        setScheduleMode(false);
        setScheduledAt('');
      }
    }
  }, [initialDraft]);

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

  // Проверка лимитов Telegram (длина текста/подписи/опроса). Один и тот же
  // валидатор, что и на бэкенде — фронт лишь подсвечивает и блокирует заранее.
  const contentCheck = mode === 'text'
    ? validateBroadcastContent({ text, media })
    : mode === 'poll'
      ? validateBroadcastContent({ poll: { question, options: pollOptions } })
      : validateBroadcastContent({ poll: { question: quizQuestion, options: quizOptions } });
  const textLimit = media ? TG_LIMITS.CAPTION : TG_LIMITS.TEXT;
  const textLen = tgVisibleLength(text);

  const getComposeBody = () => {
    if (mode === 'text') {
      const body = {};
      if (text.trim()) body.text = text.trim();
      if (media) body.media = { filename: media.filename, url: media.url, originalName: media.originalName, mimeType: media.mimeType };
      return body;
    } else if (mode === 'poll') {
      const opts = pollOptions.filter(o => o.trim());
      return { poll: { question: question.trim(), options: opts, type: 'regular' } };
    } else if (mode === 'quiz') {
      const opts = quizOptions.filter(o => o.trim());
      return { poll: { question: quizQuestion.trim(), options: opts, type: 'quiz', correctIndex } };
    }
    return null;
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
          <div className="bc-charcount" style={{ fontSize: 12, marginTop: 4, textAlign: 'right', color: textLen > textLimit ? '#e5484d' : 'var(--text-secondary, #8a8a8a)' }}>
            {textLen} / {textLimit}{media ? ' (подпись к медиа)' : ''}
          </div>
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

      {/* Schedule toggle */}
      <div className="bc-schedule-toggle">
        <button
          className={`bc-schedule-btn ${!scheduleMode ? 'bc-schedule-btn--active' : ''}`}
          onClick={() => { setScheduleMode(false); setShowScheduleModal(false); setScheduledAt(null); }}
        >
          <Send size={13} /> Отправить сейчас
        </button>
        <button
          className={`bc-schedule-btn ${scheduleMode ? 'bc-schedule-btn--active' : ''}`}
          onClick={() => { setScheduleMode(true); setShowScheduleModal(true); }}
        >
          <Clock size={13} /> {scheduledAt ? `${scheduledAt.slice(8,10)}.${scheduledAt.slice(5,7)} в ${scheduledAt.slice(11,16)}` : 'Запланировать'}
        </button>
      </div>

      {showScheduleModal && (() => {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const selDate = scheduledAt ? scheduledAt.slice(0, 10) : todayStr;
        const selTime = scheduledAt ? scheduledAt.slice(11, 16) : '12:00';
        const isToday = selDate === todayStr;
        let minTimeStr = null;
        if (isToday) {
          const min = new Date(now.getTime() + 2 * 60 * 1000);
          minTimeStr = `${String(min.getHours()).padStart(2, '0')}:${String(min.getMinutes()).padStart(2, '0')}`;
        }
        return (
          <div className="bc-schedule-overlay" onClick={() => setShowScheduleModal(false)}>
            <div className="bc-schedule-modal" onClick={e => e.stopPropagation()}>
              <div className="bc-schedule-modal-header">
                <span>Запланировать отправку</span>
                <button className="bc-schedule-modal-close" onClick={() => setShowScheduleModal(false)}><X size={16} /></button>
              </div>
              <div className="bc-schedule-modal-body">
                <div className="bc-schedule-section">
                  <div className="bc-schedule-section-label">Дата</div>
                  <IosDatePicker
                    value={selDate}
                    minDate={todayStr}
                    onChange={(date) => {
                      const time = scheduledAt ? scheduledAt.slice(11, 16) : '12:00';
                      setScheduledAt(date + 'T' + time);
                    }}
                  />
                </div>
                <div className="bc-schedule-section">
                  <div className="bc-schedule-section-label">Время</div>
                  <IosTimePicker
                    value={selTime}
                    minTime={minTimeStr}
                    onChange={(time) => {
                      const date = scheduledAt ? scheduledAt.slice(0, 10) : todayStr;
                      setScheduledAt(date + 'T' + time);
                    }}
                  />
                </div>
              </div>
              <div className="bc-schedule-modal-footer">
                <span className="bc-schedule-modal-preview">
                  {selDate.split('-').reverse().join('.')} в {selTime}
                </span>
                <button className="bc-schedule-modal-ok" onClick={() => setShowScheduleModal(false)}>Готово</button>
              </div>
            </div>
          </div>
        );
      })()}

      {!contentCheck.ok && (
        <div className="bc-send-result bc-send-result--error" style={{ marginTop: 8 }}>
          <AlertCircle size={16} /> {contentCheck.error}
        </div>
      )}

      <div className="bc-compose-footer">
        <span className="bc-compose-hint">{hintText}</span>
        <div className="bc-compose-actions">
          {onSaveDraft && (
            <button
              className="bc-draft-save-btn"
              disabled={savingDraft || !isValid()}
              onClick={() => {
                const body = getComposeBody();
                if (body) onSaveDraft(body);
              }}
            >
              {savingDraft ? <Loader size={14} className="spin" /> : <Save size={14} />}
              {savingDraft ? 'Сохранение...' : 'Сохранить черновик'}
            </button>
          )}
          {scheduleMode ? (
            <button
              className="broadcasts-create-btn bc-schedule-send-btn"
              disabled={sending || !(canSend && isValid()) || !scheduledAt || !contentCheck.ok}
              onClick={() => {
                // Auto-correct: if scheduled time < now+2min, bump it
                let finalSchedule = scheduledAt;
                const minAllowed = new Date(Date.now() + 2 * 60 * 1000);
                if (new Date(scheduledAt) < minAllowed) {
                  const y = minAllowed.getFullYear();
                  const mo = String(minAllowed.getMonth() + 1).padStart(2, '0');
                  const d = String(minAllowed.getDate()).padStart(2, '0');
                  const h = String(minAllowed.getHours()).padStart(2, '0');
                  const mi = String(minAllowed.getMinutes()).padStart(2, '0');
                  finalSchedule = `${y}-${mo}-${d}T${h}:${mi}`;
                  setScheduledAt(finalSchedule);
                }
                const body = getComposeBody();
                if (body && onSaveDraft) {
                  onSaveDraft({ ...body, _schedule: true, _scheduledAt: finalSchedule }, () => {
                    setText(''); setMedia(null); setQuestion(''); setPollOptions(['', '']); setQuizQuestion(''); setQuizOptions(['', '']); setCorrectIndex(0); setScheduleMode(false); setScheduledAt('');
                  });
                }
              }}
            >
              <Clock size={16} /> Запланировать
            </button>
          ) : (
            <button className="broadcasts-create-btn" disabled={sending || !(canSend && isValid()) || !contentCheck.ok} onClick={() => setConfirmSend(true)}>
              {sending ? <Loader size={16} className="spin" /> : <Send size={16} />}
              {sending ? 'Отправка...' : 'Отправить'}
            </button>
          )}
        </div>
      </div>
      {sendResult && (
        <div className={`bc-send-result ${sendResult.error ? 'bc-send-result--error' : sendResult._queued ? 'bc-send-result--queued' : 'bc-send-result--ok'}`}>
          {sendResult.error ? (
            <><AlertCircle size={16} /> {sendResult.error}</>
          ) : sendResult._queued ? (
            <><Clock size={16} /> Идёт рассылка: доставлено {sendResult.success ?? 0} из {sendResult.total ?? '—'}{sendResult._retrying > 0 ? `, в очереди ${sendResult._retrying}` : ''}…</>
          ) : (
            <><CheckCircle size={16} /> Доставлено: {sendResult.success} из {sendResult.total}</>
          )}
        </div>
      )}

      {confirmSend && (
        <div className="bc-confirm-overlay" onClick={() => setConfirmSend(false)}>
          <div className="bc-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="bc-confirm-modal-title">Подтверждение</div>
            <div className="bc-confirm-modal-text">Отправить рассылку сейчас?</div>
            <div className="bc-confirm-modal-actions">
              <button className="bc-confirm-modal-cancel" onClick={() => setConfirmSend(false)}>Отмена</button>
              <button className="bc-confirm-modal-ok" onClick={() => { setConfirmSend(false); handleSend(); }}>Отправить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ Вкладка «Каналы» ═══ */
function CommentEditor({ chatId, entityType = 'channels' }) {
  const [comment, setComment] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/broadcasts/${entityType}/${encodeURIComponent(chatId)}/comment`)
      .then(r => r.json())
      .then(data => { setComment(data.comment || ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, [chatId, entityType]);

  const save = async () => {
    try {
      await api.put(`/api/broadcasts/${entityType}/${encodeURIComponent(chatId)}/comment`, { comment: draft });
      setComment(draft);
      setEditing(false);
    } catch { /* ignore */ }
  };

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(comment);
    setEditing(true);
  };

  if (loading) return null;

  if (editing) {
    return (
      <div className="bc-comment-edit" onClick={e => e.stopPropagation()}>
        <input
          className="bc-comment-input"
          type="text"
          value={draft}
          autoFocus
          placeholder="Комментарий..."
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <button className="bc-comment-save" onClick={save} title="Сохранить">✓</button>
        <button className="bc-comment-cancel" onClick={() => setEditing(false)} title="Отмена"><X size={12} /></button>
      </div>
    );
  }

  return (
    <div className="bc-comment-view" onClick={startEdit} title={comment ? 'Изменить комментарий' : 'Добавить комментарий'}>
      {comment
        ? <span className="bc-comment-text">{comment}</span>
        : <span className="bc-comment-placeholder">+ комментарий</span>}
    </div>
  );
}

function ChannelTagsEditor({ chatId, allChannelTags, onTagsChange, entityType = 'channels' }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDD, setShowDD] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const ddRef = useRef(null);

  useEffect(() => {
    api.get(`/api/broadcasts/${entityType}/${encodeURIComponent(chatId)}/tags`)
      .then(r => r.json())
      .then(data => { setTags(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [chatId, entityType]);

  useEffect(() => {
    const handler = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setShowDD(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const saveTags = async (newTags) => {
    setTags(newTags);
    try {
      await api.put(`/api/broadcasts/${entityType}/${encodeURIComponent(chatId)}/tags`, { tags: newTags });
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

function ItemActionsMenu({ chatId, entityType, allTags, onTagsChange, onArchive, folders, currentFolderId, onAssignFolder }) {
  const [open, setOpen] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // 'comment' | 'tags' | 'folder'
  const menuRef = useRef(null);

  // Comment state
  const [comment, setComment] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [commentLoading, setCommentLoading] = useState(true);

  // Tags state
  const [tags, setTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagSearch, setTagSearch] = useState('');

  // ⚠️ Comment + tags load LAZILY — only when the menu is opened, once.
  // Fetching on mount fired 2 requests per row × hundreds of groups on page
  // load, blowing past the API rate limit (429) and breaking the session.
  // A closed menu now makes zero per-row requests. Both values are used only
  // inside the open dropdown, so nothing is shown before the first open.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    api.get(`/api/broadcasts/${entityType}/${encodeURIComponent(chatId)}/comment`)
      .then(r => r.json())
      .then(data => { setComment(data.comment || ''); setCommentLoading(false); })
      .catch(() => setCommentLoading(false));
    api.get(`/api/broadcasts/${entityType}/${encodeURIComponent(chatId)}/tags`)
      .then(r => r.json())
      .then(data => { setTags(data); setTagsLoading(false); })
      .catch(() => setTagsLoading(false));
  }, [open, loaded, chatId, entityType]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) { setOpen(false); setActivePanel(null); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const saveComment = async () => {
    try {
      await api.put(`/api/broadcasts/${entityType}/${encodeURIComponent(chatId)}/comment`, { comment: commentDraft });
      setComment(commentDraft);
      setActivePanel(null);
    } catch { /* ignore */ }
  };

  const saveTags = async (newTags) => {
    setTags(newTags);
    try {
      await api.put(`/api/broadcasts/${entityType}/${encodeURIComponent(chatId)}/tags`, { tags: newTags });
      onTagsChange?.();
    } catch { /* ignore */ }
  };

  const toggleTag = (tag) => saveTags(tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]);
  const addNewTag = () => { const t = tagSearch.trim(); if (t && !tags.includes(t)) saveTags([...tags, t]); setTagSearch(''); };

  const filteredSuggestions = (allTags || []).filter(t => !tags.includes(t)).filter(t => !tagSearch.trim() || t.toLowerCase().includes(tagSearch.trim().toLowerCase()));

  return (
    <div className="bc-item-menu" ref={menuRef}>
      <button className="bc-item-menu-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open); setActivePanel(null); }} title="Действия">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="bc-item-menu-dropdown" onClick={e => e.stopPropagation()}>
          {!activePanel && (
            <>
              <button className="bc-item-menu-option" onClick={() => { setCommentDraft(comment); setActivePanel('comment'); }}>
                <Edit3 size={13} /> {comment ? 'Комментарий' : 'Добавить комментарий'}
                {comment && <span className="bc-item-menu-hint">{comment.length > 20 ? comment.slice(0, 20) + '…' : comment}</span>}
              </button>
              <button className="bc-item-menu-option" onClick={() => { setTagSearch(''); setActivePanel('tags'); }}>
                <Tag size={13} /> Теги
                {tags.length > 0 && <span className="bc-item-menu-hint">{tags.length}</span>}
              </button>
              {folders && folders.length > 0 && (
                <button className="bc-item-menu-option" onClick={() => setActivePanel('folder')}>
                  <Filter size={13} /> Папка
                  {currentFolderId && <span className="bc-item-menu-hint">{folders.find(f => f.id === currentFolderId)?.name || ''}</span>}
                </button>
              )}
              <button className="bc-item-menu-option bc-item-menu-option--archive" onClick={() => { setOpen(false); onArchive(); }}>
                <Archive size={13} /> В архив
              </button>
            </>
          )}
          {activePanel === 'folder' && (
            <div className="bc-item-menu-panel">
              <div className="bc-item-menu-panel-header">
                <button className="bc-item-menu-back" onClick={() => setActivePanel(null)}>←</button>
                <span>Папка</span>
              </div>
              <div className="bc-item-menu-folder-list">
                <button className={`bc-item-menu-folder-option${!currentFolderId ? ' active' : ''}`} onClick={() => { onAssignFolder?.(chatId, null); setOpen(false); setActivePanel(null); }}>
                  — Без папки
                </button>
                {folders.map(f => (
                  <button key={f.id} className={`bc-item-menu-folder-option${currentFolderId === f.id ? ' active' : ''}`} onClick={() => { onAssignFolder?.(chatId, f.id); setOpen(false); setActivePanel(null); }}>
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {activePanel === 'comment' && (
            <div className="bc-item-menu-panel">
              <div className="bc-item-menu-panel-header">
                <button className="bc-item-menu-back" onClick={() => setActivePanel(null)}>
                  <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <span>Комментарий</span>
              </div>
              <input
                className="bc-item-menu-input"
                type="text"
                placeholder="Комментарий..."
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveComment(); }}
                autoFocus
              />
              <button className="bc-item-menu-save" onClick={saveComment}>Сохранить</button>
            </div>
          )}
          {activePanel === 'tags' && (
            <div className="bc-item-menu-panel">
              <div className="bc-item-menu-panel-header">
                <button className="bc-item-menu-back" onClick={() => setActivePanel(null)}>
                  <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <span>Теги</span>
              </div>
              {tags.length > 0 && (
                <div className="bc-item-menu-tags-list">
                  {tags.map(t => (
                    <span key={t} className="bc-ch-tag-chip">
                      {t}
                      <button className="bc-chip-remove" onClick={() => saveTags(tags.filter(x => x !== t))}><X size={10} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="bc-tag-search-wrap">
                <Search size={12} className="bc-tag-search-icon" />
                <input
                  className="bc-tag-search-input"
                  type="text"
                  placeholder="Поиск или новый тег..."
                  value={tagSearch}
                  onChange={e => setTagSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addNewTag(); }}
                  autoFocus
                />
              </div>
              <div className="bc-tag-options-list">
                {filteredSuggestions.map(t => (
                  <div key={t} className="bc-tag-option" onClick={() => toggleTag(t)}>{t}</div>
                ))}
                {tagSearch.trim() && !(allTags || []).includes(tagSearch.trim()) && !tags.includes(tagSearch.trim()) && (
                  <div className="bc-tag-option bc-tag-option--create" onClick={addNewTag}>
                    <Plus size={12} /> Создать «{tagSearch.trim()}»
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChannelsTab({ onSendResult, onSaveDraft, savingDraft, initialDraft }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState([]);

  // Rename
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const handleRenameChannel = async (id) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    try {
      await api.put(`/api/broadcasts/channels/${id}/rename`, { title: renameValue.trim() });
      setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, title: renameValue.trim() } : ch));
    } catch {}
    setRenamingId(null);
  };

  // Folders
  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [folderMap, setFolderMap] = useState({});
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState('');

  const loadFolders = useCallback(() => {
    api.get('/api/broadcast-folders?type=channels').then(r => r.json()).then(setFolders).catch(() => {});
    api.get('/api/broadcast-folders/map?type=channels').then(r => r.json()).then(setFolderMap).catch(() => {});
  }, []);
  useEffect(() => { loadFolders(); }, [loadFolders]);

  const createFolder = async () => {
    const res = await api.post('/api/broadcast-folders', { name: 'Новая папка', type: 'channels' });
    if (res.ok) loadFolders();
  };
  const renameFolder = async (id, name) => {
    if (!name.trim()) return;
    await api.put(`/api/broadcast-folders/${id}`, { name: name.trim() });
    setEditingFolderId(null);
    loadFolders();
  };
  const deleteFolder = async (id) => {
    await api.delete(`/api/broadcast-folders/${id}`);
    if (activeFolderId === id) setActiveFolderId(null);
    loadFolders();
  };
  const assignFolder = async (chatId, folderId) => {
    await api.put('/api/broadcast-folders/assign', { chatId, entityType: 'channels', folderId });
    loadFolders();
  };

  // Channel tags
  const [allChannelTags, setAllChannelTags] = useState([]);
  const [filterChannelTags, setFilterChannelTags] = useState([]);
  const [excludeChannelTags, setExcludeChannelTags] = useState([]);
  const [channelTagsMap, setChannelTagsMap] = useState({});
  const [showChTagDD, setShowChTagDD] = useState(false);
  const [showChExcludeDD, setShowChExcludeDD] = useState(false);
  const [chTagSearch, setChTagSearch] = useState('');
  const [chExcludeSearch, setChExcludeSearch] = useState('');
  const [chListSearch, setChListSearch] = useState('');
  const chTagRef = useRef(null);
  const chExcludeRef = useRef(null);

  const loadAllChannelTags = useCallback(() => {
    api.get('/api/broadcasts/channel-tags').then(r => r.json()).then(setAllChannelTags).catch(() => {});
  }, []);

  // Загружаем каналы вместе с тегами одним запросом через /channels/full.
  // Раньше был N+1: 1 запрос за списком + N запросов за тегами каждого
  // канала. При плохой сети (ТСПУ) это ломалось каскадом. Теперь — 1 запрос.
  const loadChannels = useCallback(() => {
    api.get('/api/broadcasts/channels/full').then(r => r.json()).then(data => {
      setChannels(data);
      const map = {};
      for (const ch of data) map[ch.chatId] = ch.tags || [];
      setChannelTagsMap(map);
    }).catch(() => {});
  }, []);

  const loadArchive = useCallback(() => {
    api.get('/api/broadcasts/channels/archive').then(r => r.json()).then(setArchived).catch(() => {});
  }, []);

  useEffect(() => { loadChannels(); loadAllChannelTags(); }, [loadChannels, loadAllChannelTags]);

  useEffect(() => {
    const handler = (e) => {
      if (chTagRef.current && !chTagRef.current.contains(e.target)) setShowChTagDD(false);
      if (chExcludeRef.current && !chExcludeRef.current.contains(e.target)) setShowChExcludeDD(false);
    };
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
    const res = await api.delete(`/api/broadcasts/channels/${id}`);
    if (!res.ok) throw new Error(`Ошибка ${res.status}`);
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  const toggleChFilterTag = (tag) => {
    setFilterChannelTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    setExcludeChannelTags(prev => prev.filter(t => t !== tag));
  };

  const toggleChExcludeTag = (tag) => {
    setExcludeChannelTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    setFilterChannelTags(prev => prev.filter(t => t !== tag));
  };

  const filteredChannels = channels.filter(ch => {
    if (activeFolderId !== null && (folderMap[ch.chatId] || null) !== activeFolderId) return false;
    if (filterChannelTags.length > 0 && !(channelTagsMap[ch.chatId] || []).some(t => filterChannelTags.includes(t))) return false;
    if (excludeChannelTags.length > 0 && (channelTagsMap[ch.chatId] || []).some(t => excludeChannelTags.includes(t))) return false;
    if (chListSearch.trim()) {
      const q = chListSearch.trim().toLowerCase();
      const titleMatch = ch.title?.toLowerCase().includes(q);
      const tagMatch = (channelTagsMap[ch.chatId] || []).some(t => t.toLowerCase().includes(q));
      if (!titleMatch && !tagMatch) return false;
    }
    return true;
  });

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
      let data = null;
      try { data = await res.json(); } catch { /* non-JSON (proxy timeout HTML) */ }
      if (!res.ok) {
        setSendResult({ error: data?.error || 'Сервер не ответил. Проверьте «Историю» — рассылка могла пройти в фоне.' });
      } else if (!data) {
        setSendResult({ error: 'Ответ задержался. Проверьте «Историю» — рассылка скорее всего прошла.' });
        resetCompose();
        setSelectedChannels([]);
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
              <>
                <div className="bc-tag-filter" ref={chTagRef}>
                  <button className="bc-tag-filter-btn bc-tag-filter-btn--small" onClick={() => setShowChTagDD(!showChTagDD)}>
                    <Tag size={13} />
                    <span>{filterChannelTags.length === 0 ? 'Все теги' : `Тегов: ${filterChannelTags.length}`}</span>
                    <ChevronDown size={13} className={`bc-tag-chevron ${showChTagDD ? 'open' : ''}`} />
                  </button>
                  {showChTagDD && (
                    <div className="bc-tag-dropdown">
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
                      <div className="bc-tag-options-list">
                        <div className={`bc-tag-option ${filterChannelTags.length === 0 ? 'active' : ''}`} onClick={() => { setFilterChannelTags([]); setChTagSearch(''); }}>
                          Все теги
                        </div>
                        {allChannelTags
                          .filter(t => !chTagSearch.trim() || t.toLowerCase().includes(chTagSearch.trim().toLowerCase()))
                          .map(t => (
                            <label key={t} className={`bc-tag-option bc-tag-option--checkbox ${filterChannelTags.includes(t) ? 'active' : ''} ${excludeChannelTags.includes(t) ? 'bc-tag-option--disabled' : ''}`} onClick={(e) => { e.preventDefault(); if (!excludeChannelTags.includes(t)) toggleChFilterTag(t); }}>
                              <input type="checkbox" checked={filterChannelTags.includes(t)} readOnly className="bc-tag-checkbox" />
                              <span>{t}{excludeChannelTags.includes(t) ? ' (исключён)' : ''}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="bc-tag-filter bc-tag-filter--exclude" ref={chExcludeRef}>
                  <button className="bc-tag-filter-btn bc-tag-filter-btn--small bc-tag-filter-btn--exclude" onClick={() => setShowChExcludeDD(!showChExcludeDD)}>
                    <X size={13} />
                    <span>{excludeChannelTags.length === 0 ? 'Исключить' : `Исключено: ${excludeChannelTags.length}`}</span>
                    <ChevronDown size={13} className={`bc-tag-chevron ${showChExcludeDD ? 'open' : ''}`} />
                  </button>
                  {showChExcludeDD && (
                    <div className="bc-tag-dropdown">
                      <div className="bc-tag-search-wrap">
                        <Search size={12} className="bc-tag-search-icon" />
                        <input
                          className="bc-tag-search-input"
                          type="text"
                          placeholder="Поиск..."
                          value={chExcludeSearch}
                          onChange={e => setChExcludeSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="bc-tag-options-list">
                        <div className={`bc-tag-option ${excludeChannelTags.length === 0 ? 'active' : ''}`} onClick={() => { setExcludeChannelTags([]); setChExcludeSearch(''); }}>
                          Сбросить
                        </div>
                        {allChannelTags
                          .filter(t => !chExcludeSearch.trim() || t.toLowerCase().includes(chExcludeSearch.trim().toLowerCase()))
                          .map(t => (
                            <label key={t} className={`bc-tag-option bc-tag-option--checkbox ${excludeChannelTags.includes(t) ? 'active' : ''} ${filterChannelTags.includes(t) ? 'bc-tag-option--disabled' : ''}`} onClick={(e) => { e.preventDefault(); if (!filterChannelTags.includes(t)) toggleChExcludeTag(t); }}>
                              <input type="checkbox" checked={excludeChannelTags.includes(t)} readOnly className="bc-tag-checkbox" />
                              <span>{t}{filterChannelTags.includes(t) ? ' (включён)' : ''}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            <button className="bc-archive-toggle" onClick={() => { setShowArchive(!showArchive); if (!showArchive) loadArchive(); }}>
              <Archive size={14} /> {showArchive ? 'Скрыть архив' : 'Архив'}
              {archived.length > 0 && !showArchive && <span className="bc-archive-count">{archived.length}</span>}
            </button>
          </div>
        </div>

        {(filterChannelTags.length > 0 || excludeChannelTags.length > 0) && (
          <div className="bc-selected-tags">
            {filterChannelTags.map(t => (
              <span key={`inc-${t}`} className="bc-selected-tag-chip">
                {t}
                <button className="bc-chip-remove" onClick={() => setFilterChannelTags(prev => prev.filter(x => x !== t))}><X size={11} /></button>
              </span>
            ))}
            {excludeChannelTags.map(t => (
              <span key={`exc-${t}`} className="bc-selected-tag-chip bc-selected-tag-chip--exclude">
                − {t}
                <button className="bc-chip-remove" onClick={() => setExcludeChannelTags(prev => prev.filter(x => x !== t))}><X size={11} /></button>
              </span>
            ))}
            <button className="bc-clear-tags-btn" onClick={() => { setFilterChannelTags([]); setExcludeChannelTags([]); }}>Сбросить</button>
          </div>
        )}

        {/* Folder tabs */}
        {channels.length > 0 && (
          <div className="bc-folder-tabs">
            <button className={`bc-folder-tab${activeFolderId === null ? ' active' : ''}`} onClick={() => setActiveFolderId(null)}>Все</button>
            {folders.map(f => (
              <div key={f.id} className={`bc-folder-tab${activeFolderId === f.id ? ' active' : ''}`}
                onClick={() => setActiveFolderId(f.id)}
                onDoubleClick={() => { setEditingFolderId(f.id); setEditingFolderName(f.name); }}
              >
                {editingFolderId === f.id ? (
                  <input className="bc-folder-rename-input" value={editingFolderName} onChange={e => setEditingFolderName(e.target.value)}
                    onBlur={() => renameFolder(f.id, editingFolderName)}
                    onKeyDown={e => { if (e.key === 'Enter') renameFolder(f.id, editingFolderName); if (e.key === 'Escape') setEditingFolderId(null); }}
                    autoFocus onClick={e => e.stopPropagation()} />
                ) : f.name}
                {editingFolderId === f.id && (
                  <button
                    className="bc-folder-delete"
                    /* onMouseDown + preventDefault — чтобы инпут не потерял фокус
                       и не успел сработать его onBlur → renameFolder, который убирает кнопку */
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); deleteFolder(f.id); setEditingFolderId(null); }}
                    title="Удалить"
                  ><X size={11} /></button>
                )}
              </div>
            ))}
            <button className="bc-folder-tab bc-folder-tab--add" onClick={createFolder} title="Новая папка"><Plus size={13} /></button>
          </div>
        )}

        {/* Active channels list */}
        {channels.length === 0 ? (
          <div className="bc-channels-empty">
            Каналы не добавлены.
          </div>
        ) : (
          <div className="bc-list-view">
            {channels.length > 3 && (
              <div className="bc-list-search-wrap">
                <Search size={13} />
                <input type="text" placeholder="Поиск по каналам и тегам..." value={chListSearch} onChange={e => setChListSearch(e.target.value)} />
              </div>
            )}
            <label className="bc-list-item bc-list-item--all">
              <input type="checkbox" checked={selectedChannels.length === filteredChannels.length && filteredChannels.length > 0} onChange={selectAll} />
              <span>{(filterChannelTags.length > 0 || excludeChannelTags.length > 0) ? `Каналы по тегам (${filteredChannels.length})` : activeFolderId !== null ? `Каналы в папке (${filteredChannels.length})` : `Все каналы (${channels.length})`}</span>
            </label>
            {filteredChannels.map(ch => (
              <div key={ch.id} className="bc-list-item bc-list-item--with-menu">
                <label className="bc-list-item-main">
                  <input type="checkbox" checked={selectedChannels.includes(ch.chatId)} onChange={() => toggleChannel(ch.chatId)} />
                  <Hash size={14} className="bc-list-icon" />
                  {renamingId === ch.id ? (
                    <input className="bc-rename-input" value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameChannel(ch.id)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRenameChannel(ch.id); if (e.key === 'Escape') setRenamingId(null); }}
                      autoFocus onClick={e => e.preventDefault()} />
                  ) : (
                    <span className="bc-list-title" onDoubleClick={(e) => { e.preventDefault(); setRenamingId(ch.id); setRenameValue(ch.title); }}>{ch.title}</span>
                  )}
                  <span className="bc-list-chatid">ID: {ch.chatId}</span>
                  {renamingId !== ch.id && (
                    <button className="bc-rename-btn" onClick={(e) => { e.preventDefault(); setRenamingId(ch.id); setRenameValue(ch.title); }} title="Переименовать">
                      <Pencil size={11} />
                    </button>
                  )}
                  {(channelTagsMap[ch.chatId] || []).length > 0 && (
                    <span className="bc-list-inline-tags">
                      {(channelTagsMap[ch.chatId] || []).map(t => <span key={t} className="bc-inline-tag">{t}</span>)}
                    </span>
                  )}
                </label>
                <ItemActionsMenu chatId={ch.chatId} entityType="channels" allTags={allChannelTags} onTagsChange={handleTagsChange} onArchive={() => handleArchive(ch.id)} folders={folders} currentFolderId={folderMap[ch.chatId] || null} onAssignFolder={assignFolder} />
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
                      <span className="bc-list-chatid">ID: {ch.chatId}</span>
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
        targetType="channels"
        onSaveDraft={(body, resetCb) => onSaveDraft?.({ ...body, targetType: 'channels', targetFilter: { channelIds: selectedChannels } }, resetCb)}
        savingDraft={savingDraft}
        initialDraft={initialDraft}
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
function UsersTab({ onSendResult, onSaveDraft, savingDraft, initialDraft }) {
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Фильтры
  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [excludedTags, setExcludedTags] = useState([]);
  const [userCount, setUserCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);

  // Загрузка тегов. Системные (__-префикс, например __no_raffle__) в админке
  // скрываем — это служебные маркеры бота, фильтр по ним делать незачем.
  useEffect(() => {
    api.get('/api/broadcasts/users/tags')
      .then(r => r.json())
      .then(list => setTags((Array.isArray(list) ? list : []).filter(t => !t.startsWith('__'))))
      .catch(() => {});
  }, []);

  // Подсчёт по фильтрам — когда выбраны теги (включая или исключая)
  useEffect(() => {
    if (selectedTags.length === 0 && excludedTags.length === 0) {
      setUserCount(0);
      return;
    }
    setCountLoading(true);
    const params = new URLSearchParams();
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
    if (excludedTags.length > 0) params.set('excludeTags', excludedTags.join(','));

    api.get(`/api/broadcasts/users/count?${params}`)
      .then(r => r.json())
      .then(data => setUserCount(data.count))
      .catch(() => setUserCount(null))
      .finally(() => setCountLoading(false));
  }, [selectedTags, excludedTags]);

  const toggleTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    setExcludedTags(prev => prev.filter(t => t !== tag));
  };

  const toggleExcludeTag = (tag) => {
    setExcludedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const removeTag = (tag) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const removeExcludedTag = (tag) => {
    setExcludedTags(prev => prev.filter(t => t !== tag));
  };

  const handleSend = async (composeBody, resetCompose) => {
    setSending(true);
    setSendResult(null);
    try {
      const filters = {};
      if (selectedTags.length > 0) filters.tags = selectedTags;
      if (excludedTags.length > 0) filters.excludeTags = excludedTags;

      const body = { filters, ...composeBody };

      const res = await api.post('/api/broadcasts/users', body);
      let data = null;
      try { data = await res.json(); } catch { /* non-JSON (proxy timeout HTML) */ }
      if (!res.ok) {
        setSendResult({ error: data?.error || 'Сервер не ответил. Проверьте «Историю» — рассылка могла пройти в фоне.' });
      } else if (!data) {
        setSendResult({ error: 'Ответ задержался. Проверьте «Историю» — рассылка скорее всего прошла.' });
        resetCompose();
      } else {
        setSendResult({ ...data, _queued: !!data.queued });
        resetCompose();
        onSendResult?.(data);
        // Если рассылка стартовала в фоне (status='queued'), поллим прогресс
        // пока он не станет 'completed'.
        if (data?.queued && data?.id) {
          pollBroadcastProgress(data.id);
        }
      }
    } catch (err) {
      setSendResult({ error: err.message });
    }
    setSending(false);
  };

  // Опрос прогресса асинхронной рассылки. Останавливается когда статус
  // 'completed' либо страница ушла. setSendResult обновляется в каждом тике.
  const pollBroadcastProgress = async (broadcastId) => {
    const tick = async () => {
      try {
        const r = await api.get(`/api/broadcasts/${broadcastId}/progress`);
        if (!r.ok) return false;
        const p = await r.json();
        setSendResult(prev => ({
          ...(prev || {}),
          _queued: p.status !== 'completed',
          total: p.total,
          success: p.sent,
          failed: p.permanent_fail,
          _retrying: p.retrying + p.pending + p.sending,
          status: p.status === 'completed' ? (p.sent > 0 ? 'published' : 'failed') : 'queued',
        }));
        return p.status !== 'completed';
      } catch {
        return false;
      }
    };
    // Первый запрос почти сразу, потом каждые 2 сек до завершения
    while (await tick()) {
      await new Promise(r => setTimeout(r, 2000));
    }
  };

  const [showTagDD, setShowTagDD] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const tagRef = useRef(null);
  const tagSearchRef = useRef(null);
  const [showExcludeDD, setShowExcludeDD] = useState(false);
  const [excludeSearch, setExcludeSearch] = useState('');
  const excludeRef = useRef(null);

  // Recipients list
  const [showRecipients, setShowRecipients] = useState(false);
  const [recipientsList, setRecipientsList] = useState([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsHasMore, setRecipientsHasMore] = useState(false);
  const [recipientsLoadingMore, setRecipientsLoadingMore] = useState(false);
  const recipientsListRef = useRef(null);

  const RECIPIENTS_PAGE = 100;

  const fetchRecipients = async (offset = 0) => {
    const params = new URLSearchParams();
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
    if (excludedTags.length > 0) params.set('excludeTags', excludedTags.join(','));
    params.set('limit', RECIPIENTS_PAGE);
    params.set('offset', offset);
    const res = await api.get(`/api/broadcasts/users/list?${params}`);
    return res.json();
  };

  const loadRecipients = async () => {
    if (showRecipients) { setShowRecipients(false); return; }
    setRecipientsLoading(true);
    try {
      const data = await fetchRecipients(0);
      setRecipientsList(data);
      setRecipientsHasMore(data.length >= RECIPIENTS_PAGE);
      setShowRecipients(true);
    } catch { setRecipientsList([]); }
    setRecipientsLoading(false);
  };

  const loadMoreRecipients = async () => {
    if (recipientsLoadingMore || !recipientsHasMore) return;
    setRecipientsLoadingMore(true);
    try {
      const data = await fetchRecipients(recipientsList.length);
      setRecipientsList(prev => [...prev, ...data]);
      setRecipientsHasMore(data.length >= RECIPIENTS_PAGE);
    } catch {}
    setRecipientsLoadingMore(false);
  };

  const handleRecipientsScroll = (e) => {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      loadMoreRecipients();
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e) => {
      if (tagRef.current && !tagRef.current.contains(e.target)) setShowTagDD(false);
      if (excludeRef.current && !excludeRef.current.contains(e.target)) setShowExcludeDD(false);
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
            <span>{selectedTags.length === 0 ? 'Включить теги' : `Включено: ${selectedTags.length}`}</span>
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
                  <div className="bc-tag-option" onClick={() => { setSelectedTags([]); setTagSearch(''); }}>
                    Сбросить все
                  </div>
                )}
                {tags
                  .filter(t => !tagSearch.trim() || t.toLowerCase().includes(tagSearch.trim().toLowerCase()))
                  .map(t => (
                    <label key={t} className={`bc-tag-option bc-tag-option--checkbox ${selectedTags.includes(t) ? 'active' : ''} ${excludedTags.includes(t) ? 'bc-tag-option--disabled' : ''}`} onClick={(e) => { e.preventDefault(); if (!excludedTags.includes(t)) toggleTag(t); }}>
                      <input type="checkbox" checked={selectedTags.includes(t)} readOnly className="bc-tag-checkbox" />
                      <span>{t}{excludedTags.includes(t) ? ' (исключён)' : ''}</span>
                    </label>
                  ))}
                {tagSearch.trim() && tags.filter(t => t.toLowerCase().includes(tagSearch.trim().toLowerCase())).length === 0 && (
                  <div className="bc-tag-option bc-tag-option--empty">Ничего не найдено</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bc-tag-filter bc-tag-filter--exclude" ref={excludeRef}>
          <button className="bc-tag-filter-btn bc-tag-filter-btn--exclude" onClick={() => setShowExcludeDD(!showExcludeDD)}>
            <X size={14} />
            <span>{excludedTags.length === 0 ? 'Исключить теги' : `Исключено: ${excludedTags.length}`}</span>
            <ChevronDown size={14} className={`bc-tag-chevron ${showExcludeDD ? 'open' : ''}`} />
          </button>
          {showExcludeDD && (
            <div className="bc-tag-dropdown">
              {tags.length > 5 && (
                <div className="bc-tag-search-wrap">
                  <Search size={13} className="bc-tag-search-icon" />
                  <input
                    className="bc-tag-search-input"
                    type="text"
                    placeholder="Поиск тега..."
                    value={excludeSearch}
                    onChange={e => setExcludeSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
              <div className="bc-tag-options-list">
                {(!excludeSearch.trim()) && (
                  <div className="bc-tag-option" onClick={() => { setExcludedTags([]); setExcludeSearch(''); }}>
                    Сбросить все
                  </div>
                )}
                {tags
                  .filter(t => !excludeSearch.trim() || t.toLowerCase().includes(excludeSearch.trim().toLowerCase()))
                  .map(t => (
                    <label key={t} className={`bc-tag-option bc-tag-option--checkbox ${excludedTags.includes(t) ? 'active' : ''} ${selectedTags.includes(t) ? 'bc-tag-option--disabled' : ''}`} onClick={(e) => { e.preventDefault(); if (!selectedTags.includes(t)) toggleExcludeTag(t); }}>
                      <input type="checkbox" checked={excludedTags.includes(t)} readOnly className="bc-tag-checkbox" />
                      <span>{t}{selectedTags.includes(t) ? ' (включён)' : ''}</span>
                    </label>
                  ))}
                {excludeSearch.trim() && tags.filter(t => t.toLowerCase().includes(excludeSearch.trim().toLowerCase())).length === 0 && (
                  <div className="bc-tag-option bc-tag-option--empty">Ничего не найдено</div>
                )}
              </div>
            </div>
          )}
        </div>

        {(selectedTags.length > 0 || excludedTags.length > 0) && (
          <div className="bc-selected-tags">
            {selectedTags.map(t => (
              <span key={`inc-${t}`} className="bc-selected-tag-chip">
                {t}
                <button className="bc-chip-remove" onClick={() => removeTag(t)}><X size={11} /></button>
              </span>
            ))}
            {excludedTags.map(t => (
              <span key={`exc-${t}`} className="bc-selected-tag-chip bc-selected-tag-chip--exclude">
                − {t}
                <button className="bc-chip-remove" onClick={() => removeExcludedTag(t)}><X size={11} /></button>
              </span>
            ))}
            <button className="bc-clear-tags-btn" onClick={() => { setSelectedTags([]); setExcludedTags([]); }}>Сбросить</button>
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
          <div className="bc-recipients-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRecipients(false); }}>
            <div className="bc-recipients-modal">
              <div className="bc-recipients-header">
                <span>Получатели ({recipientsList.length}{userCount > 100 ? ` из ${userCount}` : ''})</span>
                <button className="bc-recipients-close" onClick={() => setShowRecipients(false)}><X size={14} /></button>
              </div>
              <div className="bc-recipients-list" ref={recipientsListRef} onScroll={handleRecipientsScroll}>
                {recipientsList.map(u => (
                  <div key={u.user_id} className="bc-recipient-row">
                    <span className="bc-recipient-name">{u.full_name || '—'}</span>
                    {u.username && <span className="bc-recipient-username">@{u.username}</span>}
                    <span className="bc-recipient-id">{u.user_id}</span>
                  </div>
                ))}
                {recipientsLoadingMore && <div className="bc-recipients-loading-more"><Loader size={16} className="spin" /> Загрузка...</div>}
                {recipientsList.length === 0 && !recipientsLoadingMore && <div className="bc-recipients-empty">Нет получателей</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      <ComposeBlock
        title="Рассылка пользователям бота"
        hintText={
          selectedTags.length === 0 && excludedTags.length === 0
            ? 'Выберите хотя бы один тег для включения или исключения'
            : userCount != null && userCount > 0
              ? `Будет отправлено ${userCount} пользователям`
              : 'Нет пользователей по фильтрам'
        }
        canSend={userCount > 0 && (selectedTags.length > 0 || excludedTags.length > 0)}
        sending={sending}
        sendResult={sendResult}
        onSend={handleSend}
        targetType="users"
        onSaveDraft={(body, resetCb) => {
          const filters = {};
          if (selectedTags.length > 0) filters.tags = selectedTags;
          if (excludedTags.length > 0) filters.excludeTags = excludedTags;
          onSaveDraft?.({ ...body, targetType: 'users', targetFilter: { filters } }, resetCb);
        }}
        savingDraft={savingDraft}
        initialDraft={initialDraft}
      />
    </>
  );
}

/* ═══ Вкладка «Группы» ═══ */
function GroupsTab({ onSendResult, onSaveDraft, savingDraft, initialDraft }) {
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState([]);

  // Rename
  const [grRenamingId, setGrRenamingId] = useState(null);
  const [grRenameValue, setGrRenameValue] = useState('');

  const handleRenameGroup = async (id) => {
    if (!grRenameValue.trim()) { setGrRenamingId(null); return; }
    try {
      await api.put(`/api/broadcasts/groups/${id}/rename`, { title: grRenameValue.trim() });
      setGroups(prev => prev.map(g => g.id === id ? { ...g, title: grRenameValue.trim() } : g));
    } catch {}
    setGrRenamingId(null);
  };

  // Folders
  const [grFolders, setGrFolders] = useState([]);
  const [grActiveFolderId, setGrActiveFolderId] = useState(null);
  const [grFolderMap, setGrFolderMap] = useState({});
  const [grEditingFolderId, setGrEditingFolderId] = useState(null);
  const [grEditingFolderName, setGrEditingFolderName] = useState('');

  const loadGrFolders = useCallback(() => {
    api.get('/api/broadcast-folders?type=groups').then(r => r.json()).then(setGrFolders).catch(() => {});
    api.get('/api/broadcast-folders/map?type=groups').then(r => r.json()).then(setGrFolderMap).catch(() => {});
  }, []);
  useEffect(() => { loadGrFolders(); }, [loadGrFolders]);

  const createGrFolder = async () => {
    const res = await api.post('/api/broadcast-folders', { name: 'Новая папка', type: 'groups' });
    if (res.ok) loadGrFolders();
  };
  const renameGrFolder = async (id, name) => {
    if (!name.trim()) return;
    await api.put(`/api/broadcast-folders/${id}`, { name: name.trim() });
    setGrEditingFolderId(null);
    loadGrFolders();
  };
  const deleteGrFolder = async (id) => {
    await api.delete(`/api/broadcast-folders/${id}`);
    if (grActiveFolderId === id) setGrActiveFolderId(null);
    loadGrFolders();
  };
  const assignGrFolder = async (chatId, folderId) => {
    await api.put('/api/broadcast-folders/assign', { chatId, entityType: 'groups', folderId });
    loadGrFolders();
  };

  // Group tags (separate table from channels)
  const [allGroupTags, setAllGroupTags] = useState([]);
  const [filterGroupTags, setFilterGroupTags] = useState([]);
  const [excludeGroupTags, setExcludeGroupTags] = useState([]);
  const [groupTagsMap, setGroupTagsMap] = useState({});
  const [showGrTagDD, setShowGrTagDD] = useState(false);
  const [showGrExcludeDD, setShowGrExcludeDD] = useState(false);
  const [grTagSearch, setGrTagSearch] = useState('');
  const [grExcludeSearch, setGrExcludeSearch] = useState('');
  const [grListSearch, setGrListSearch] = useState('');
  const grTagRef = useRef(null);
  const grExcludeRef = useRef(null);

  const loadAllGroupTags = useCallback(() => {
    api.get('/api/broadcasts/group-tags').then(r => r.json()).then(setAllGroupTags).catch(() => {});
  }, []);

  // Загружаем группы вместе с тегами одним запросом через /groups/full —
  // тот же паттерн что и для каналов. Решает N+1 при плохой сети.
  const loadGroups = useCallback(() => {
    api.get('/api/broadcasts/groups/full').then(r => r.json()).then(data => {
      setGroups(data);
      const map = {};
      for (const g of data) map[g.chatId] = g.tags || [];
      setGroupTagsMap(map);
    }).catch(() => {});
  }, []);

  const loadArchive = useCallback(() => {
    api.get('/api/broadcasts/groups/archive').then(r => r.json()).then(setArchived).catch(() => {});
  }, []);

  useEffect(() => { loadGroups(); loadAllGroupTags(); }, [loadGroups, loadAllGroupTags]);

  useEffect(() => {
    const handler = (e) => {
      if (grTagRef.current && !grTagRef.current.contains(e.target)) setShowGrTagDD(false);
      if (grExcludeRef.current && !grExcludeRef.current.contains(e.target)) setShowGrExcludeDD(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleTagsChange = () => {
    loadAllGroupTags();
    loadGroups();
  };

  const handleApprove = async (id) => {
    try {
      await api.put(`/api/broadcasts/groups/${id}/approve`);
      setGroups(prev => prev.map(g => g.id === id ? { ...g, approved: 1 } : g));
    } catch (e) { alert('Ошибка: ' + e.message); }
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
    const res = await api.delete(`/api/broadcasts/groups/${id}`);
    if (!res.ok) throw new Error(`Ошибка ${res.status}`);
    setGroups(prev => prev.filter(g => g.id !== id));
  };

  const toggleGrFilterTag = (tag) => {
    setFilterGroupTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    setExcludeGroupTags(prev => prev.filter(t => t !== tag));
  };

  const toggleGrExcludeTag = (tag) => {
    setExcludeGroupTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    setFilterGroupTags(prev => prev.filter(t => t !== tag));
  };

  const filteredGroups = groups.filter(g => {
    if (grActiveFolderId !== null && (grFolderMap[g.chatId] || null) !== grActiveFolderId) return false;
    if (filterGroupTags.length > 0 && !(groupTagsMap[g.chatId] || []).some(t => filterGroupTags.includes(t))) return false;
    if (excludeGroupTags.length > 0 && (groupTagsMap[g.chatId] || []).some(t => excludeGroupTags.includes(t))) return false;
    if (grListSearch.trim()) {
      const q = grListSearch.trim().toLowerCase();
      const titleMatch = g.title?.toLowerCase().includes(q);
      const tagMatch = (groupTagsMap[g.chatId] || []).some(t => t.toLowerCase().includes(q));
      if (!titleMatch && !tagMatch) return false;
    }
    return true;
  });

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
      let data = null;
      try { data = await res.json(); } catch { /* non-JSON (proxy timeout HTML) */ }
      if (!res.ok) {
        setSendResult({ error: data?.error || 'Сервер не ответил. Проверьте «Историю» — рассылка могла пройти в фоне.' });
      } else if (!data) {
        setSendResult({ error: 'Ответ задержался. Проверьте «Историю» — рассылка скорее всего прошла.' });
        resetCompose();
        setSelectedGroups([]);
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
              <>
                <div className="bc-tag-filter" ref={grTagRef}>
                  <button className="bc-tag-filter-btn bc-tag-filter-btn--small" onClick={() => setShowGrTagDD(!showGrTagDD)}>
                    <Tag size={13} />
                    <span>{filterGroupTags.length === 0 ? 'Все теги' : `Тегов: ${filterGroupTags.length}`}</span>
                    <ChevronDown size={13} className={`bc-tag-chevron ${showGrTagDD ? 'open' : ''}`} />
                  </button>
                  {showGrTagDD && (
                    <div className="bc-tag-dropdown">
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
                      <div className="bc-tag-options-list">
                        <div className={`bc-tag-option ${filterGroupTags.length === 0 ? 'active' : ''}`} onClick={() => { setFilterGroupTags([]); setGrTagSearch(''); }}>
                          Все теги
                        </div>
                        {allGroupTags
                          .filter(t => !grTagSearch.trim() || t.toLowerCase().includes(grTagSearch.trim().toLowerCase()))
                          .map(t => (
                            <label key={t} className={`bc-tag-option bc-tag-option--checkbox ${filterGroupTags.includes(t) ? 'active' : ''} ${excludeGroupTags.includes(t) ? 'bc-tag-option--disabled' : ''}`} onClick={(e) => { e.preventDefault(); if (!excludeGroupTags.includes(t)) toggleGrFilterTag(t); }}>
                              <input type="checkbox" checked={filterGroupTags.includes(t)} readOnly className="bc-tag-checkbox" />
                              <span>{t}{excludeGroupTags.includes(t) ? ' (исключён)' : ''}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="bc-tag-filter bc-tag-filter--exclude" ref={grExcludeRef}>
                  <button className="bc-tag-filter-btn bc-tag-filter-btn--small bc-tag-filter-btn--exclude" onClick={() => setShowGrExcludeDD(!showGrExcludeDD)}>
                    <X size={13} />
                    <span>{excludeGroupTags.length === 0 ? 'Исключить' : `Исключено: ${excludeGroupTags.length}`}</span>
                    <ChevronDown size={13} className={`bc-tag-chevron ${showGrExcludeDD ? 'open' : ''}`} />
                  </button>
                  {showGrExcludeDD && (
                    <div className="bc-tag-dropdown">
                      <div className="bc-tag-search-wrap">
                        <Search size={12} className="bc-tag-search-icon" />
                        <input
                          className="bc-tag-search-input"
                          type="text"
                          placeholder="Поиск..."
                          value={grExcludeSearch}
                          onChange={e => setGrExcludeSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="bc-tag-options-list">
                        <div className={`bc-tag-option ${excludeGroupTags.length === 0 ? 'active' : ''}`} onClick={() => { setExcludeGroupTags([]); setGrExcludeSearch(''); }}>
                          Сбросить
                        </div>
                        {allGroupTags
                          .filter(t => !grExcludeSearch.trim() || t.toLowerCase().includes(grExcludeSearch.trim().toLowerCase()))
                          .map(t => (
                            <label key={t} className={`bc-tag-option bc-tag-option--checkbox ${excludeGroupTags.includes(t) ? 'active' : ''} ${filterGroupTags.includes(t) ? 'bc-tag-option--disabled' : ''}`} onClick={(e) => { e.preventDefault(); if (!filterGroupTags.includes(t)) toggleGrExcludeTag(t); }}>
                              <input type="checkbox" checked={excludeGroupTags.includes(t)} readOnly className="bc-tag-checkbox" />
                              <span>{t}{filterGroupTags.includes(t) ? ' (включён)' : ''}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            <button className="bc-archive-toggle" onClick={() => { setShowArchive(!showArchive); if (!showArchive) loadArchive(); }}>
              <Archive size={14} /> {showArchive ? 'Скрыть архив' : 'Архив'}
              {archived.length > 0 && !showArchive && <span className="bc-archive-count">{archived.length}</span>}
            </button>
          </div>
        </div>

        {(filterGroupTags.length > 0 || excludeGroupTags.length > 0) && (
          <div className="bc-selected-tags">
            {filterGroupTags.map(t => (
              <span key={`inc-${t}`} className="bc-selected-tag-chip">
                {t}
                <button className="bc-chip-remove" onClick={() => setFilterGroupTags(prev => prev.filter(x => x !== t))}><X size={11} /></button>
              </span>
            ))}
            {excludeGroupTags.map(t => (
              <span key={`exc-${t}`} className="bc-selected-tag-chip bc-selected-tag-chip--exclude">
                − {t}
                <button className="bc-chip-remove" onClick={() => setExcludeGroupTags(prev => prev.filter(x => x !== t))}><X size={11} /></button>
              </span>
            ))}
            <button className="bc-clear-tags-btn" onClick={() => { setFilterGroupTags([]); setExcludeGroupTags([]); }}>Сбросить</button>
          </div>
        )}

        {/* Group folder tabs */}
        {groups.length > 0 && (
          <div className="bc-folder-tabs">
            <button className={`bc-folder-tab${grActiveFolderId === null ? ' active' : ''}`} onClick={() => setGrActiveFolderId(null)}>Все</button>
            {grFolders.map(f => (
              <div key={f.id} className={`bc-folder-tab${grActiveFolderId === f.id ? ' active' : ''}`}
                onClick={() => setGrActiveFolderId(f.id)}
                onDoubleClick={() => { setGrEditingFolderId(f.id); setGrEditingFolderName(f.name); }}
              >
                {grEditingFolderId === f.id ? (
                  <input className="bc-folder-rename-input" value={grEditingFolderName} onChange={e => setGrEditingFolderName(e.target.value)}
                    onBlur={() => renameGrFolder(f.id, grEditingFolderName)}
                    onKeyDown={e => { if (e.key === 'Enter') renameGrFolder(f.id, grEditingFolderName); if (e.key === 'Escape') setGrEditingFolderId(null); }}
                    autoFocus onClick={e => e.stopPropagation()} />
                ) : f.name}
                {grEditingFolderId === f.id && (
                  <button
                    className="bc-folder-delete"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); deleteGrFolder(f.id); setGrEditingFolderId(null); }}
                    title="Удалить"
                  ><X size={11} /></button>
                )}
              </div>
            ))}
            <button className="bc-folder-tab bc-folder-tab--add" onClick={createGrFolder} title="Новая папка"><Plus size={13} /></button>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="bc-channels-empty">
            Группы не добавлены.
          </div>
        ) : (
          <div className="bc-list-view">
            {groups.length > 3 && (
              <div className="bc-list-search-wrap">
                <Search size={13} />
                <input type="text" placeholder="Поиск по группам и тегам..." value={grListSearch} onChange={e => setGrListSearch(e.target.value)} />
              </div>
            )}
            <label className="bc-list-item bc-list-item--all">
              <input type="checkbox" checked={selectedGroups.length === filteredGroups.length && filteredGroups.length > 0} onChange={selectAll} />
              <span>{(filterGroupTags.length > 0 || excludeGroupTags.length > 0) ? `Группы по тегам (${filteredGroups.length})` : grActiveFolderId !== null ? `Группы в папке (${filteredGroups.length})` : `Все группы (${groups.length})`}</span>
            </label>
            {filteredGroups.map(g => (
              <div key={g.id} className="bc-list-item bc-list-item--with-menu">
                <label className="bc-list-item-main">
                  <input type="checkbox" checked={selectedGroups.includes(g.chatId)} onChange={() => toggleGroup(g.chatId)} />
                  <MessageCircle size={14} className="bc-list-icon" />
                  {grRenamingId === g.id ? (
                    <input className="bc-rename-input" value={grRenameValue} onChange={e => setGrRenameValue(e.target.value)}
                      onBlur={() => handleRenameGroup(g.id)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRenameGroup(g.id); if (e.key === 'Escape') setGrRenamingId(null); }}
                      autoFocus onClick={e => e.preventDefault()} />
                  ) : (
                    <span className="bc-list-title" onDoubleClick={(e) => { e.preventDefault(); setGrRenamingId(g.id); setGrRenameValue(g.title); }}>{g.title}</span>
                  )}
                  <span className="bc-list-chatid">ID: {g.chatId}</span>
                  {!g.approved && (
                    <span className="bc-pending-badge" title="Ожидает подтверждения">
                      <Clock size={12} /> Ожидает
                    </span>
                  )}
                  {!g.approved && (
                    <button className="bc-approve-btn" onClick={(e) => { e.preventDefault(); handleApprove(g.id); }} title="Подтвердить">
                      <Check size={12} /> Принять
                    </button>
                  )}
                  {grRenamingId !== g.id && (
                    <button className="bc-rename-btn" onClick={(e) => { e.preventDefault(); setGrRenamingId(g.id); setGrRenameValue(g.title); }} title="Переименовать">
                      <Pencil size={11} />
                    </button>
                  )}
                  {(groupTagsMap[g.chatId] || []).length > 0 && (
                    <span className="bc-list-inline-tags">
                      {(groupTagsMap[g.chatId] || []).map(t => <span key={t} className="bc-inline-tag">{t}</span>)}
                    </span>
                  )}
                </label>
                <ItemActionsMenu chatId={g.chatId} entityType="groups" allTags={allGroupTags} onTagsChange={handleTagsChange} onArchive={() => handleArchive(g.id)} folders={grFolders} currentFolderId={grFolderMap[g.chatId] || null} onAssignFolder={assignGrFolder} />
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
                      <span className="bc-list-chatid">ID: {g.chatId}</span>
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
        targetType="groups"
        onSaveDraft={(body, resetCb) => onSaveDraft?.({ ...body, targetType: 'groups', targetFilter: { groupIds: selectedGroups } }, resetCb)}
        savingDraft={savingDraft}
        initialDraft={initialDraft}
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

/* ═══ Вкладка «Черновики» ═══ */
function DraftsTab({ onSendResult, onEditDraft }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [confirmSend, setConfirmSend] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await api.get('/api/broadcasts/drafts');
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const all = await res.json();
      setDrafts(all.filter(d => !(d.scheduleId && d.scheduleStatus === 'pending')));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const handleDelete = async () => {
    if (!deleteModal) return;
    try {
      await api.delete(`/api/broadcasts/drafts/${deleteModal}`);
      setDrafts(prev => prev.filter(d => d.id !== deleteModal));
    } catch (e) { alert('Ошибка: ' + e.message); }
    setDeleteModal(null);
  };

  const handleSend = async (draft) => {
    setSendingId(draft.id);
    try {
      const res = await api.post(`/api/broadcasts/drafts/${draft.id}/send`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Ошибка отправки');
      } else {
        onSendResult?.(data);
        setDrafts(prev => prev.filter(d => d.id !== draft.id));
      }
    } catch (e) { alert('Ошибка: ' + e.message); }
    setSendingId(null);
    setConfirmSend(null);
  };

  const handleCancelSchedule = async (scheduleId, draftId) => {
    setCancellingId(scheduleId);
    try {
      await api.delete(`/api/broadcasts/scheduled/${scheduleId}`);
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, scheduledAt: null, scheduleId: null, scheduleStatus: null } : d));
    } catch (e) { alert('Ошибка: ' + e.message); }
    setCancellingId(null);
  };

  const TARGET_LABELS = { channels: 'Каналы', groups: 'Группы', users: 'Пользователи' };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 32 }}><Loader size={24} className="spin" style={{ color: 'var(--color-orange)' }} /></div>;
  }

  return (
    <>
      {drafts.length === 0 ? (
        <div className="bc-channels-empty">
          Черновиков нет. Создайте черновик из вкладки Каналы, Группы или Пользователи.
        </div>
      ) : (
        <div className="bc-drafts-list">
          {drafts.map(d => (
            <div key={d.id} className="bc-draft-card">
              <div className="bc-draft-header">
                <span className="bc-draft-name">{d.name || 'Без названия'}</span>
                <span className="bc-draft-target">{TARGET_LABELS[d.targetType] || d.targetType}</span>
                {d.scheduledAt && d.scheduleStatus === 'pending' && (
                  <span className="bc-draft-scheduled-badge">
                    <Clock size={12} />
                    {new Date(d.scheduledAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}{' '}
                    {new Date(d.scheduledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="bc-draft-preview">
                {d.poll ? (
                  <span>[{d.poll.type === 'quiz' ? 'Викторина' : 'Опрос'}] {d.poll.question}</span>
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderTgHtml((d.text || '').substring(0, 120))) }} />
                )}
              </div>
              <div className="bc-draft-footer">
                <span className="bc-draft-date">
                  {new Date(d.updatedAt).toLocaleDateString('ru-RU')}{' '}
                  {new Date(d.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="bc-draft-actions">
                  {d.scheduleId && d.scheduleStatus === 'pending' && (
                    <button
                      className="bc-draft-action-btn bc-draft-cancel-btn"
                      onClick={() => handleCancelSchedule(d.scheduleId, d.id)}
                      disabled={cancellingId === d.scheduleId}
                      title="Отменить расписание"
                    >
                      {cancellingId === d.scheduleId ? <Loader size={13} className="spin" /> : <X size={13} />}
                      Отменить
                    </button>
                  )}
                  <button
                    className="bc-draft-action-btn bc-draft-edit-btn"
                    onClick={() => onEditDraft?.(d)}
                    title="Редактировать"
                  >
                    <Edit3 size={13} /> Редактировать
                  </button>
                  <button
                    className="bc-draft-action-btn bc-draft-delete-btn"
                    onClick={() => setDeleteModal(d.id)}
                    title="Удалить"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteModal && (
        <PromptModal
          title="Удалить черновик?"
          isConfirm
          onConfirm={handleDelete}
          onCancel={() => setDeleteModal(null)}
        />
      )}

      {confirmSend && (
        <PromptModal
          title={`Отправить «${confirmSend.name}»?`}
          isConfirm
          onConfirm={() => handleSend(confirmSend)}
          onCancel={() => setConfirmSend(null)}
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

/**
 * Модал «Получатели рассылки» с live-обновлением.
 *
 * Раньше показывал b.results (массив из results_json). У async-флоу через
 * persistent queue results_json пуст пока рассылка идёт — данные лежат
 * поштучно в wl_broadcast_jobs. Теперь модал тянет их через новый
 * GET /api/broadcasts/:id/recipients и поллит раз в 2 сек пока статус
 * 'queued', чтобы видеть процесс в реальном времени.
 *
 * Fallback на b.results оставлен для совсем старых записей (до миграции
 * на queue), где новой таблицы jobs ещё не существовало.
 */
function DeliveryModal({ broadcast, onClose }) {
  const [recipients, setRecipients] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isLive = broadcast.status === 'queued';

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const fetchOnce = async () => {
      try {
        const res = await api.get(`/api/broadcasts/${broadcast.id}/recipients`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setRecipients(Array.isArray(data) ? data : []);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        // На старых рассылках до queue эндпоинт может вернуть пустой массив,
        // что нормально. Сетевую ошибку показываем — пусть юзер видит причину.
        setError(e.message || 'fetch failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOnce();
    if (isLive) {
      timer = setInterval(fetchOnce, 2000);
    }
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [broadcast.id, isLive]);

  // Источник данных: live recipients из API > legacy b.results > пусто
  const list = (recipients && recipients.length)
    ? recipients
    : (Array.isArray(broadcast.results) ? broadcast.results : []);

  // Считаем агрегаты на лету — на queued рассылках summary из broadcast
  // отстаёт от реальности на полтика worker'а.
  const okCount = list.filter(r => r.ok).length;
  const failCount = list.filter(r => !r.ok && r.status === 'permanent_fail').length;
  const inFlight = list.filter(r => !r.ok && r.status !== 'permanent_fail').length;

  return (
    <div className="bc-delivery-overlay" onClick={onClose}>
      <div className="bc-delivery-modal" onClick={e => e.stopPropagation()}>
        <div className="bc-delivery-modal-header">
          <h3>Получатели рассылки{isLive && <Loader size={14} className="spin" style={{ marginLeft: 8, verticalAlign: 'middle', opacity: 0.6 }} />}</h3>
          <button className="bc-delivery-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="bc-delivery-summary">
          <span className="bc-delivery-ok"><CheckCircle size={14} /> Доставлено: {okCount || broadcast.success || 0}</span>
          <span className="bc-delivery-fail"><XCircle size={14} /> Ошибки: {failCount || broadcast.failed || 0}</span>
          {inFlight > 0 && (
            <span className="bc-delivery-pending"><Loader size={14} className="spin" /> В процессе: {inFlight}</span>
          )}
        </div>
        <div className="bc-delivery-list">
          {loading && !list.length && (
            <div className="bc-delivery-empty"><Loader size={16} className="spin" /> Загружаем...</div>
          )}
          {!loading && error && !list.length && (
            <div className="bc-delivery-empty">Ошибка: {error}</div>
          )}
          {list.map((r, i) => {
            const itemClass = r.ok
              ? 'bc-delivery-item--ok'
              : (r.status === 'permanent_fail' ? 'bc-delivery-item--fail' : 'bc-delivery-item--pending');
            const icon = r.ok
              ? <CheckCircle size={14} />
              : (r.status === 'permanent_fail' ? <XCircle size={14} /> : <Loader size={14} className="spin" />);
            return (
              <div key={i} className={`bc-delivery-item ${itemClass}`}>
                <span className="bc-delivery-icon">{icon}</span>
                <div className="bc-delivery-user-block">
                  <span className="bc-delivery-user-name">{r.name || r.chatId}</span>
                  {r.username && <span className="bc-delivery-username">@{r.username}</span>}
                  {!r.name && <span className="bc-delivery-user-id">{r.chatId}</span>}
                  {r.attempts > 1 && <span className="bc-delivery-attempts">попытка {r.attempts}</span>}
                </div>
                {r.error && <span className="bc-delivery-error">{r.error}</span>}
              </div>
            );
          })}
          {!loading && !error && !list.length && (
            <div className="bc-delivery-empty">Нет детальных данных</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Broadcasts() {
  const [openSection, setOpenSection] = useState('channels');
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState(null);
  const [textModal, setTextModal] = useState(null);
  const [recipientsModal, setRecipientsModal] = useState(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [editingDraft, setEditingDraft] = useState(null); // draft object when editing
  const [toast, setToast] = useState(null); // { message, type: 'success'|'error' }
  const [filterType, setFilterType] = useState(''); // channels|users|groups
  const [filterStatus, setFilterStatus] = useState(''); // published|partial|failed|scheduled
  const [filterContent, setFilterContent] = useState(''); // text|poll|quiz
  const [pollStatsModal, setPollStatsModal] = useState(null);
  const [pollStatsLoading, setPollStatsLoading] = useState(false);
  const [pollVoters, setPollVoters] = useState(null); // { optionIndex, optionText, voters: [] }  optionIndex='all' for all
  const [pollVotersLoading, setPollVotersLoading] = useState(false);
  const [randomWinner, setRandomWinner] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [raffleOpen, setRaffleOpen] = useState(false);

  const fetchBroadcasts = useCallback(async () => {
    try {
      const res = await api.get('/api/broadcasts');
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      setBroadcasts(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBroadcasts(); }, [fetchBroadcasts]);

  const loadPollStats = async (pollId) => {
    setPollStatsLoading(true);
    try {
      const res = await api.get(`/api/broadcasts/poll/${pollId}/stats`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      setPollStatsModal(data);
    } catch { setPollStatsModal(null); }
    setPollStatsLoading(false);
  };

  const loadPollVoters = async (pollId, optionIndex, optionText) => {
    setPollVotersLoading(true);
    setRandomWinner(null);
    setRaffleOpen(false);
    try {
      const res = await api.get(`/api/broadcasts/poll/${pollId}/voters/${optionIndex}`);
      if (!res.ok) throw new Error();
      const voters = await res.json();
      setPollVoters({ optionIndex, optionText, voters });
    } catch { setPollVoters(null); }
    setPollVotersLoading(false);
  };

  const loadAllPollVoters = async (pollId, options) => {
    setPollVotersLoading(true);
    setRandomWinner(null);
    setRaffleOpen(false);
    try {
      const all = [];
      for (let i = 0; i < options.length; i++) {
        const res = await api.get(`/api/broadcasts/poll/${pollId}/voters/${i}`);
        if (res.ok) {
          const list = await res.json();
          list.forEach(v => all.push({ ...v, optionIndex: i, optionText: options[i] }));
        }
      }
      setPollVoters({ optionIndex: 'all', optionText: 'Все', voters: all });
    } catch { setPollVoters(null); }
    setPollVotersLoading(false);
  };

  const pickRandomVoter = () => {
    if (!pollVoters || pollVoters.voters.length === 0) return;
    setSpinning(true);
    setRandomWinner(null);
    let count = 0;
    const total = 12 + Math.floor(Math.random() * 6);
    const iv = setInterval(() => {
      const idx = Math.floor(Math.random() * pollVoters.voters.length);
      setRandomWinner(pollVoters.voters[idx]);
      count++;
      if (count >= total) {
        clearInterval(iv);
        const finalIdx = Math.floor(Math.random() * pollVoters.voters.length);
        setRandomWinner(pollVoters.voters[finalIdx]);
        setSpinning(false);
      }
    }, 80 + count * 8);
  };

  const handleSendResult = (data) => {
    if (data && !data.error) {
      setBroadcasts(prev => [data, ...prev]);
    }
  };

  const handleDeleteBroadcast = async () => {
    if (!deleteModal) return;
    const res = await api.delete(`/api/broadcasts/${deleteModal}`);
    if (!res.ok) throw new Error(`Ошибка ${res.status}`);
    setBroadcasts(prev => prev.filter(b => b.id !== deleteModal));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteModal); return n; });
    setDeleteModal(null);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) { setBulkDeleteOpen(false); return; }
    const res = await api.post('/api/broadcasts/bulk-delete', { ids });
    if (!res.ok) throw new Error(`Ошибка ${res.status}`);
    setBroadcasts(prev => prev.filter(b => !selectedIds.has(b.id)));
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
  };

  const handleSaveDraft = async (body, resetCb) => {
    setSavingDraft(true);
    try {
      const isSchedule = body._schedule;
      const scheduledAt = body._scheduledAt;
      const { _schedule, _scheduledAt, ...cleanBody } = body;

      const draftPayload = {
        name: cleanBody.text ? stripTgHtml(cleanBody.text).substring(0, 60) : (cleanBody.poll?.question?.substring(0, 60) || 'Без названия'),
        text: cleanBody.text || null,
        media: cleanBody.media || null,
        poll: cleanBody.poll || null,
        targetType: cleanBody.targetType || 'channels',
        targetFilter: cleanBody.targetFilter || null,
      };

      let draftId;
      if (editingDraft) {
        await api.put(`/api/broadcasts/drafts/${editingDraft.id}`, draftPayload);
        draftId = editingDraft.id;
        setEditingDraft(null);
      } else {
        const res = await api.post('/api/broadcasts/drafts', draftPayload);
        const data = await res.json();
        draftId = data.id;
      }

      if (isSchedule && scheduledAt && draftId) {
        await api.post(`/api/broadcasts/drafts/${draftId}/schedule`, { scheduledAt: new Date(scheduledAt).toISOString() });
      }

      if (resetCb) resetCb();
      const msg = isSchedule ? '⏰ Рассылка запланирована!' : '✅ Черновик сохранён!';
      setToast({ message: msg, type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast({ message: 'Ошибка: ' + e.message, type: 'error' });
      setTimeout(() => setToast(null), 4000);
    }
    setSavingDraft(false);
  };

  const handleEditDraft = (draft) => {
    setEditingDraft(draft);
    // Switch to the appropriate tab
    const targetSection = draft.targetType || 'channels';
    setOpenSection(targetSection);
    setMounted(prev => ({ ...prev, [targetSection]: true }));
    // Scroll to top so compose area is visible
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  const handleEditScheduled = (b) => {
    // Convert scheduled broadcast from history into a draft-like object for editing
    const draftLike = {
      id: b.draftId,
      text: b.text || '',
      media: b.media || null,
      poll: b.poll || null,
      targetType: b.type || 'channels',
      targetFilter: b.targetFilter || null,
      scheduledAt: b.date,
      scheduleStatus: 'pending',
      scheduleId: b.scheduleId,
    };
    handleEditDraft(draftLike);
  };

  const filtered = broadcasts.filter(b => {
    if (search && !(b.text || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && b.type !== filterType) return false;
    if (filterStatus && b.status !== filterStatus) return false;
    if (filterContent) {
      const t = (b.text || '');
      const isQuiz = t.startsWith('[Викторина]');
      const isPoll = t.startsWith('[Опрос]');
      if (filterContent === 'quiz' && !isQuiz) return false;
      if (filterContent === 'poll' && !isPoll) return false;
      if (filterContent === 'text' && (isQuiz || isPoll)) return false;
    }
    return true;
  });

  const paginatedFiltered = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const TYPE_ICONS = { channels: '📢', users: '👤', groups: '💬', poll: '📊', quiz: '🧠' };

  const [mounted, setMounted] = useState({ channels: true }); // track which sections have been opened
  const sectionRefs = useRef({});
  const toggleSection = (id) => {
    const wasOpen = openSection === id;
    setOpenSection(prev => prev === id ? null : id);
    setMounted(prev => ({ ...prev, [id]: true }));
    if (!wasOpen) {
      setTimeout(() => {
        sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
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

      {/* Toast notification */}
      {toast && (
        <div className={`bc-toast bc-toast--${toast.type}`} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}

      {/* Аккордеон секций */}
      {SECTIONS.map(s => {
        const Icon = s.icon;
        const isOpen = openSection === s.id;
        return (
          <div key={s.id} className={`bc-accordion ${isOpen ? 'open' : ''}`} ref={el => sectionRefs.current[s.id] = el}>
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
                      {s.id === 'channels' && <ChannelsTab onSendResult={handleSendResult} onSaveDraft={handleSaveDraft} savingDraft={savingDraft} initialDraft={editingDraft?.targetType === 'channels' ? editingDraft : null} />}
                      {s.id === 'users' && <UsersTab onSendResult={handleSendResult} onSaveDraft={handleSaveDraft} savingDraft={savingDraft} initialDraft={editingDraft?.targetType === 'users' ? editingDraft : null} />}
                      {s.id === 'groups' && <GroupsTab onSendResult={handleSendResult} onSaveDraft={handleSaveDraft} savingDraft={savingDraft} initialDraft={editingDraft?.targetType === 'groups' ? editingDraft : null} />}
                      {s.id === 'drafts' && <DraftsTab onSendResult={handleSendResult} onEditDraft={handleEditDraft} />}
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

        <div className="bc-history-filters">
          <div className="bc-filter-group">
            <span className="bc-filter-label">Тип:</span>
            {[['', 'Все'], ['channels', 'Каналы'], ['groups', 'Группы'], ['users', 'Польз.']].map(([v, l]) => (
              <button key={v} className={`bc-filter-chip ${filterType === v ? 'active' : ''}`} onClick={() => { setFilterType(v); setVisibleCount(20); }}>{l}</button>
            ))}
          </div>
          <div className="bc-filter-group">
            <span className="bc-filter-label">Статус:</span>
            {[['', 'Все'], ['published', 'Доставлена'], ['failed', 'Ошибка'], ['scheduled', 'Отложена']].map(([v, l]) => (
              <button key={v} className={`bc-filter-chip ${filterStatus === v ? 'active' : ''}`} onClick={() => { setFilterStatus(v); setVisibleCount(20); }}>{l}</button>
            ))}
          </div>
          <div className="bc-filter-group">
            <span className="bc-filter-label">Контент:</span>
            {[['', 'Все'], ['text', '📝 Текст'], ['poll', '📊 Опрос'], ['quiz', '🧠 Викторина']].map(([v, l]) => (
              <button key={v} className={`bc-filter-chip ${filterContent === v ? 'active' : ''}`} onClick={() => { setFilterContent(v); setVisibleCount(20); }}>{l}</button>
            ))}
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="bc-bulk-bar">
            <span className="bc-bulk-count">Выбрано: <b>{selectedIds.size}</b></span>
            <button className="bc-bulk-clear" onClick={() => setSelectedIds(new Set())}>Снять выделение</button>
            <button className="bc-bulk-delete" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 size={14} /> Удалить выбранные
            </button>
          </div>
        )}

        <div className="broadcasts-table-wrap">
          <table className="broadcasts-table">
            <thead>
              <tr>
                <th className="bc-col-check">
                  <input
                    type="checkbox"
                    aria-label="Выделить все на странице"
                    checked={paginatedFiltered.length > 0 && paginatedFiltered.every(b => selectedIds.has(b.id))}
                    ref={el => {
                      if (!el) return;
                      const some = paginatedFiltered.some(b => selectedIds.has(b.id));
                      const all = paginatedFiltered.length > 0 && paginatedFiltered.every(b => selectedIds.has(b.id));
                      el.indeterminate = some && !all;
                    }}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        for (const b of paginatedFiltered) {
                          if (checked) next.add(b.id); else next.delete(b.id);
                        }
                        return next;
                      });
                    }}
                  />
                </th>
                <th>Текст</th>
                <th>Получатели</th>
                <th>Статус</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedFiltered.length === 0 ? (
                <tr><td colSpan={6} className="broadcasts-empty">Рассылок пока нет</td></tr>
              ) : paginatedFiltered.map(b => (
                <tr key={b.id} className={`broadcasts-row${selectedIds.has(b.id) ? ' broadcasts-row--selected' : ''}`}>
                  <td className="bc-col-check">
                    <input
                      type="checkbox"
                      aria-label="Выделить строку"
                      checked={selectedIds.has(b.id)}
                      onChange={() => toggleSelect(b.id)}
                    />
                  </td>
                  <td className="bc-title-cell">
                    <span className="bc-type-badge">{TYPE_ICONS[b.type] || '📢'}</span>
                    {(() => {
                      const mime = b.media?.mimeType || '';
                      const isImg = mime.startsWith('image/');
                      const isVid = mime.startsWith('video/');
                      const openModal = () => setTextModal({ text: b.text || '', media: b.media || null });
                      if (isImg) {
                        return (
                          <img
                            src={b.media.url}
                            alt={b.media.originalName || ''}
                            className="bc-hist-thumb"
                            loading="lazy"
                            title="Нажмите для просмотра"
                            onClick={openModal}
                          />
                        );
                      }
                      if (isVid) {
                        return (
                          <video
                            src={b.media.url}
                            className="bc-hist-thumb"
                            preload="metadata"
                            muted
                            title="Нажмите для просмотра"
                            onClick={openModal}
                          />
                        );
                      }
                      return null;
                    })()}
                    <span className="bc-hist-text-wrap" title="Нажмите для просмотра" onClick={() => setTextModal({ text: b.text || '', media: b.media || null })} dangerouslySetInnerHTML={{ __html: sanitizeHtml((b.media && !(b.media.mimeType || '').startsWith('image/') && !(b.media.mimeType || '').startsWith('video/') ? `[${b.media.originalName}] ` : '') + renderTgHtml(b.text || '')) }} />
                  </td>
                  <td className="bc-channel">
                    {(() => {
                      const recips = b.channels || [];
                      if (!recips.length) return '—';
                      // Пользователи уже хранятся компактным лейблом «Пользователи (N)» — показываем как есть.
                      if (b.type === 'users') return recips.join(', ');
                      // Группы/каналы хранят полный список имён — сворачиваем в компактный кликабельный лейбл.
                      const label = b.type === 'groups' ? 'Группы' : b.type === 'channels' ? 'Каналы' : 'Получатели';
                      return (
                        <button
                          className="bc-recipients-btn"
                          onClick={() => setRecipientsModal({ title: label, items: recips })}
                          title="Показать список получателей"
                        >
                          {label} ({recips.length})
                        </button>
                      );
                    })()}
                  </td>
                  <td>
                    <span className={`bc-status bc-status--${displayStatus(b.status)}`}>
                      {(b.status === 'published' || b.status === 'partial') && <CheckCircle size={12} />}
                      {b.status === 'failed' && <XCircle size={12} />}
                      {b.status === 'scheduled' && <Clock size={12} />}
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
                    {b.status === 'scheduled' && b.draftId && (
                      <button className="bc-action-btn bc-action-edit" title="Редактировать" onClick={() => handleEditScheduled(b)}>
                        <Edit3 size={14} />
                      </button>
                    )}
                    {b.pollId && (
                      <button className="bc-action-btn bc-action-stats" title="Статистика опроса" onClick={() => loadPollStats(b.pollId)}>
                        <BarChart2 size={14} />
                      </button>
                    )}
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

      {bulkDeleteOpen && (
        <PromptModal
          title={`Удалить выбранные записи (${selectedIds.size})?`}
          isConfirm
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}

      {textModal && (
        <div className="bc-text-modal-overlay" onClick={() => setTextModal(null)}>
          <div className="bc-text-modal" onClick={e => e.stopPropagation()}>
            <div className="bc-text-modal-header">
              <h4>Текст рассылки</h4>
              <button onClick={() => setTextModal(null)}><X size={16} /></button>
            </div>
            <div className="bc-text-modal-body">
              {textModal.media && (() => {
                const m = textModal.media;
                const mime = m.mimeType || '';
                if (mime.startsWith('image/')) {
                  return (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="bc-text-modal-media">
                      <img src={m.url} alt={m.originalName || ''} className="bc-text-modal-image" />
                    </a>
                  );
                }
                if (mime.startsWith('video/')) {
                  return (
                    <video src={m.url} controls className="bc-text-modal-video" preload="metadata" />
                  );
                }
                return (
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="bc-text-modal-file">
                    <Paperclip size={14} />
                    <span className="bc-text-modal-file-name">{m.originalName || 'Файл'}</span>
                    {typeof m.size === 'number' && (
                      <span className="bc-text-modal-file-size">{formatSize(m.size)}</span>
                    )}
                  </a>
                );
              })()}
              {textModal.text && (
                <div
                  className="bc-text-modal-text"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderTgHtml(textModal.text)) }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {deliveryModal && (
        <DeliveryModal broadcast={deliveryModal} onClose={() => setDeliveryModal(null)} />
      )}

      {recipientsModal && (
        <div className="bc-text-modal-overlay" onClick={() => setRecipientsModal(null)}>
          <div className="bc-text-modal" onClick={e => e.stopPropagation()}>
            <div className="bc-text-modal-header">
              <h4>{recipientsModal.title} ({recipientsModal.items.length})</h4>
              <button onClick={() => setRecipientsModal(null)}><X size={16} /></button>
            </div>
            <div className="bc-text-modal-body">
              <ol className="bc-recipients-list">
                {recipientsModal.items.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {pollStatsModal && (
        <div className="bc-delivery-overlay" onClick={() => { setPollStatsModal(null); setPollVoters(null); setRandomWinner(null); setRaffleOpen(false); }}>
          <div className="bc-delivery-modal bc-poll-stats-modal" onClick={e => e.stopPropagation()}>
            <div className="bc-delivery-modal-header">
              <h3>{pollStatsModal.type === 'quiz' ? 'Викторина' : 'Опрос'}</h3>
              <button className="bc-delivery-close" onClick={() => { setPollStatsModal(null); setPollVoters(null); setRandomWinner(null); setRaffleOpen(false); }}><X size={18} /></button>
            </div>
            <div className="bc-poll-stats-question">{pollStatsModal.question}</div>
            <div className="bc-poll-stats-total">
              <span>Всего голосов: <b>{pollStatsModal.totalVotes}</b></span>
              {pollStatsModal.totalVotes > 0 && (
                <button
                  className={`bc-poll-all-voters-btn ${pollVoters?.optionIndex === 'all' ? 'active' : ''}`}
                  onClick={() => loadAllPollVoters(pollStatsModal.id, (pollStatsModal.stats || []).map(s => s.option))}
                >
                  <Users size={13} /> Все проголосовавшие
                </button>
              )}
            </div>
            <div className="bc-poll-options">
              {(pollStatsModal.stats || []).map((s, i) => (
                <div
                  key={i}
                  className={`bc-poll-option bc-poll-option--clickable ${pollStatsModal.type === 'quiz' && pollStatsModal.correctIndex === i ? 'bc-poll-option--correct' : ''} ${pollVoters?.optionIndex === i ? 'bc-poll-option--selected' : ''}`}
                  onClick={() => s.count > 0 && loadPollVoters(pollStatsModal.id, i, s.option)}
                >
                  <div className="bc-poll-option-header">
                    <span className="bc-poll-option-text">
                      {pollStatsModal.type === 'quiz' && pollStatsModal.correctIndex === i && <Check size={14} className="bc-poll-correct-icon" />}
                      {s.option}
                    </span>
                    <span className="bc-poll-option-count">{s.count} ({s.percent}%)</span>
                  </div>
                  <div className="bc-poll-bar">
                    <div className="bc-poll-bar-fill" style={{ width: `${s.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Voters panel */}
            {pollVotersLoading && <div className="bc-poll-voters-loading"><Loader size={16} className="spin" /> Загрузка...</div>}
            {pollVoters && !pollVotersLoading && (
              <div className="bc-poll-voters">
                <div className="bc-poll-voters-header">
                  <span>{pollVoters.optionIndex === 'all' ? 'Все проголосовавшие' : `Вариант: «${pollVoters.optionText}»`}</span>
                  <span className="bc-poll-voters-count">{pollVoters.voters.length}</span>
                </div>
                {pollVoters.voters.length === 0 ? (
                  <div className="bc-poll-voters-empty">Нет голосов</div>
                ) : (
                  <>
                    <div className="bc-poll-voters-list">
                      {pollVoters.voters.map((v, vi) => (
                        <div key={vi} className={`bc-poll-voter${randomWinner?.userId === v.userId && !spinning ? ' bc-poll-voter--winner' : ''}`}>
                          <div className="bc-poll-voter-avatar">{(v.fullName || v.username || '?').charAt(0).toUpperCase()}</div>
                          <div className="bc-poll-voter-info">
                            <span className="bc-poll-voter-name">{v.fullName || 'Без имени'}</span>
                            {v.username && <span className="bc-poll-voter-username">@{v.username}</span>}
                          </div>
                          {pollVoters.optionIndex === 'all' && v.optionText && (
                            <span className="bc-poll-voter-opt">{v.optionText}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="bc-poll-actions-row">
                      <button className={`bc-poll-random-btn${spinning ? ' bc-poll-random-btn--spin' : ''}`} onClick={pickRandomVoter} disabled={spinning}>
                        {spinning ? 'Выбираем...' : randomWinner && !spinning ? `Победитель: ${randomWinner.fullName || randomWinner.username || 'ID: ' + randomWinner.userId}` : 'Случайный победитель'}
                      </button>
                      <button
                        className={`bc-poll-raffle-btn${raffleOpen ? ' bc-poll-raffle-btn--active' : ''}`}
                        onClick={() => setRaffleOpen(o => !o)}
                      >
                        <Tag size={14} /> {raffleOpen ? 'Скрыть розыгрыш' : 'Розыгрыш с тегом'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Full raffle UI inside the modal */}
            {raffleOpen && pollVoters && pollVoters.voters.length > 0 && (
              <div className="bc-poll-raffle-wrap">
                <Raffle
                  compact
                  poolLabel={pollVoters.optionIndex === 'all' ? 'Голосовавшие' : `Выбрали «${pollVoters.optionText}»`}
                  defaultTag={pollStatsModal.type === 'quiz' ? 'Викторина-победитель' : 'Опрос-победитель'}
                  users={pollVoters.voters.map(v => ({
                    user_id: v.userId,
                    full_name: v.fullName,
                    username: v.username,
                  }))}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
