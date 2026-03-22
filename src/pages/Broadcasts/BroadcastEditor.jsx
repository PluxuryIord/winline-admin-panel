import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, BarChart2, Trophy, HelpCircle,
  Plus, Trash2, Image, Paperclip, Check, Shuffle,
  Send, CheckCircle, AlertCircle, Loader, Hash
} from 'lucide-react';
import { api } from '../../utils/api.js';
import TgHtmlEditor from '../../components/TgHtmlEditor/TgHtmlEditor';
import './BroadcastEditor.css';

/* ── метаданные типов ── */
const TYPE_META = {
  post:    { icon: FileText,   label: 'Пост' },
  poll:    { icon: BarChart2,  label: 'Опрос' },
  contest: { icon: Trophy,     label: 'Конкурс с рандомайзером' },
  quiz:    { icon: HelpCircle, label: 'Викторина с рандомайзером' },
};

/* ════════ Конструкторы по типам ════════ */

function PostEditor({ text, onText }) {
  return (
    <div className="be-editor-section">
      <label className="be-label">Текст публикации</label>
      <TgHtmlEditor
        value={text}
        onChange={onText}
        placeholder="Введите текст поста..."
        minRows={6}
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
      <TgHtmlEditor
        value={text}
        onChange={onText}
        placeholder="Опишите условия конкурса и приз..."
        minRows={4}
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

/* ════════ Правая панель — выбор каналов ════════ */
function ChannelsPanel({ channels, selectedIds, onToggle, onSelectAll, loading }) {
  if (loading) {
    return (
      <div className="be-filters-panel">
        <div className="be-filters-title">
          <Hash size={13} style={{ display: 'inline', marginRight: 6 }} />
          Каналы
        </div>
        <div className="be-audience-loading" style={{ padding: '20px 0' }}>
          <Loader size={14} className="be-spin" /> Загрузка каналов...
        </div>
      </div>
    );
  }

  return (
    <div className="be-filters-panel">
      <div className="be-filters-title">
        <Hash size={13} style={{ display: 'inline', marginRight: 6 }} />
        Каналы для отправки
      </div>

      {channels.length === 0 ? (
        <div className="be-bot-note">
          Каналы не добавлены. Перейдите в раздел{' '}
          <a href="/mailings" style={{ color: 'var(--color-orange)' }}>Рассылки</a>{' '}
          и добавьте каналы.
        </div>
      ) : (
        <>
          <div className="be-audience-options">
            <label
              className={`be-audience-option ${selectedIds.length === channels.length ? 'be-audience-option--active' : ''}`}
              onClick={onSelectAll}
              style={{ cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                className="be-checkbox"
                checked={selectedIds.length === channels.length && channels.length > 0}
                readOnly
              />
              <div className="be-audience-option-info">
                <span className="be-audience-option-label">Все каналы ({channels.length})</span>
              </div>
            </label>

            {channels.map(ch => (
              <label
                key={ch.id}
                className={`be-audience-option ${selectedIds.includes(ch.chatId) ? 'be-audience-option--active' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  className="be-checkbox"
                  checked={selectedIds.includes(ch.chatId)}
                  onChange={() => onToggle(ch.chatId)}
                />
                <div className="be-audience-option-info">
                  <span className="be-audience-option-label">{ch.title}</span>
                  <span className="be-audience-option-desc">{ch.chatId}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="be-audience-summary">
            <span>
              Выбрано каналов: <b>{selectedIds.length}</b> из {channels.length}
            </span>
          </div>
        </>
      )}

      <div className="be-bot-note">
        Сообщение будет отправлено в выбранные Telegram каналы.
        Бот должен быть администратором каналов с правом публикации.
      </div>
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

  // Каналы
  const [channels, setChannels] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  // Состояние отправки
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Загружаем каналы
  useEffect(() => {
    api.get('/api/broadcasts/channels')
      .then(r => r.json())
      .then(data => {
        setChannels(data);
        // Автоматически выбираем все каналы
        setSelectedIds(data.map(c => c.chatId));
      })
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, []);

  const toggleChannel = (chatId) => {
    setSelectedIds(prev =>
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === channels.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(channels.map(c => c.chatId));
    }
  };

  // Форматируем содержимое в текст
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
    if (!selectedIds.length) {
      alert('Выберите хотя бы один канал!');
      return;
    }

    // Валидация и построение body
    const body = { channelIds: selectedIds };

    if (type === 'poll') {
      const opts = pollOptions.filter(o => o.trim());
      if (!question.trim()) { alert('Введите вопрос опроса!'); return; }
      if (opts.length < 2) { alert('Добавьте минимум 2 варианта ответа!'); return; }
      body.poll = { question: question.trim(), options: opts, type: 'regular' };
    } else if (type === 'quiz') {
      const opts = quizOptions.filter(o => o.trim());
      if (!question.trim()) { alert('Введите вопрос викторины!'); return; }
      if (opts.length < 2) { alert('Добавьте минимум 2 варианта ответа!'); return; }
      if (correctIndex >= opts.length) { alert('Выберите правильный ответ!'); return; }
      body.poll = { question: question.trim(), options: opts, type: 'quiz', correctIndex };
    } else {
      const msgText = buildText().trim();
      if (!msgText) { alert('Заполните содержимое рассылки!'); return; }
      body.text = msgText;
    }

    setSending(true);
    setSendResult(null);

    try {
      const r = await api.post('/api/broadcasts', body);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);

      setSendResult({
        success: true,
        count: data.success,
        total: data.total,
        channels: data.channels || [],
      });
    } catch (e) {
      setSendResult({ error: e.message });
    } finally {
      setSending(false);
    }
  }, [type, buildText, selectedIds, question, pollOptions, quizOptions, correctIndex]);

  // Успешная отправка — показываем результат
  if (sendResult?.success) {
    return (
      <div className="be-container">
        <div className="be-success-screen">
          <div className="be-success-icon">
            <CheckCircle size={52} />
          </div>
          <h2 className="be-success-title">Рассылка отправлена!</h2>
          <p className="be-success-desc">
            Сообщение доставлено в <b>{sendResult.count}</b> из <b>{sendResult.total}</b> каналов.
            {sendResult.channels.length > 0 && (
              <>
                <br />
                Каналы: {sendResult.channels.join(', ')}
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

        {/* Правая колонка — каналы */}
        <ChannelsPanel
          channels={channels}
          selectedIds={selectedIds}
          onToggle={toggleChannel}
          onSelectAll={selectAll}
          loading={channelsLoading}
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
          disabled={sending || channelsLoading || !selectedIds.length}
        >
          {sending ? <Loader size={16} className="be-spin" /> : <Send size={16} />}
          {sending ? 'Отправка...' : 'Опубликовать'}
        </button>
      </div>
    </div>
  );
}
