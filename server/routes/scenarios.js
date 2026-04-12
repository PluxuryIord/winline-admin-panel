import { Router } from 'express';
import dbPool from '../config/db.js';
import { BOT_API_URL } from '../config/env.js';
import { logAudit } from '../services/auditLog.js';
import { createDailySnapshot } from '../services/snapshots.js';

const router = Router();

// ─── Notify bot to reload texts after save ──────────────────────────────────
async function notifyBotReload() {
  if (!BOT_API_URL) return;
  try {
    const resp = await fetch(`${BOT_API_URL}/reload-texts`);
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
        btn_event: { label: 'Я на мероприятии!', action: 'callback:client_at_event' },
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
    event_flow: {
      title: 'Мероприятие',
      description: 'QR-код для мероприятия',
      messages: {
        qr_caption: {
          label: 'Подпись к QR-коду',
          text: '<b>Вот ваш QR для получения подарка!</b>',
        },
        no_event: {
          label: 'Нет активных мероприятий',
          text: 'Сейчас нет активных мероприятий',
        },
        limit_reached: {
          label: 'Лимит кодов достигнут',
          text: 'К сожалению, все коды уже разобраны!',
        },
      },
      buttons: {
        _order: ['btn_become_partner'],
        btn_become_partner: { label: 'Стать партнёром', action: 'callback:client_new_partner' },
      },
    },
    event_anketa: {
      title: 'Анкета мероприятия',
      description: 'Предсобытийная анкета для неавторизованных пользователей',
      messages: {
        anketa_question_prompt: {
          label: 'Вопрос анкеты (шаблон)',
          text: '<b>{question_text}</b>',
        },
        anketa_complete: {
          label: 'Анкета завершена',
          text: '<b>Спасибо за заполнение анкеты!</b>',
        },
      },
      buttons: {
        _order: ['btn_fill_anketa', 'btn_become_partner'],
        btn_fill_anketa: { label: 'Заполнить анкету', action: 'callback:client_event_anketa' },
        btn_become_partner: { label: 'Стать партнёром', action: 'callback:client_new_partner' },
      },
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

export default router;
