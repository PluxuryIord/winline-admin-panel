import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, BarChart2, Trophy, HelpCircle,
  Plus, Trash2, Image, Paperclip, Check, Shuffle,
  ChevronDown, ChevronUp, Send
} from 'lucide-react';
import './BroadcastEditor.css';

/* ── метаданные типов ── */
const TYPE_META = {
  post:    { icon: FileText,  label: 'Пост' },
  poll:    { icon: BarChart2, label: 'Опрос' },
  contest: { icon: Trophy,    label: 'Конкурс с рандомайзером' },
  quiz:    { icon: HelpCircle, label: 'Викторина с рандомайзером' },
};

const MOCK_BOTS = ['Winline Partners Bot', 'Winline Sport Bot', 'Winline VIP Bot'];
const MOCK_CHANNELS = [
  { id: 'news',  label: '#winline_news' },
  { id: 'sport', label: '#winline_sport' },
  { id: 'vip',   label: '#winline_vip' },
  { id: 'promo', label: '#winline_promo' },
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

/* ════════ Правая панель — фильтры ════════ */
function FiltersPanel({ selectedBot, onBot, selectedChannels, onChannels }) {
  const [botsOpen, setBotsOpen] = useState(true);
  const [channelsOpen, setChannelsOpen] = useState(true);

  const toggleChannel = (id) => {
    onChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="be-filters-panel">
      <div className="be-filters-title">Аудитория</div>

      {/* По боту */}
      <div className="be-filter-group">
        <button className="be-filter-group-header" onClick={() => setBotsOpen(o => !o)}>
          <span>Бот</span>
          {botsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {botsOpen && (
          <div className="be-filter-group-body">
            {MOCK_BOTS.map(bot => (
              <label key={bot} className="be-radio-row">
                <input
                  type="radio"
                  name="bot"
                  className="be-radio"
                  checked={selectedBot === bot}
                  onChange={() => onBot(bot)}
                />
                <span>{bot}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* По каналам */}
      <div className="be-filter-group">
        <button className="be-filter-group-header" onClick={() => setChannelsOpen(o => !o)}>
          <span>Каналы</span>
          {channelsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {channelsOpen && (
          <div className="be-filter-group-body">
            {MOCK_CHANNELS.map(ch => (
              <label key={ch.id} className="be-checkbox-row">
                <input
                  type="checkbox"
                  className="be-checkbox"
                  checked={selectedChannels.includes(ch.id)}
                  onChange={() => toggleChannel(ch.id)}
                />
                <span className="be-channel-label">{ch.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="be-audience-summary">
        {selectedChannels.length === 0
          ? <span className="be-audience-warn">Выберите хотя бы один канал</span>
          : <span>Каналов выбрано: <b>{selectedChannels.length}</b></span>
        }
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

  // Состояние фильтров
  const [selectedBot, setSelectedBot] = useState(MOCK_BOTS[0]);
  const [selectedChannels, setSelectedChannels] = useState([]);

  const handlePublish = useCallback(() => {
    alert('Рассылка опубликована!');
    navigate('/mailings');
  }, [navigate]);

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

          {/* Кнопка загрузки материалов */}
          <div className="be-upload-row">
            <button className="be-upload-btn">
              <Image size={16} /> Загрузить изображение
            </button>
            <button className="be-upload-btn">
              <Paperclip size={16} /> Прикрепить файл
            </button>
          </div>
        </div>

        {/* Правая колонка — фильтры */}
        <FiltersPanel
          selectedBot={selectedBot}
          onBot={setSelectedBot}
          selectedChannels={selectedChannels}
          onChannels={setSelectedChannels}
        />
      </div>

      {/* Подвал */}
      <div className="be-footer">
        <button className="be-draft-btn" onClick={() => navigate('/mailings')}>
          Сохранить черновик
        </button>
        <button
          className="be-publish-btn"
          onClick={handlePublish}
          disabled={selectedChannels.length === 0}
        >
          <Send size={16} />
          Опубликовать
        </button>
      </div>
    </div>
  );
}
