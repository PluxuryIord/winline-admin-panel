import { Router } from 'express';
import dbPool from '../../config/db.js';
import { getSheetsMeta, readSheetValues } from '../../services/googleSheets.js';
import requireAuthorized from './requireAuthorized.js';

// Calendar for the Mini App. The source Google Sheet is a MONTH GRID, one
// sheet tab per month («Июль», «Июнь», …):
//   row: «2026» • row: «ИЮЛЬ» • row: ПОНЕДЕЛЬНИК…ВОСКРЕСЕНЬЕ •
//   then alternating rows of day numbers (1..31 laid out by weekday column)
//   and rows of that week's events (cell text, events separated by newlines).
// We parse that into {date_iso, items[]} per day. Sheet url comes from the
// client_calendar scenario button; failures degrade to { unavailable }.

const router = Router();

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // month title → { at, payload }

const RU_MONTHS = {
  'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4, 'май': 5, 'июнь': 6,
  'июль': 7, 'август': 8, 'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12,
};
const WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

async function getCalendarUrl() {
  const [rows] = await dbPool.query(
    "SELECT data FROM texts WHERE category = 'bot_scenarios' LIMIT 1"
  );
  if (!rows.length) return null;
  const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  const action = String(data?.screens?.client_calendar?.buttons?.btn_link?.action || '');
  return action.startsWith('url:') ? action.slice(4) : null;
}

const parseSpreadsheetId = (url) => (/\/d\/([a-zA-Z0-9-_]+)/.exec(String(url || '')) || [])[1] || null;

/** Grid → [{day, items[]}]. Also returns detected year/month if present. */
function parseMonthGrid(rows) {
  let year = null;
  let monthNum = null;
  let weekdayCols = null;   // {colIdx: weekday 0..6}
  let currentWeek = null;   // {colIdx: dayNumber}
  const days = new Map();   // day → Set(items)

  const isDayNumberRow = (cells) => {
    const nums = cells.filter((c) => c.v !== '');
    if (!nums.length) return false;
    return nums.every((c) => /^\d{1,2}$/.test(c.v) && +c.v >= 1 && +c.v <= 31);
  };

  for (const row of rows) {
    const cells = (row || []).map((v, i) => ({ i, v: String(v ?? '').trim() }));
    const filled = cells.filter((c) => c.v);
    if (!filled.length) continue;

    if (!year && filled.length === 1 && /^\d{4}$/.test(filled[0].v)) {
      year = +filled[0].v;
      continue;
    }
    if (!monthNum && filled.length === 1 && RU_MONTHS[filled[0].v.toLowerCase()]) {
      monthNum = RU_MONTHS[filled[0].v.toLowerCase()];
      continue;
    }
    // weekday header row
    const wd = cells.filter((c) => WEEKDAYS.includes(c.v.toLowerCase()));
    if (wd.length >= 3) {
      weekdayCols = {};
      for (const c of wd) weekdayCols[c.i] = WEEKDAYS.indexOf(c.v.toLowerCase());
      continue;
    }
    if (!weekdayCols) continue; // ignore anything above the grid

    if (isDayNumberRow(filled)) {
      currentWeek = {};
      for (const c of filled) currentWeek[c.i] = +c.v;
      continue;
    }
    // event row for the current week
    if (currentWeek) {
      for (const c of filled) {
        const day = currentWeek[c.i];
        if (!day) continue;
        const items = c.v.split('\n').map((s) => s.trim()).filter(Boolean);
        if (!items.length) continue;
        if (!days.has(day)) days.set(day, []);
        const list = days.get(day);
        for (const it of items) if (!list.includes(it)) list.push(it);
      }
    }
  }

  return { year, monthNum, days };
}

// GET /api/miniapp/calendar[?month=Июль]
router.get('/', requireAuthorized, async (req, res, next) => {
  try {
    const url = await getCalendarUrl();
    const spreadsheetId = parseSpreadsheetId(url);
    if (!spreadsheetId) {
      return res.json({ days: [], months: [], unavailable: 'ссылка на календарь не настроена в сценарии client_calendar' });
    }

    const meta = await getSheetsMeta(spreadsheetId); // [{title, index}] in tab order
    if (!meta || !meta.length) {
      return res.json({ days: [], months: [], sheet_url: url, unavailable: 'таблица недоступна (нет доступа или Google не отвечает)' });
    }
    const months = meta.map((s) => s.title);

    // Requested tab, else the tab named like the current month, else the first.
    const asked = String(req.query.month || '').trim();
    const nowMonthRu = Object.keys(RU_MONTHS).find((m) => RU_MONTHS[m] === new Date().getMonth() + 1);
    const title =
      (asked && months.find((t) => t.toLowerCase() === asked.toLowerCase())) ||
      months.find((t) => t.toLowerCase() === nowMonthRu) ||
      months[0];

    const hit = cache.get(title);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return res.json({ ...hit.payload, months, cached: true });
    }

    const rows = await readSheetValues(spreadsheetId, `'${title}'!A1:K60`);
    if (rows === null) {
      return res.json({ days: [], months, sheet_url: url, unavailable: 'лист недоступен (проверьте доступ)' });
    }

    const { year, monthNum, days } = parseMonthGrid(rows);
    const y = year || new Date().getFullYear();
    const m = monthNum || RU_MONTHS[title.toLowerCase()] || new Date().getMonth() + 1;

    const out = [...days.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, items]) => ({
        day,
        date_iso: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        items,
      }));

    const payload = { month: title, year: y, days: out, sheet_url: url, updated_at: new Date().toISOString() };
    cache.set(title, { at: Date.now(), payload });
    res.json({ ...payload, months });
  } catch (err) { next(err); }
});

export default router;
