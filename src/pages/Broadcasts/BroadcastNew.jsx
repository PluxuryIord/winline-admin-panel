import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, BarChart2, Trophy, HelpCircle, ChevronRight } from 'lucide-react';
import './BroadcastNew.css';

const TYPES = [
  {
    key: 'post',
    icon: FileText,
    title: 'Пост',
    description: 'Текстовое сообщение с медиафайлами, отправляется выбранной аудитории',
  },
  {
    key: 'poll',
    icon: BarChart2,
    title: 'Опрос',
    description: 'Голосование с несколькими вариантами ответа, автоматическая статистика',
  },
  {
    key: 'contest',
    icon: Trophy,
    title: 'Конкурс с рандомайзером',
    description: 'Участники вступают в конкурс, победитель выбирается случайно',
  },
  {
    key: 'quiz',
    icon: HelpCircle,
    title: 'Викторина с вариантами ответов и рандомайзером',
    description: 'Вопрос с правильным ответом, среди правильно ответивших разыгрывается приз',
  },
];

export default function BroadcastNew() {
  const navigate = useNavigate();

  return (
    <div className="bn-container">
      <div className="bn-header">
        <button className="bn-back-btn" onClick={() => navigate('/mailings')}>
          <ArrowLeft size={18} />
          Назад
        </button>
        <h1 className="bn-title">Создать рассылку</h1>
        <p className="bn-subtitle">Выберите тип контента</p>
      </div>

      <div className="bn-types-grid">
        {TYPES.map(({ key, icon: Icon, title, description }) => (
          <button
            key={key}
            className="bn-type-card"
            onClick={() => navigate(`/mailings/editor/${key}`)}
          >
            <div className="bn-type-icon-wrap">
              <Icon size={28} />
            </div>
            <div className="bn-type-info">
              <span className="bn-type-title">{title}</span>
              <span className="bn-type-desc">{description}</span>
            </div>
            <ChevronRight size={20} className="bn-type-arrow" />
          </button>
        ))}
      </div>
    </div>
  );
}
