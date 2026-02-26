import { useState } from 'react';
import DOMPurify from 'dompurify'; // Импортируем наш щит от XSS
import { 
  Folder, FileText, Plus, Edit3, Save, 
  ChevronRight, ChevronDown, 
  Image as ImageIcon, Video, Link as LinkIcon, Bold, Italic, AlignLeft
} from 'lucide-react';
import './KnowledgeBase.css';

// Наши фейковые данные. Здесь мы используем HTML-теги для форматирования.
const mockData = [
  {
    id: 1,
    title: 'Обзор личного кабинета',
    content: `
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image7.png" alt="Обзор личного кабинета" />
      <p>На боковой панели слева представлены разделы личного кабинета: дашборд, офферы, отчеты по статистике, инструменты, отчет по конверсиям, ваши площадки, тикеты для обращений и база знаний.</p>
      <p>На верхней панели Вы можете найти: контакт для связи с менеджером, раздел с вашими личными данными, раздел с финансовыми данными.</p>
      
      
      <p><em>Выберите интересующий вас подраздел в меню слева для детального изучения.</em></p>
    `,
    subtopics: [
      {
        id: 11,
        title: 'Раздел Dashboard',
        content: `
          <h3>Раздел Dashboard</h3>
          <p>Это панель, которая схематично отображает данные по вашему трафику из статистики за определенный промежуток времени.</p>
          <p>Нужный временной период можно выставить в разделе Дата-создания, а также, нажав на Фильтры, можно отфильтровать по площадкам, офферам, тегам и задать группировку.</p>
          <p><strong>Важно:</strong> не забудьте нажать кнопку "Применить".</p>
          
          <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image11.png" alt="Фильтры дашборда" />
        `
      },
      {
        id: 12,
        title: 'Раздел Офферы',
        content: `
          <h3>Раздел Офферы</h3>
          <p>Здесь находятся все офферы, которые Вам доступны в партнерской программе.</p>
          <p>Чтобы зайти в оффер и детально изучить всю информацию по условиям, ставкам, продукту, взять ссылку, креативы и т.д., надо нажать на карточку оффера.</p>
        `
      },
      {
        id: 13,
        title: 'Отчет посещаемости',
        content: `
          <h3>Раздел Отчет посещаемости</h3>
          <p>Здесь Вы можете отслеживать более подробно статистику по Вашим рекламным кампаниям и трафику в целом. Статистика по умолчанию собирается в разрезе дат.</p>
          
          <h3>Основные метрики в отчете:</h3>
          <ul>
            <li><strong>Дата</strong> - определенный день/неделя/месяц.</li>
            <li><strong>Клик</strong> - клик/переход по Вашей ссылке заинтересованным пользователем на сайт WINLINE.</li>
            <li><strong>Регистрация игрока</strong> - пройденная регистрация новым пользователем на сайте WINLINE.</li>
            <li><strong>Первый депозит</strong> - первое пополнение баланса новым игроком от 500 рублей на сайте/приложении WINLINE.</li>
            <li><strong>Второй депозит</strong> - повторное пополнение баланса новым игроком.</li>
            <li><strong>Ревшара</strong> - сумма проигранных/выигранных денег игроком, которого Вы привели.</li>
            <li><strong>Комиссия</strong> - сумма заработанных денег Вами с приведенного трафика.</li>
          </ul>

          <h3>Статусы комиссий:</h3>
          <p><strong>Подтверждена / в обработке / аннулирована</strong> – это статусы по оплате конверсий (первых депозитов), которые утверждаются WINLINE на сверке.</p>
          <p><em>Пример:</em> если комиссия по первым депозитам в статусе <strong>в обработке</strong>, значит трафик еще находится в холде (на проверке у WINLINE). После сверки комиссия переходит в статус <strong>Подтверждена</strong> или <strong>Аннулирована</strong>. Оплачиваются только подтвержденные конверсии.</p>

          <h3>Формулы и показатели:</h3>
          <ul>
            <li><strong>CR% / Click2Reg</strong> - соотношение регистраций к кликам. <em>(Click2Reg% = кол-во регистраций / кол-во кликов * 100%)</em></li>
            <li><strong>CR% / Reg2FTD</strong> - соотношение первых депозитов к объему регистраций. <em>(Reg2FTD% = кол-во первых депозитов / кол-во регистраций * 100%)</em></li>
            <li><strong>CR% / FTD2STD%</strong> - соотношение вторых депозитов к количеству первых депозитов.</li>
          </ul>

          <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image14.png" alt="Пример статистики" />
          
          <h3>Фильтры в отчете:</h3>
          <p>В отчете можно развернуть фильтры, нажав на кнопку <strong>Фильтры</strong>.</p>
          <ul>
            <li><strong>Дата создания</strong> - временной период.</li>
            <li><strong>По площадкам</strong> - выбор конкретной площадки.</li>
            <li><strong>По офферам</strong> - выбор конкретного оффера.</li>
            <li><strong>По тегам и Sub</strong> - фильтрация по реферальным хвостам и тегам.</li>
            <li><strong>По целевому URL</strong> - выбор конечного лендинга.</li>
            <li><strong>Группировка</strong> - просмотр статистики в разрезе дней/недель/месяцев.</li>
          </ul>
          
          <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image15.png" alt="Фильтры" />

          <h3>Доп. фильтры и Экспорт:</h3>
          <p>Над статистикой в правом углу можно найти доп. фильтры (Офферы, площадки, Sub и т.д.). Также здесь находится кнопка <strong>Экспорт</strong> для скачивания отчета в формате CSV или XLSX.</p>
          
          <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image13.png" alt="Экспорт отчета" />
        `
      },
      {
        id: 14,
        title: 'Инструменты (Баннеры и Постбеки)',
        content: `
          <h3>Раздел Инструменты</h3>
          <p><strong>Баннеры</strong> - тут лежат актуальные баннеры по офферу, которые вы можете взять.</p>
          
          <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image2.png" alt="Баннеры" />

          <p><strong>Постбэки</strong> - здесь можно настроить постбэк, нажав на кнопку <strong>Создать</strong>.</p>
          
          <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image10.png" alt="Создание постбека" />
        `
      },
      {
        id: 15,
        title: 'Конверсии',
        content: `
          <h3>Раздел Конверсии</h3>
          <p>В данном разделе можно смотреть статистику по конверсиям, а также скачать отчет в разрезе конверсий (игроков).</p>
          <p>Если нужно посмотреть статистику за определенный период, снизу есть фильтр по времени - <strong>Дата создания</strong>.</p>
          
          <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image6.png" alt="Конверсии" />
        `
      },
      {
        id: 16,
        title: 'Площадки',
        content: `
          <h3>Раздел Площадки</h3>
          <p><strong>Площадка</strong> - это любой интернет-ресурс, где размещается реклама.</p>
          <p>В данном разделе Вам нужно создать площадку и указать всю информацию, как Вы планируете привлекать трафик для WINLINE. Без площадки Вы не сможете пройти модерацию и получить доступ к офферу, где берется реф.ссылка.</p>
          <p>При создании новой площадки потребуется указать: <em>Название, Тип, Ссылку на ресурс</em> и <em>Среднее количество посетителей в месяц</em>.</p>
        `
      },
      {
        id: 17,
        title: 'Тикеты (Поддержка)',
        content: `
          <h3>Раздел Тикеты</h3>
          <p>Здесь Вы можете обратиться в поддержку WINLINE Partners, задав любой вопрос. Обязательно выбирайте <strong>категорию</strong>, к которой относится Ваш вопрос и при необходимости прикрепляйте скрины.</p>
        `
      }
    ]
  },
  {
    id: 2,
    title: 'Начало работы. Как получить ссылку',
    content: `
      <p>Ниже вы найдете пошаговую инструкцию подключения к офферу.</p>
      
      <h3>Шаг 1. Создание площадки</h3>
      <p>Чтобы подключить оффер WINLINE сначала нужно создать площадку, перейдя в раздел "Площадки" и нажав кнопку <strong>Создать</strong>.</p>
      
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image16.png" alt="Создание площадки" />
      
      <p>Потребуется указать: <em>Название, Тип, Ссылку на ресурс</em> и <em>Среднее количество посетителей</em>. Уникальный ID генерируется автоматически, но вы можете указать свой. После заполнения жмем <strong>Сохранить</strong>.</p>
      
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image1.png" alt="Настройки площадки" />

      <h3>Шаг 2. Модерация</h3>
      <p>Для успешного прохождения модерации вашей площадки, нужно написать нашей команде в телеграмм <strong>@Winline_affiliate</strong> и обсудить все условия работы с менеджером.</p>

      <h3>Шаг 3. Подключение к офферу</h3>
      <p>После успешного прохождения модерации, нужно зайти в карточку оффера в разделе Офферы и подключить площадку. Нажать <strong>Подключить площадку</strong>, выбрать свою и подтвердить.</p>
      
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image4.png" alt="Подключение площадки" />

      <h3>Шаг 4. Генерация ссылки</h3>
      <p>Чтобы взять реферальную ссылку, нужно нажать в карточке оффера <strong>«Генератор ссылок»</strong>.</p>
      
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image3.png" alt="Генератор ссылок" />
      
      <p>Здесь вы можете выбрать любой доступный лендинг, куда хотите привлекать трафик.</p>
      
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image8.png" alt="Выбор лендинга" />
      
      <ul>
        <li><strong>Промокод:</strong> Если у Вас есть промокод, его нужно зашить в ссылку, написав в поле Промокод. Обязательно писать большими буквами, латиницей.</li>
        <li><strong>SUB:</strong> Для детального разграничения статистики можно использовать SUB (любое значение на английском).</li>
      </ul>
      <p>После всех настроек нажимаем кнопку <strong>Генерировать</strong> и копируем готовую ссылку.</p>
      
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image9.png" alt="Готовая ссылка" />
    `,
    subtopics: []
  },
  {
    id: 3,
    title: 'Как настроить постбеки?',
    content: `
      <p>Для настройки постбэков нужно зайти в раздел <strong>Инструменты</strong>, подраздел <strong>Постбеки</strong> и нажать кнопку <strong>Создать</strong>.</p>
      
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image17.png" alt="Создать постбек" />
      
      <h3>Рассмотрим настройку на примере действия - Регистрация:</h3>
      <ol>
        <li><strong>Площадки</strong> - выбираете ту площадку, по которой сгенерирована реф.ссылка.</li>
        <li><strong>Офферы</strong> - выбрать доступный оффер WINLINE.</li>
        <li><strong>Тип целевого действия</strong> - действие, которое вы хотите получать в свой трекер (например: регистрация игрока).</li>
        <li><strong>События</strong> - какое событие получать. Для регистрации ставим <em>Конверсия создана</em> (лид отбился в статистике).</li>
        <li><strong>Метод</strong> - Метод GET передаёт параметры в хвосте URL, а POST - в теле запроса. По умолчанию оставляем GET.</li>
        <li><strong>Postback URL</strong> - На этот URL мы будем слать запросы. Используйте макросы для подстановки значений.</li>
      </ol>
      
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image12.png" alt="Настройка постбека" />
      
      <p>Внизу есть список макросов, чтобы собрать Postback URL.</p>
      
      <img src="https://s3.twcstorage.ru/7fee0b4c-ab3c-4edd-a8f4-ee0a65847a04/image5.png" alt="Список макросов" />
      
      <p>После всех настроек нажимаем <strong>Сохранить</strong>. Чтобы убедиться, что все настроено корректно, нужно взять свою ссылку в оффере и сделать тестовую регистрацию.</p>
    `,
    subtopics: []
  }
];

export default function KnowledgeBase() {
  const [expandedFolders, setExpandedFolders] = useState([1]);
  const [activeItem, setActiveItem] = useState({ type: 'topic', id: 1, data: mockData[0] });
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const toggleFolder = (id) => {
    if (expandedFolders.includes(id)) {
      setExpandedFolders(expandedFolders.filter(folderId => folderId !== id));
    } else {
      setExpandedFolders([...expandedFolders, id]);
    }
  };

  const handleSelectTopic = (topic) => {
    setActiveItem({ type: 'topic', id: topic.id, data: topic });
    setIsEditing(false);
    if (!expandedFolders.includes(topic.id)) {
      setExpandedFolders([...expandedFolders, topic.id]);
    }
  };

  const handleSelectSubtopic = (subtopic, parentTopic) => {
    setActiveItem({ type: 'subtopic', id: subtopic.id, data: subtopic, parentTitle: parentTopic.title });
    setIsEditing(false);
  };

  const handleEditClick = () => {
    setEditContent(activeItem.data.content);
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    // В реальном приложении отправляем editContent на сервер.
    // Пока просто обновляем локальный стейт для презентации:
    setActiveItem({
      ...activeItem,
      data: { ...activeItem.data, content: editContent }
    });
    setIsEditing(false);
  };

  return (
    <div className="kb-container">
      
      {/* ЛЕВАЯ КОЛОНКА */}
      <div className="kb-sidebar">
        <div className="kb-sidebar-header">
          <h3>Разделы Wiki</h3>
          <button className="add-topic-btn" title="Создать новую тему">
            <Plus size={18} />
          </button>
        </div>

        <div className="kb-topic-list">
          {mockData.map((topic) => {
            const isFolderExpanded = expandedFolders.includes(topic.id);
            const isTopicActive = activeItem.type === 'topic' && activeItem.id === topic.id;

            return (
              <div key={topic.id}>
                <div 
                  className={`kb-topic-item ${isTopicActive ? 'active' : ''}`}
                  onClick={() => handleSelectTopic(topic)}
                >
                  <span onClick={(e) => { e.stopPropagation(); toggleFolder(topic.id); }}>
                    {isFolderExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <Folder size={18} color={isTopicActive ? "#FF7E00" : "currentColor"} />
                  <span style={{ flex: 1 }}>{topic.title}</span>
                </div>

                {isFolderExpanded && topic.subtopics.length > 0 && (
                  <div className="kb-subtopics">
                    {topic.subtopics.map(sub => {
                      const isSubActive = activeItem.type === 'subtopic' && activeItem.id === sub.id;
                      return (
                        <div 
                          key={sub.id}
                          className={`kb-subtopic-item ${isSubActive ? 'active' : ''}`}
                          onClick={() => handleSelectSubtopic(sub, topic)}
                        >
                          <FileText size={14} />
                          {sub.title}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ПРАВАЯ КОЛОНКА */}
      <div className="kb-content">
        <div className="kb-content-header">
          <div>
            <div className="kb-breadcrumbs">
              База знаний {activeItem.type === 'subtopic' && <> <ChevronRight size={12} /> {activeItem.parentTitle} </>}
            </div>
            <h2>{activeItem.data.title}</h2>
          </div>

          {!isEditing ? (
            <button className="kb-edit-btn" onClick={handleEditClick}>
              <Edit3 size={18} /> Редактировать
            </button>
          ) : (
            <button className="kb-edit-btn" style={{ backgroundColor: '#00ff88', color: '#000' }} onClick={handleSaveClick}>
              <Save size={18} /> Сохранить
            </button>
          )}
        </div>

        {!isEditing ? (
          <div 
            className="kb-article html-content" 
            // МАКСИМАЛЬНАЯ БЕЗОПАСНОСТЬ: Очищаем HTML перед рендером
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeItem.data.content) }} 
          />
        ) : (
          <div className="kb-editor">
            <div className="editor-toolbar">
              <button className="toolbar-btn" title="Жирный"><Bold size={16} /></button>
              <button className="toolbar-btn" title="Курсив"><Italic size={16} /></button>
              <button className="toolbar-btn" title="Выравнивание"><AlignLeft size={16} /></button>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 8px', alignSelf: 'center' }}></div>
              <button className="toolbar-btn" title="Добавить ссылку"><LinkIcon size={16} /></button>
              <button className="toolbar-btn" title="Добавить картинку"><ImageIcon size={16} /></button>
              <button className="toolbar-btn" title="Добавить видео"><Video size={16} /></button>
            </div>
            <textarea 
              className="editor-textarea"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Введите HTML контент..."
            />
          </div>
        )}
      </div>

    </div>
  );
}