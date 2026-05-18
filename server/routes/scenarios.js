import { Router } from 'express';
import dbPool from '../config/db.js';
import { BOT_API_URL, BOT_API_KEY } from '../config/env.js';
import { logAudit } from '../services/auditLog.js';
import { createDailySnapshot } from '../services/snapshots.js';

const router = Router();

// ─── Notify bot to reload texts after save ──────────────────────────────────
async function notifyBotReload() {
  if (!BOT_API_URL) return;
  try {
    const resp = await fetch(`${BOT_API_URL}/reload-texts`, {
      headers: BOT_API_KEY ? { 'X-API-Key': BOT_API_KEY } : {},
    });
    const data = await resp.json();
    console.log('[scenarios] Bot reload:', data);
  } catch (err) {
    console.warn('[scenarios] Bot reload failed (non-blocking):', err.message);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadScenarios() {
  const [rows] = await dbPool.query("SELECT id, data FROM texts WHERE category = 'bot_scenarios' LIMIT 1");
  if (!rows.length) return { dbId: null, data: null };
  const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  return { dbId: rows[0].id, data };
}

async function saveScenarios(data, dbId) {
  if (dbId) {
    await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), dbId]);
  }
}

// ─── SEED DATA ──────────────────────────────────────────────────────────────

const SEED_DATA = {
  screens: {
    start_menu: {
      title: 'Стартовое меню',
      description: 'Первый экран для новых пользователей',
      messages: {
        welcome: {
          label: 'Приветственное сообщение',
          text: '<b>Привет, {name}! Этот бот поможет тебе зарегистрироваться в качестве партнёра в нашей партнерской программе WINLINE PARTNERS, даст возможность получать актуальные новости и предложения, а также участвовать в мероприятиях!</b>',
        },
      },
      buttons: {
        _order: ['btn_partner', 'btn_register'],
        btn_partner: { label: 'Я уже являюсь партнёром', action: 'callback:client_existing_partner' },
        btn_register: { label: 'Пройти регистрацию', action: 'callback:client_new_partner' },
      },
    },
    registration_flow: {
      title: 'Регистрация',
      description: 'Инструкция по регистрации нового партнёра',
      messages: {
        instructions: {
          label: 'Инструкция по регистрации',
          text: '<b>Чтобы стать партнёром WINLINE PARTNERS, Вам нужно перейти на <a href="https://partners.winline.ru">официальный сайт партнерской программы</a> и зарегистрироваться.</b>\n\nПри регистрации укажите следующую информацию:\n• имя и фамилию;\n• свой email;\n• пароль.\n\nПосле заполнения заявки нажмите кнопку «Регистрация» и активируйте аккаунт по email.',
        },
      },
      buttons: {
        _order: ['btn_register_link', 'btn_already', 'btn_back'],
        btn_register_link: { label: 'Пройти регистрацию', action: 'url:https://partners.winline.ru' },
        btn_already: { label: 'Я уже зарегистрирован', action: 'callback:client_already_registered' },
        btn_back: { label: '🔙 Назад', action: 'callback:client_back_to_start' },
      },
    },
    auth_flow: {
      title: 'Авторизация',
      description: 'Ввод email для авторизации',
      messages: {
        auth_screen: {
          label: 'Экран авторизации',
          text: '<b>Для доступа к функционалу бота необходимо авторизоваться с помощью почты, указанной при регистрации на платформе</b>',
        },
        email_prompt: {
          label: 'Запрос email',
          text: '<b>📧 Введите email, указанный при регистрации на платформе</b>',
        },
        email_error: {
          label: 'Ошибка формата email',
          text: '<b>❌ Некорректный формат email\n\n📧 Введите email, указанный при регистрации на платформе</b>',
        },
        auth_success: {
          label: 'Успешная авторизация',
          text: '<b>✅ Вы авторизованы</b>\n\n📧 <b>Email:</b> {email}',
        },
      },
      buttons: {
        _order: ['btn_auth', 'btn_back'],
        btn_auth: { label: 'Авторизоваться', action: 'callback:client_auth_email' },
        btn_back: { label: '🔙 Назад', action: 'callback:client_back_to_start' },
      },
    },
    main_menu: {
      title: 'Главное меню',
      description: 'Меню авторизованного пользователя',
      messages: {},
      buttons: {
        _order: ['btn_kb', 'btn_offer', 'btn_promo', 'btn_chat', 'btn_socials', 'btn_event', 'btn_logout'],
        btn_kb: { label: 'База знаний', action: 'callback:client_knowledge_base', targetScreen: 'knowledge_base' },
        btn_offer: { label: 'Информация по офферу', action: 'callback:client_offers' },
        btn_promo: { label: 'Актуальные крео и лендинги', action: 'callback:client_promo' },
        btn_chat: { label: 'Чат с менеджером', action: 'url:https://t.me/winline_affiliate' },
        btn_socials: { label: 'Наши соц. сети', action: 'callback:client_socials' },
        btn_event: { label: 'Я на мероприятии!', action: 'callback:client_at_event', targetScreen: 'event_partner_check' },
        btn_logout: { label: '🚪 Выйти из аккаунта', action: 'callback:client_logout', locked: true },
      },
    },
    offer_page: {
      title: 'Информация по офферу',
      description: 'Детали оффера для партнёров',
      messages: {
        offer_text: {
          label: 'Текст оффера',
          text: '<b>📚 Информация по офферу</b>\n\n<tg-emoji emoji-id="5249137793120107984">🔥</tg-emoji> <b>Тестовая капа для оценки качества трафика:</b> 20 FTD (для новых партнеров)\n\n<b>Оплачиваемая цель:</b> новый пользователь, который внес депозит от 500 рублей единым платежом (FTD)\nBaseline – 500 р\nМин.деп – 100 р\nЦелевая аудитория: мужчины, женщины 18+\nАтрибуция – по Last Click\nHold (проверка трафика) – 30 дней\nВыплата средств – 1 раз в месяц (после сверки)\n\nМинимальная сумма для вывода средств от 100 000р\n\n<tg-emoji emoji-id="5249137793120107984">🔥</tg-emoji> <b>ВАЖНО!</b>\nWINLINE осуществляет анализ качества приведенного трафика, который учитывает множество факторов:\n— Оценка трафика от службы безопасности (мошенник, вилочник, бонусхантер и др.)\n— Проверка на фрод\n— Паттерн поведения игроков, которых привел партнер\n— Сумма вводов/ставок и т.д\nСтрого запрещено: фрод, мультиаккаунтинг, бонусхантинг, мотивированный, схемный трафик.\n\nЗапрещённые тематики: adult контент, оружие, насилие, политика, детский контент и фигурирование детей рядом с брендом, трансляция лёгкого заработка, шокирующий контент, треш контент.\n\n<tg-emoji emoji-id="5249137793120107984">🔥</tg-emoji> <b>Рекламодатель имеет право пересмотреть условия оплаты или не оплатить трафик в случае обнаружения нарушений.</b>',
        },
      },
      buttons: {
        _order: ['btn_back'],
        btn_back: { label: '🔙 Меню', action: 'callback:client_back_menu' },
      },
    },
    knowledge_base: {
      title: 'База знаний',
      description: 'Редактируется в разделе «База знаний»',
      readOnly: true,
      messages: {
        info_text: {
          label: 'Информация',
          text: '📚 Содержимое базы знаний управляется в отдельном разделе панели — «База знаний». Здесь отображается только связь с другими экранами.',
        },
      },
      buttons: {
        _order: ['btn_back'],
        btn_back: { label: '🔙 Меню', action: 'callback:client_back_menu', locked: true },
      },
    },
    promo_page: {
      title: 'Актуальные крео и лендинги',
      description: 'Промо-материалы и лендинги',
      messages: {
        promo_text: {
          label: 'Текст промо',
          text: '<b>🎨 Актуальные крео и лендинги</b>\n\n🌐 <b>Список актуальных лендингов</b>\n\nЗдесь представлены лендинги, на которые вы можете вести трафик.\n\nДля получения ссылки с вашими партнерскими метками, нужно зайти в карточку оффера в раздел "Генератор ссылок".\n\n📋 <b>Регистрация:</b>\n• <a href="https://winline.ru/registration/">Страница регистрации</a>\n• <a href="https://winline.ru/registration?utm=cyber">Страница регистрации CYBER</a>\n• <a href="https://winline.ru/freebet/">Фрибет 3 000 руб.</a>\n• <a href="https://winline.ru/programloyalty">Новая Программа Лояльности</a>\n\n🎰 <b>Лотереи и игры:</b>\n• <a href="https://winline.ru/lottery">Лотереи</a>\n• <a href="https://winline.ru/games/lottery">Лотереи (Регистрация)</a>\n• <a href="https://winline.ru/games">Быстрые игры</a>\n\n📱 <b>Мобильные:</b>\n• <a href="https://m.winline.ru/auth/registration">Мобильная страница регистрации</a>\n• <a href="https://m.winline.ru/registration?v=1">Мобильная регистрация (фрибет)</a>\n• <a href="https://m.winline.ru/registration?v=4">Регистрация без лого 1</a>\n• <a href="https://m.winline.ru/registration?v=5">Регистрация без лого 2</a>\n• <a href="https://m.winline.ru/registration?v=6">Регистрация без лого 3</a>\n\n📺 <b>Видеотрансляции:</b>\n• <a href="https://winline.ru/video/">Все трансляции</a>\n• <a href="https://winline.ru/video/football/">Футбол</a>\n• <a href="https://winline.ru/video/tennis/">Теннис</a>\n• <a href="https://winline.ru/video/xokkej/">Хоккей</a>\n• <a href="https://winline.ru/video/basketball/">Баскетбол</a>\n• <a href="https://winline.ru/video/rpl/">РПЛ</a>\n\n———————————————\n\n<b>Актуальные промо-материалы</b>\n\nПерейдите по ссылке для просмотра актуальных баннеров и креативов 👇',
        },
      },
      buttons: {
        _order: ['btn_creatives', 'btn_back'],
        btn_creatives: { label: 'Открыть креативы', action: 'url:https://winline.tv/m/banner' },
        btn_back: { label: '🔙 Меню', action: 'callback:client_back_menu' },
      },
    },
    socials_page: {
      title: 'Наши соц. сети',
      description: 'Социальные сети и каналы',
      messages: {
        socials_text: {
          label: 'Текст соцсетей',
          text: '<b>📱 Наши соц. сети</b>\n\nСкорее подписывайся на наш официальный канал в Telegram, чтобы быть в курсе новостей 👇',
        },
      },
      buttons: {
        _order: ['btn_channel', 'btn_back'],
        btn_channel: { label: '@WinlinePartners', action: 'url:https://t.me/WinlinePartners' },
        btn_back: { label: '🔙 Меню', action: 'callback:client_back_menu' },
      },
    },
    // ── Сценарий 3: Мероприятие — визуальные блоки потока ──
    event_intro: {
      title: 'Интро — мероприятие',
      description: 'Стартовый экран сценария 3. Показывается до вопроса «Вы работаете с WL?» с приветственным баннером и кнопкой «Далее». Картинка прикрепляется через media к сообщению welcome.',
      scenario: 3,
      messages: {
        welcome: {
          label: 'Приветственный текст',
          text: '<b>Хочешь получить эксклюзивный мерч, стать партнёром и зарабатывать вместе с WINLINE PARTNERS?</b>\n\nРегистрируйся и заполняй анкету! После регистрации, с тобой свяжется наш Affiliate-менеджер @winline_affiliate и расскажет об условиях.',
        },
      },
      buttons: {
        _order: ['btn_next'],
        btn_next: { label: 'Далее', action: 'callback:event_v2_intro_next', targetScreen: 'event_partner_check', locked: true },
      },
    },
    event_partner_check: {
      title: 'Вы работаете с WINLINE PARTNERS?',
      description: 'Выбор: действующий партнёр / новый',
      scenario: 3,
      messages: {
        prompt: { label: 'Вопрос', text: '<b>Вы уже работаете с WINLINE PARTNERS?</b>' },
      },
      buttons: {
        _order: ['btn_yes', 'btn_no'],
        btn_yes: { label: 'Работаю с WINLINE PARTNERS', action: 'callback:event_v2_partner_yes', targetScreen: 'event_verify_promo', locked: true },
        btn_no: { label: 'Не работаю с WINLINE PARTNERS', action: 'callback:event_v2_partner_no', targetScreen: 'anketa_role', locked: true },
      },
    },
    event_verify_promo: {
      title: 'Верификация — промо',
      description: 'Экран призыва к верификации для действующего партнёра. «Вернуться назад» в боте возвращает в стартовое меню, а не на event_partner_check — поэтому стрелки в диаграмме у этой кнопки нет.',
      scenario: 3,
      messages: {
        promo: {
          label: 'Текст промо',
          text: '<b>Хочешь выиграть 1 из 10 мячей, подписанным легендой футбола и амбассадором WINLINE, Роналдиньо?\n\nВерифицируй свой партнёрский аккаунт</b>',
        },
      },
      buttons: {
        _order: ['btn_verify', 'btn_back'],
        btn_verify: { label: 'Верифицироваться', action: 'callback:event_v2_verify', targetScreen: 'event_email_prompt', locked: true },
        btn_back: { label: 'Вернуться назад', action: 'callback:event_v2_back', locked: true },
      },
    },
    event_email_prompt: {
      title: 'Ввод email',
      description: 'Запрос почты, указанной при регистрации',
      scenario: 3,
      messages: {
        prompt: { label: 'Запрос email', text: '<b>📧 Введите email, указанный при регистрации на платформе</b>' },
      },
      buttons: { _order: [] },
      nextScreen: 'event_email_confirmed',
    },
    event_email_confirmed: {
      title: 'Почта подтверждена',
      description: 'Успешное подтверждение email',
      scenario: 3,
      messages: {
        confirmed: { label: 'Текст', text: '<b>✅ Почта подтверждена</b>' },
      },
      buttons: { _order: [] },
      nextScreen: 'event_site_status',
    },
    event_site_status: {
      title: 'Площадка создана?',
      description: 'Проверка наличия площадки у партнёра',
      scenario: 3,
      messages: {
        prompt: { label: 'Текст', text: '<b>Проверяем, создана ли у вас площадка…</b>' },
      },
      buttons: {
        _order: ['btn_created', 'btn_not_created'],
        btn_created: { label: 'Площадка создана', action: 'callback:noop', targetScreen: 'event_congrats', locked: true },
        btn_not_created: { label: 'Площадка не создана', action: 'callback:noop', targetScreen: 'event_site_wait', locked: true },
      },
    },
    event_site_wait: {
      title: 'Ожидаем создание площадки',
      description: 'Просьба создать площадку и вернуться',
      scenario: 3,
      messages: {
        text: { label: 'Текст', text: '<b>Создай площадку и возвращайся</b>' },
      },
      buttons: {
        _order: ['btn_check'],
        btn_check: { label: 'Проверить', action: 'callback:event_v2_site_check', targetScreen: 'event_site_status', locked: true },
      },
    },
    event_congrats: {
      title: 'Поздравляем — участник розыгрыша',
      description: 'Финал раффла. Кнопка «🎁 Хочу мерч» добавляется ботом динамически и показывается только во флоу «Работаю с WL» (там анкета ещё не пройдена) — для «Не работаю»-флоу мерч-QR выдаётся ещё в конце анкеты, и кнопка скрывается.',
      scenario: 3,
      messages: {
        text: {
          label: 'Текст поздравления',
          text: '<b>Поздравляем, ты стал участником розыгрыша, твой номер №******\n\nИнформация о победителях придёт 27 мая до 15:00</b>',
        },
      },
      buttons: {
        _order: ['btn_merch'],
        btn_merch: {
          label: '🎁 Хочу мерч',
          action: 'callback:event_v2_want_merch',
          targetScreen: 'anketa_role',
          locked: true,
        },
      },
    },
    event_registration_promo: {
      title: 'Регистрация — промо',
      description: 'Экран призыва пройти регистрацию',
      scenario: 3,
      messages: {
        promo: {
          label: 'Текст промо',
          text: '<b>Хочешь выиграть 1 из 10 мячей, подписанным легендой футбола и амбассадором WINLINE, Роналдиньо?\n\nПройди регистрацию на сайте WINLINE PARTNERS</b>',
        },
      },
      buttons: {
        _order: ['btn_register'],
        btn_register: { label: 'Пройти регистрацию', action: 'callback:event_v2_register_instructions', targetScreen: 'event_registration_instructions', locked: true },
      },
    },
    event_registration_instructions: {
      title: 'Инструкция по регистрации',
      description: 'Шаги регистрации на сайте',
      scenario: 3,
      messages: {
        text: {
          label: 'Инструкция',
          text: '<b>Вам нужно перейти на официальный сайт партнерской программы и зарегистрироваться.</b>\n\nПри регистрации укажите следующую информацию:\n• имя и фамилию;\n• свой email;\n• пароль.\n\nПосле заполнения заявки нажмите кнопку «Регистрация» и активируйте аккаунт по email.',
        },
      },
      buttons: {
        _order: ['btn_site', 'btn_registered'],
        btn_site: { label: 'Перейти на сайт', action: 'url:https://p.winline.ru/s/SNwQagLSrj?statid=7723_TGBOT&sub=TGBOT', locked: true },
        btn_registered: { label: 'Я зарегистрирован', action: 'callback:event_v2_registered', targetScreen: 'event_email_prompt', locked: true },
      },
    },

    // Устаревшие экраны event_flow и event_anketa удалены из SEED, потому что
    // фронтовая миграция (BotScenarios.jsx → migrateData) их специально
    // выпиливает при каждом открытии страницы. Если оставить их в сиде —
    // GET-handler auto-merge вернёт их обратно, фронт удалит, и в audit
    // log сыплется ложная пара «Удалён экран Мероприятие/Анкета мероприятия»
    // на каждое открытие /scenarios. См. журнал действий до 2026-05-18.
    // Эти экраны заменены на event_partner_check + anketa_role соответственно.

    // ── Анкета: Ваша роль (точка входа) ──
    anketa_role: {
      title: 'Ваша роль',
      description: 'Выбор роли: трафик / рекламодатель / другое',
      scenario: 5,
      stepType: 'choice',
      answerKey: 'role',
      messages: {
        question_text: { label: 'Вопрос', text: '<b>Ваша роль</b>' },
      },
      buttons: {
        _order: ['btn_traffic', 'btn_advertiser', 'btn_other'],
        btn_traffic: { label: 'Продаю трафик', action: 'callback:anketa_answer', targetScreen: 'anketa_traffic_company' },
        btn_advertiser: { label: 'Рекламодатель', action: 'callback:anketa_answer', targetScreen: 'anketa_adv_company' },
        btn_other: { label: 'Другое', action: 'callback:anketa_answer', targetScreen: 'anketa_other_occupation' },
      },
    },

    // ── Ветка 1: Продаю трафик ──
    anketa_traffic_company: {
      title: 'Название компании / команды',
      description: 'Ветка «Продаю трафик» — шаг 1',
      scenario: 5,
      stepType: 'text_input',
      answerKey: 'company',
      nextScreen: 'anketa_traffic_category',
      messages: {
        question_text: { label: 'Вопрос', text: '<b>Название вашей компании / команды</b>' },
      },
      buttons: { _order: [] },
    },
    anketa_traffic_category: {
      title: 'Категория трафика',
      description: 'Ветка «Продаю трафик» — шаг 2',
      scenario: 5,
      stepType: 'choice',
      answerKey: 'traffic_type',
      messages: {
        question_text: { label: 'Вопрос', text: '<b>Выберите категорию вашего трафика</b>' },
      },
      buttons: {
        _order: ['btn_cpa_net', 'btn_seo_aso_sms', 'btn_cpa', 'btn_push_inapp', 'btn_dsp', 'btn_social', 'btn_influence', 'btn_other_traffic'],
        btn_cpa_net: { label: 'CPA-сеть', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' },
        btn_seo_aso_sms: { label: 'SEO ASO SMS', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' },
        btn_cpa: { label: 'CPA', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' },
        btn_push_inapp: { label: 'PUSH IN APP', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' },
        btn_dsp: { label: 'DSP', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' },
        btn_social: { label: 'SOCIAL', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' },
        btn_influence: { label: 'INFLUENCE', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' },
        btn_other_traffic: { label: 'OTHER', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' },
      },
    },

    // ── Ветка 2: Рекламодатель ──
    anketa_adv_company: {
      title: 'Название компании',
      description: 'Ветка «Рекламодатель» — шаг 1',
      scenario: 5,
      stepType: 'text_input',
      answerKey: 'company',
      nextScreen: 'anketa_adv_position',
      messages: {
        question_text: { label: 'Вопрос', text: '<b>Название вашей компании</b>' },
      },
      buttons: { _order: [] },
    },
    anketa_adv_position: {
      title: 'Должность',
      description: 'Ветка «Рекламодатель» — шаг 2',
      scenario: 5,
      stepType: 'text_input',
      answerKey: 'position',
      nextScreen: 'anketa_sub_check',
      messages: {
        question_text: { label: 'Вопрос', text: '<b>Должность</b>' },
      },
      buttons: { _order: [] },
    },

    // ── Ветка 3: Другое ──
    anketa_other_occupation: {
      title: 'Чем занимаешься?',
      description: 'Ветка «Другое»',
      scenario: 5,
      stepType: 'text_input',
      answerKey: 'occupation',
      nextScreen: 'anketa_sub_check',
      messages: {
        question_text: { label: 'Вопрос', text: '<b>Чем занимаешься?</b>' },
      },
      buttons: { _order: [] },
    },

    // ── Общий: Проверка подписки ──
    anketa_sub_check: {
      title: 'Проверка подписки',
      description: 'Проверка подписки на канал @WinlinePartners',
      scenario: 5,
      stepType: 'subscription_check',
      nextScreen: 'anketa_final',
      messages: {
        check_text: {
          label: 'Текст перед проверкой',
          text: 'Отлично! Осталось подписаться на канал @WinlinePartners и регистрация завершена.\nБудем ждать тебя на стенде Winline Partners, чтобы подарить мерч и обсудить сотрудничество!',
        },
        fail_text: {
          label: 'Текст при неудаче',
          text: 'Не получилось проверить подписку. Ты точно подписан(а) на канал @WinlinePartners?',
        },
        fail_alert: {
          label: 'Всплывающее сообщение',
          text: 'Всплывающее сообщение при отсутствии подписки нужно для визуального акцента',
        },
      },
      buttons: {
        _order: ['btn_check_sub'],
        btn_check_sub: { label: 'Подписка есть!', action: 'callback:anketa_check_sub' },
      },
    },

    // ── Общий: Финальный текст + QR ──
    anketa_final: {
      title: 'Финал + QR код',
      description: 'Итоговое сообщение с условиями и QR-кодом',
      scenario: 5,
      stepType: 'finish',
      messages: {
        final_text: {
          label: 'Итоговый текст',
          text: 'Теперь можешь ознакомиться с <a href="https://winlinepartners.ru">условиями партнёрской программы</a> и получить мерч на стенде - держи для этого персональный QR код.\nПо вопросам сотрудничества пиши нашему Affiliate менеджеру @winline_affiliate',
        },
      },
      buttons: { _order: [] },
      nextScreen: 'event_registration_promo',
    },
    /* logout_screen removed — button stays in main_menu but is locked */
    // ── Сценарий 4: Работа бота в чатах ──
    group_menu: {
      title: 'Меню группы',
      description: 'Главное меню поддержки в группе (/menu)',
      scenario: 4,
      messages: {
        menu_text: { label: 'Текст меню', text: '<b>📋 Меню поддержки WINLINE PARTNERS</b>' },
      },
      buttons: {
        _order: ['btn_kb', 'btn_promo', 'btn_calendar', 'btn_landings'],
        btn_kb: { label: '📚 База знаний', action: 'callback:group_knowledge_base', targetScreen: 'group_kb' },
        btn_promo: { label: '📢 Промо', action: 'callback:group_promo', targetScreen: 'group_promo' },
        btn_calendar: { label: '📅 Календарь', action: 'callback:group_calendar', targetScreen: 'group_calendar' },
        btn_landings: { label: '🌐 Лендинги', action: 'callback:group_landings', targetScreen: 'group_landings' },
      },
    },
    group_promo: {
      title: 'Промо (группа)',
      description: 'Промо-материалы в группе',
      scenario: 4,
      messages: {
        promo_text: { label: 'Текст промо', text: '<b>📢 Актуальные промо материалы</b>\n\nПерейдите по ссылке для просмотра актуальных баннеров и промо материалов.' },
      },
      buttons: {
        _order: ['btn_link', 'btn_back'],
        btn_link: { label: 'Открыть материалы', action: 'url:https://winline.tv/m/banner' },
        btn_back: { label: '🔙 Меню', action: 'callback:group_main_menu', targetScreen: 'group_menu' },
      },
    },
    group_calendar: {
      title: 'Календарь (группа)',
      description: 'Календарь событий в группе',
      scenario: 4,
      messages: {
        calendar_text: { label: 'Текст календаря', text: '<b>📅 Календарь</b>\n\nПерейдите по ссылке для просмотра актуального календаря.' },
      },
      buttons: {
        _order: ['btn_link', 'btn_back'],
        btn_link: { label: 'Открыть календарь', action: 'url:https://winline.tv/m/calendar' },
        btn_back: { label: '🔙 Меню', action: 'callback:group_main_menu', targetScreen: 'group_menu' },
      },
    },
    group_landings: {
      title: 'Лендинги (группа)',
      description: 'Актуальные лендинги в группе',
      scenario: 4,
      messages: {
        landings_text: { label: 'Текст лендингов', text: '<b>🌐 Список актуальных лендингов</b>' },
      },
      buttons: {
        _order: ['btn_back'],
        btn_back: { label: '🔙 Меню', action: 'callback:group_main_menu', targetScreen: 'group_menu' },
      },
    },
    group_kb: {
      title: 'База знаний (группа)',
      description: 'База знаний в групповых чатах',
      scenario: 4,
      messages: {
        kb_text: { label: 'Заголовок', text: '<b>📚 База знаний</b>\n\n<i>Выберите интересующую тему:</i>' },
      },
      buttons: {
        _order: ['btn_back'],
        btn_back: { label: '🔙 Меню', action: 'callback:group_main_menu', targetScreen: 'group_menu' },
      },
    },
  },
};

// ─── GET /api/scenarios ──────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { dbId, data } = await loadScenarios();
    // Auto-merge missing system screens from SEED_DATA (idempotent)
    if (dbId && data && data.screens) {
      let changed = false;
      for (const [id, screen] of Object.entries(SEED_DATA.screens)) {
        if (!data.screens[id]) {
          data.screens[id] = screen;
          changed = true;
        }
      }
      // One-time migration: collapse SEO/ASO/SMS and PUSH/IN APP into combined buttons
      const tc = data.screens.anketa_traffic_category;
      if (tc?.buttons && (tc.buttons.btn_seo || tc.buttons.btn_aso || tc.buttons.btn_sms || tc.buttons.btn_push || tc.buttons.btn_inapp)) {
        delete tc.buttons.btn_seo;
        delete tc.buttons.btn_aso;
        delete tc.buttons.btn_sms;
        delete tc.buttons.btn_push;
        delete tc.buttons.btn_inapp;
        tc.buttons.btn_seo_aso_sms = { label: 'SEO ASO SMS', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' };
        tc.buttons.btn_push_inapp = { label: 'PUSH IN APP', action: 'callback:anketa_answer', targetScreen: 'anketa_sub_check' };
        tc.buttons._order = ['btn_cpa_net', 'btn_seo_aso_sms', 'btn_cpa', 'btn_push_inapp', 'btn_dsp', 'btn_social', 'btn_influence', 'btn_other_traffic'];
        changed = true;
      }
      // One-time migration: убрать устаревшие event_flow и event_anketa из БД.
      // Они уже не в SEED_DATA (выпилили), но если ранее были сохранены в
      // БД через auto-merge — удаляем их БЕЗ записи в audit (это не действие
      // админа, а техническая чистка миграцией).
      for (const oldId of ['event_flow', 'event_anketa']) {
        if (data.screens[oldId]) {
          delete data.screens[oldId];
          changed = true;
        }
      }
      // Перенаправляем targetScreen в кнопках, которые ссылались на legacy:
      for (const scr of Object.values(data.screens)) {
        const order = scr.buttons?._order || [];
        for (const btnKey of order) {
          const btn = scr.buttons?.[btnKey];
          if (!btn) continue;
          if (btn.targetScreen === 'event_anketa') { btn.targetScreen = 'anketa_role'; changed = true; }
          if (btn.targetScreen === 'event_flow')   { btn.targetScreen = 'event_partner_check'; changed = true; }
        }
      }

      // One-time migration: event_congrats gets a static btn_merch (the bot
      // adds/strips it conditionally, but the diagram should show the edge to
      // anketa_role so the «Работаю»-flow loop is visible).
      const cg = data.screens.event_congrats;
      if (cg && (!cg.buttons || !cg.buttons.btn_merch)) {
        cg.buttons = cg.buttons || { _order: [] };
        cg.buttons.btn_merch = {
          label: '🎁 Хочу мерч',
          action: 'callback:event_v2_want_merch',
          targetScreen: 'anketa_role',
          locked: true,
        };
        cg.buttons._order = ['btn_merch', ...(cg.buttons._order || []).filter((k) => k !== 'btn_merch')];
        cg.description = 'Финал раффла. Кнопка «🎁 Хочу мерч» добавляется ботом динамически и показывается только во флоу «Работаю с WL» (там анкета ещё не пройдена) — для «Не работаю»-флоу мерч-QR выдаётся ещё в конце анкеты, и кнопка скрывается.';
        changed = true;
      }
      // One-time migration: drop the misleading targetScreen on
      // event_verify_promo.btn_back. The bot actually returns to the start
      // menu, not to event_partner_check, so the arrow on the canvas was wrong.
      const vp = data.screens.event_verify_promo;
      if (vp?.buttons?.btn_back?.targetScreen === 'event_partner_check') {
        delete vp.buttons.btn_back.targetScreen;
        vp.description = 'Экран призыва к верификации для действующего партнёра. «Вернуться назад» в боте возвращает в стартовое меню, а не на event_partner_check — поэтому стрелки в диаграмме у этой кнопки нет.';
        changed = true;
      }
      if (changed) await saveScenarios(data, dbId);
    }
    res.json(data || { screens: {} });
  } catch (err) { next(err); }
});

// ─── PUT /api/scenarios — полное сохранение ──────────────────────────────────

router.put('/', async (req, res, next) => {
  try {
    const { dbId, data: oldData } = await loadScenarios();
    if (!dbId) return res.status(404).json({ error: 'Scenarios not seeded yet' });
    await saveScenarios(req.body, dbId);
    notifyBotReload();  // non-blocking
    const userName = req.user.displayName || req.user.username;
    // Strip visual-only fields before audit comparison
    const visualKeys = ['bendOffsets', 'positions'];
    const stripVisual = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const copy = { ...obj };
      for (const k of visualKeys) delete copy[k];
      return copy;
    };
    const oldClean = stripVisual(oldData);
    const newClean = stripVisual(req.body);
    // Log per-screen changes instead of one giant "full save"
    const oldScreens = oldClean?.screens || {};
    const newScreens = newClean?.screens || {};
    const allScreenIds = new Set([...Object.keys(oldScreens), ...Object.keys(newScreens)]);
    let hasChanges = false;
    for (const sid of allScreenIds) {
      const oldS = oldScreens[sid];
      const newS = newScreens[sid];
      if (JSON.stringify(oldS) === JSON.stringify(newS)) continue;
      hasChanges = true;
      const screenTitle = newS?.title || oldS?.title || sid;
      if (!oldS) {
        logAudit(req.user.id, userName, 'create', 'scenarios', sid, `Добавлен экран «${screenTitle}»`, null, newS);
      } else if (!newS) {
        logAudit(req.user.id, userName, 'delete', 'scenarios', sid, `Удалён экран «${screenTitle}»`, oldS, null);
      } else {
        // Find what changed inside the screen
        const changes = [];
        const oldMsgs = oldS.messages || {};
        const newMsgs = newS.messages || {};
        for (const mk of new Set([...Object.keys(oldMsgs), ...Object.keys(newMsgs)])) {
          if (JSON.stringify(oldMsgs[mk]) !== JSON.stringify(newMsgs[mk])) {
            changes.push(newMsgs[mk]?.label || mk);
          }
        }
        const oldBtns = oldS.buttons || {};
        const newBtns = newS.buttons || {};
        for (const bk of new Set([...Object.keys(oldBtns), ...Object.keys(newBtns)])) {
          if (JSON.stringify(oldBtns[bk]) !== JSON.stringify(newBtns[bk])) {
            changes.push(`кнопка «${newBtns[bk]?.label || oldBtns[bk]?.label || bk}»`);
          }
        }
        const label = changes.length > 0
          ? `${screenTitle}: ${changes.join(', ')}`
          : screenTitle;
        logAudit(req.user.id, userName, 'update', 'scenarios', sid, label, oldS, newS);
      }
    }
    // Check non-screen fields too (customScreenOrder, etc.)
    const nonScreenOld = { ...oldClean }; delete nonScreenOld.screens;
    const nonScreenNew = { ...newClean }; delete nonScreenNew.screens;
    if (!hasChanges && JSON.stringify(nonScreenOld) !== JSON.stringify(nonScreenNew)) {
      logAudit(req.user.id, userName, 'update', 'scenarios', null, 'Настройки сценариев', nonScreenOld, nonScreenNew);
    }
    createDailySnapshot('scenarios', req.user.id, userName);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── PUT /api/scenarios/screens/:screenId/messages/:messageKey ───────────────

router.put('/screens/:screenId/messages/:messageKey', async (req, res, next) => {
  try {
    const { dbId, data } = await loadScenarios();
    if (!dbId || !data) return res.status(404).json({ error: 'Not found' });
    const screen = data.screens?.[req.params.screenId];
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    if (!screen.messages[req.params.messageKey]) return res.status(404).json({ error: 'Message not found' });
    const oldText = screen.messages[req.params.messageKey].text;
    screen.messages[req.params.messageKey].text = req.body.text;
    await saveScenarios(data, dbId);
    notifyBotReload();
    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'update', 'scenarios', `${req.params.screenId}/${req.params.messageKey}`, `message ${req.params.messageKey}`, { text: oldText }, { text: req.body.text });
    createDailySnapshot('scenarios', req.user.id, userName);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── PUT /api/scenarios/screens/:screenId/buttons/:buttonKey ─────────────────

router.put('/screens/:screenId/buttons/:buttonKey', async (req, res, next) => {
  try {
    const { dbId, data } = await loadScenarios();
    if (!dbId || !data) return res.status(404).json({ error: 'Not found' });
    const screen = data.screens?.[req.params.screenId];
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    if (!screen.buttons[req.params.buttonKey]) return res.status(404).json({ error: 'Button not found' });
    const oldLabel = screen.buttons[req.params.buttonKey].label;
    screen.buttons[req.params.buttonKey].label = req.body.label;
    await saveScenarios(data, dbId);
    notifyBotReload();
    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'update', 'scenarios', `${req.params.screenId}/${req.params.buttonKey}`, `button ${req.params.buttonKey}`, { label: oldLabel }, { label: req.body.label });
    createDailySnapshot('scenarios', req.user.id, userName);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── PUT /api/scenarios/screens/:screenId/buttons-order ──────────────────────

router.put('/screens/:screenId/buttons-order', async (req, res, next) => {
  try {
    const { dbId, data } = await loadScenarios();
    if (!dbId || !data) return res.status(404).json({ error: 'Not found' });
    const screen = data.screens?.[req.params.screenId];
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    screen.buttons._order = req.body.order;
    await saveScenarios(data, dbId);
    notifyBotReload();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── POST /api/scenarios/seed — начальное заполнение ─────────────────────────

router.post('/seed', async (req, res, next) => {
  try {
    const { data } = await loadScenarios();
    if (data && Object.keys(data.screens || {}).length > 0) {
      return res.json({ ok: true, seeded: false, message: 'Already seeded' });
    }
    // Insert or update
    const [rows] = await dbPool.query("SELECT id FROM texts WHERE category = 'bot_scenarios' LIMIT 1");
    if (rows.length) {
      await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(SEED_DATA), rows[0].id]);
    } else {
      await dbPool.query(
        'INSERT INTO texts (category, description, data) VALUES (?, ?, ?)',
        ['bot_scenarios', 'Bot scenarios editor', JSON.stringify(SEED_DATA)]
      );
    }
    res.json({ ok: true, seeded: true });
  } catch (err) { next(err); }
});

// POST /api/scenarios/new-anketa-sheet — create new Google Sheet tab named with today's date
router.post('/new-anketa-sheet', async (req, res, next) => {
  try {
    // Collect anketa columns from scenario:5 screens.
    // Google Sheet shows `title` (human-readable Russian), bot uses `answerKey` internally.
    // Column order is deterministic so bot can map answerKey → column by index.
    const [scRows] = await dbPool.query("SELECT data FROM texts WHERE category = 'bot_scenarios' LIMIT 1");
    const answerColumns = [];
    if (scRows.length) {
      const scData = typeof scRows[0].data === 'string' ? JSON.parse(scRows[0].data) : scRows[0].data;
      const screens = scData.screens || {};
      // Collect unique answerKeys in order of screen position
      const anketaScreens = Object.values(screens).filter(s => s.scenario === 5 && s.answerKey);
      const seen = new Set();
      for (const s of anketaScreens) {
        if (!seen.has(s.answerKey)) {
          seen.add(s.answerKey);
          answerColumns.push({ key: s.answerKey, label: s.title || s.answerKey });
        }
      }
    }

    const { createAnketaSheet } = await import('../services/googleSheets.js');
    const sheetTitle = await createAnketaSheet(answerColumns);
    if (!sheetTitle) return res.status(500).json({ error: 'Google Sheets не настроен или ошибка' });

    // Save active sheet name to settings so the bot knows where to write
    const [rows] = await dbPool.query("SELECT id, data FROM texts WHERE category = 'event_settings' LIMIT 1");
    if (rows.length) {
      const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
      data.anketa_active_sheet = sheetTitle;
      await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), rows[0].id]);
    } else {
      await dbPool.query(
        'INSERT INTO texts (category, description, data) VALUES (?, ?, ?)',
        ['event_settings', 'Event settings', JSON.stringify({ anketa_active_sheet: sheetTitle })]
      );
    }

    res.json({ ok: true, sheetTitle });
  } catch (err) { next(err); }
});

// GET /api/scenarios/anketa-active-sheet — get current active sheet name
router.get('/anketa-active-sheet', async (req, res) => {
  try {
    const [rows] = await dbPool.query("SELECT data FROM texts WHERE category = 'event_settings' LIMIT 1");
    if (rows.length) {
      const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
      return res.json({ sheet: data.anketa_active_sheet || null });
    }
    res.json({ sheet: null });
  } catch (e) { res.json({ sheet: null }); }
});

export default router;
