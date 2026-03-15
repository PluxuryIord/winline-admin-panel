import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, BarChart2, Trophy, HelpCircle,
  Plus, Trash2, Image, Paperclip, Check, Shuffle,
  Send, Users, CheckCircle, AlertCircle, Loader, Hash
} from 'lucide-react';
import './BroadcastEditor.css';

/* ── метаданные типов ── */
const TYPE_META = {
  post:    { icon: FileText,   label: 'Пост' },
  poll:    { icon: BarChart2,  label: 'Опрос' },
  contest: { icon: Trophy,     label: 'Конкурс с рандомайзером' },
  quiz:    { icon: HelpCircle, label: 'Викторина с рандомайзером' },
};

/* ── Аудитория бота ── */
const AUDIENCE_OPTIONS = [
  {
    key: 'all',
    label: 'Все пользователи бота',
    desc: 'Отправить всем активным пользователям',
  },
  {
    key: 'registered',
    label: 'Зарегистрированные партнёры',
    desc: 'Только те, кто завершил регистрацию',
  },
  {
    key: 'me',
    label: 'Только я (тест)',
    desc: 'Отправить только себе для проверки',
  },
];

/* ════════ Конструкторы по типам ════════ */

function PostEditor({ text, onText }) {
  return (
    <div className="be-editor-section">
      <label className="be-label">Текст публикации</label>
      <textarea
        className="be-textarea"
        rows={8}
        placeholder="Введите текст поста..."
        value={text}
        onChange={e => onText(e.target.value)}
      />
    </div>
  );
}

function PollEditor({ question, onQuestion, options, onOptions }) {
  const addOption = () => onOptions([...options, '']);
  const removeOption = (i) => onOptions(options.filter((_, idx) => idx !== i));
  const editOption = (i, val) => {
    const next = [...options];
    next[i] = val;
    onOptions(next);
  };

  return (
    <div className="be-editor-section">
      <label className="be-label">Вопрос</label>
      <input
        className="be-input"
        type="text"
        placeholder="Введите вопрос..."
        value={question}
        onChange={e => onQuestion(e.target.value)}
      />

      <label className="be-label" style={{ marginTop: '20px' }}>Варианты ответа</label>
      <div className="be-options-list">
        {options.map((opt, i) => (
          <div key={i} className="be-option-row">
            <span className="be-option-num">{i + 1}</span>
            <input
              className="be-input be-input--flex"
              type="text"
              placeholder={`Вариант ${i + 1}`}
              value={opt}
              onChange={e => editOption(i, e.target.value)}
            />
            {options.length > 2 && (
              <button className="be-icon-btn be-icon-btn--danger" onClick={() => removeOption(i)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="be-add-option-btn" onClick={addOption}>
        <Plus size={14} /> Добавить вариант
      </button>
    </div>
  );
}

function ContestEditor({ text, onText, randomizer, onRandomizer }) {
  return (
    <div className="be-editor-section">
      <label className="be-label">Описание конкурса</label>
      <textarea
        className="be-textarea"
        rows={6}
        placeholder="Опишите условия конкурса и приз..."
        value={text}
        onChange={e => onText(e.target.value)}
      />

      <div className="be-randomizer-block">
        <div className="be-randomizer-header">
          <div className="be-randomizer-icon">
            <Shuffle size={18} />
          </div>
          <div>
            <div className="be-randomizer-title">Рандомайзер победителя</div>
            <div className="be-randomizer-desc">Победитель будет выбран случайным образом среди всех участников</div>
          </div>
          <button
            className={`be-toggle ${randomizer ? 'be-toggle--on' : ''}`}
            onClick={() => onRandomizer(!randomizer)}
          >
            <span className="be-toggle-thumb" />
          </button>
        </div>

        {randomizer && (
          <div className="be-randomizer-settings">
            <label className="be-label">Количество победителей</label>
            <input className="be-input" type="number" min={1} defaultValue={1} style={{ maxWidth: '120px' }} />
          </div>
        )}
      </div>
    </div>
  );
}

function QuizEditor({ question, onQuestion, options, onOptions, correctIndex, onCorrect }) {
  const addOption = () => onOptions([...options, '']);
  const removeOption = (i) => {
    onOptions(options.filter((_, idx) => idx !== i));
    if (correctIndex === i) onCorrect(0);
    else if (correctIndex > i) onCorrect(correctIndex - 1);
  };
  const editOption = (i, val) => {
    const next = [...options];
    next[i] = val;
    onOptions(next);
  };

  return (
    <div className="be-editor-section">
      <label className="be-label">Вопрос викторины</label>
      <input
        className="be-input"
        type="text"
        placeholder="Введите вопрос..."
        value={question}
        onChange={e => onQuestion(e.target.value)}
      />

      <label className="be-label" style={{ marginTop: '20px' }}>
        Варианты ответа <span className="be-label-hint">(отметьте правильный)</span>
      </label>
      <div className="be-options-list">
        {options.map((opt, i) => (
          <div key={i} className={`be-option-row ${correctIndex === i ? 'be-option-row--correct' : ''}`}>
            <button
              className={`be-correct-btn ${correctIndex === i ? 'be-correct-btn--active' : ''}`}
              onClick={() => onCorrect(i)}
              title="Правильный ответ"
            >
              <Check size={12} />
            </button>
            <input
              className="be-input be-input--flex"
              type="text"
              placeholder={`Вариант ${i + 1}`}
              value={opt}
              onChange={e => editOption(i, e.target.value)}
            />
            {options.length > 2 && (
              <button className="be-icon-btn be-icon-btn--danger" onClick={() => removeOption(i)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="be-add-option-btn" onClick={addOption}>
        <Plus size={14} /> Добавить вариант
      </button>

      <div className="be-randomizer-block" style={{ marginTop: '20px' }}>
        <div className="be-randomizer-header">
          <div className="be-randomizer-icon">
            <Shuffle size={18} />
          </div>
          <div>
            <div className="be-randomizer-title">Рандомайзер среди правильных</div>
            <div className="be-randomizer-desc">Приз разыгрывается среди всех, кто ответил правильно</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════ Правая панель — аудитория ════════ */
function AudiencePanel({ audience, onAudience, userCount, countLoading, sendMode, onSendMode, channelId, onChannelId }) {
  return (
    <div className="be-filters-panel">
      {/* Переключатель: бот / канал */}
      <div className="be-send-mode-toggle">
        <button
          className={`be-send-mode-btn ${sendMode === 'bot' ? 'be-send-mode-btn--active' : ''}`}
          onClick={() => onSendMode('bot')}
        >
          <Users size={14} /> В бота
        </button>
        <button
          className={`be-send-mode-btn ${sendMode === 'channel' ? 'be-send-mode-btn--active' : ''}`}
          onClick={() => onSendMode('channel')}
        >
          <Hash size={14} /> В канал
        </button>
      </div>

      {sendMode === 'bot' ? (
        <>
          <div className="be-filters-title">
            <Users size={13} style={{ display: 'inline', marginRight: 6 }} />
            Аудитория
          </div>

          <div className="be-filter-group-body be-audience-options">
            {AUDIENCE_OPTIONS.map(opt => (
              <label
                key={opt.key}
                className={`be-audience-option ${audience === opt.key ? 'be-audience-option--active' : ''}`}
              >
                <input
                  type="radio"
                  name="audience"
                  className="be-radio"
                  checked={audience === opt.key}
                  onChange={() => onAudience(opt.key)}
                />
                <div className="be-audience-option-info">
                  <span className="be-audience-option-label">{opt.label}</span>
                  <span className="be-audience-option-desc">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="be-audience-summary">
            {countLoading ? (
              <span className="be-audience-loading">
                <Loader size={12} className="be-spin" /> Загрузка...
              </span>
            ) : userCount !== null ? (
              <span>
                Получателей: <b>{userCount.toLocaleString('ru-RU')}</b>
              </span>
            ) : (
              <span className="be-audience-warn">Бот API недоступен</span>
            )}
          </div>

          <div className="be-bot-note">
            Рассылка отправляется через Telegram бота
            напрямую каждому пользователю в личные сообщения.
          </div>
        </>
      ) : (
        <>
          <div className="be-filters-title">
            <Hash size={13} style={{ display: 'inline', marginRight: 6 }} />
            Telegram канал
          </div>

          <div className="be-editor-section" style={{ padding: '0 0 8px' }}>
            <label className="be-label">ID или @username канала</label>
            <input
              className="be-input"
              type="text"
              placeholder="@channel или -100123456789"
              value={channelId}
              onChange={e => onChannelId(e.target.value)}
            />
          </div>

          <div className="be-bot-note">
            Сообщение будет отправлено в указанный Telegram канал.
            Бот должен быть администратором канала с правом публикации.
          </div>
        </>
      )}
    </div>
  );
}

/* ════════ Главный компонент ════════ */
export default function BroadcastEditor() {
  const { type } = useParams();
  const navigate = useNavigate();

  const meta = TYPE_META[type] || TYPE_META.post;
  const Icon = meta.icon;

  // Состояние контента
  const [text, setText] = useState('');
  const [question, setQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [quizOptions, setQuizOptions] = useState(['', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [randomizer, setRandomizer] = useState(true);

  // Режим отправки: бот / канал
  const [sendMode, setSendMode] = useState('bot');
  const [channelId, setChannelId] = useState('');

  // Аудитория + счётчик
  const [audience, setAudience] = useState('all');
  const [userCount, setUserCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);

  // Состояние отправки
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Запрашиваем счётчик при смене аудитории (только в режиме бота)
  useEffect(() => {
    if (sendMode !== 'bot') return;
    setCountLoading(true);
    setUserCount(null);
    fetch(`/api/bot/users/count?audience=${audience}`)
      .then(r => r.json())
      .then(d => setUserCount(typeof d.count === 'number' ? d.count : null))
      .catch(() => setUserCount(null))
      .finally(() => setCountLoading(false));
  }, [audience, sendMode]);

  // Форматируем содержимое в текст для бота
  const buildText = useCallback(() => {
    if (type === 'post' || type === 'contest') return text;
    if (type === 'poll') {
      const opts = pollOptions
        .filter(o => o.trim())
        .map((o, i) => `${i + 1}. ${o}`)
        .join('\n');
      return `❓ <b>${question}</b>\n\n${opts}`;
    }
    if (type === 'quiz') {
      const opts = quizOptions
        .filter(o => o.trim())
        .map((o, i) => `${i === correctIndex ? '✅' : '▫️'} ${o}`)
        .join('\n');
      return `🧠 <b>${question}</b>\n\n${opts}`;
    }
    return text;
  }, [type, text, question, pollOptions, quizOptions, correctIndex]);

  const handlePublish = useCallback(async () => {
    const msgText = buildText().trim();
    if (!msgText) {
      alert('Заполните содержимое рассылки!');
      return;
    }

    if (sendMode === 'channel' && !channelId.trim()) {
      alert('Укажите ID или @username канала!');
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      if (sendMode === 'channel') {
        // Отправка в канал
        const r = await fetch('/api/bot/channel-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msgText, channelIds: [channelId.trim()] }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        if (data.results?.[0] && !data.results[0].ok) {
          throw new Error(data.results[0].error || 'Ошибка отправки в канал');
        }
        setSendResult({ success: true, count: 1, channel: channelId.trim() });
      } else {
        // Отправка через бота
        const r = await fetch('/api/bot/broadcasts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msgText, audience }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setSendResult({ success: true, count: data.recipients_count, alertId: data.alert_id });
      }
    } catch (e) {
      setSendResult({ error: e.message });
    } finally {
      setSending(false);
    }
  }, [audience, buildText, sendMode, channelId]);

  // Успешная отправка — показываем результат
  if (sendResult?.success) {
    return (
      <div className="be-container">
        <div className="be-success-screen">
          <div className="be-success-icon">
            <CheckCircle size={52} />
          </div>
          <h2 className="be-success-title">
            {sendResult.channel ? 'Опубликовано в канал!' : 'Рассылка запущена!'}
          </h2>
          <p className="be-success-desc">
            {sendResult.channel ? (
              <>Сообщение отправлено в канал <code>{sendResult.channel}</code></>
            ) : (
              <>
                Сообщение отправляется <b>{sendResult.count.toLocaleString('ru-RU')}</b> получателям.
                <br />ID рассылки: <code>#{sendResult.alertId}</code>
              </>
            )}
          </p>
          <button className="be-publish-btn" onClick={() => navigate('/mailings')}>
            Перейти к списку рассылок
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="be-container">
      {/* Шапка */}
      <div className="be-header">
        <button className="be-back-btn" onClick={() => navigate('/mailings/new')}>
          <ArrowLeft size={18} />
          Назад
        </button>
        <div className="be-header-meta">
          <div className="be-header-icon">
            <Icon size={18} />
          </div>
          <h1 className="be-header-title">{meta.label}</h1>
        </div>
      </div>

      {/* Рабочая область */}
      <div className="be-workspace">
        {/* Левая колонка — редактор */}
        <div className="be-left">
          {type === 'post' && (
            <PostEditor text={text} onText={setText} />
          )}
          {type === 'poll' && (
            <PollEditor
              question={question} onQuestion={setQuestion}
              options={pollOptions} onOptions={setPollOptions}
            />
          )}
          {type === 'contest' && (
            <ContestEditor
              text={text} onText={setText}
              randomizer={randomizer} onRandomizer={setRandomizer}
            />
          )}
          {type === 'quiz' && (
            <QuizEditor
              question={question} onQuestion={setQuestion}
              options={quizOptions} onOptions={setQuizOptions}
              correctIndex={correctIndex} onCorrect={setCorrectIndex}
            />
          )}

          {/* Загрузка материалов */}
          <div className="be-upload-row">
            <button className="be-upload-btn">
              <Image size={16} /> Загрузить изображение
            </button>
            <button className="be-upload-btn">
              <Paperclip size={16} /> Прикрепить файл
            </button>
          </div>
        </div>

        {/* Правая колонка — аудитория */}
        <AudiencePanel
          audience={audience}
          onAudience={setAudience}
          userCount={userCount}
          countLoading={countLoading}
          sendMode={sendMode}
          onSendMode={setSendMode}
          channelId={channelId}
          onChannelId={setChannelId}
        />
      </div>

      {/* Ошибка отправки */}
      {sendResult?.error && (
        <div className="be-send-error">
          <AlertCircle size={16} />
          <span>{sendResult.error}</span>
        </div>
      )}

      {/* Подвал */}
      <div className="be-footer">
        <button className="be-draft-btn" onClick={() => navigate('/mailings')}>
          Сохранить черновик
        </button>
        <button
          className="be-publish-btn"
          onClick={handlePublish}
          disabled={sending || (sendMode === 'bot' && countLoading)}
        >
          {sending ? <Loader size={16} className="be-spin" /> : <Send size={16} />}
          {sending ? 'Отправка...' : 'Опубликовать'}
        </button>
      </div>
    </div>
  );
}
