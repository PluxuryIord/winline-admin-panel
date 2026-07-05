import { Router } from 'express';
import dbPool from '../../config/db.js';
import { readSheetValues } from '../../services/googleSheets.js';
import requireAuthorized from './requireAuthorized.js';

// Calendar for the Mini App. The bot's «Календарь мероприятий» button is just a
// url to a Google Sheet (scenario screen client_calendar → btn_link). Here we
// read that same sheet server-side and return structured rows so the app can
// render event cards. The sheet must be shared (Viewer) with the service
// account email. Any failure degrades to { unavailable } — never a 500.

const router = Router();

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, payload: null };

async function getCalendarUrl() {
  const [rows] = await dbPool.query(
    "SELECT data FROM texts WHERE category = 'bot_scenarios' LIMIT 1"
  );
  if (!rows.length) return null;
  const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  const action = String(data?.screens?.client_calendar?.buttons?.btn_link?.action || '');
  return action.startsWith('url:') ? action.slice(4) : null;
}

function parseSpreadsheetId(url) {
  const m = /\/d\/([a-zA-Z0-9-_]+)/.exec(String(url || ''));
  return m ? m[1] : null;
}

// Try to parse RU date formats found in the sheet: DD.MM.YYYY / DD.MM / ranges
// like "26-27.05" — returns a sortable ISO date (first day) or null.
function parseRuDate(s, fallbackYear) {
  const str = String(s || '').trim();
  let m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(str);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{1,2})(?:\s*[-–—]\s*\d{1,2})?[.\/](\d{1,2})(?:[.\/](\d{4}))?/.exec(str);
  if (m) {
    const year = m[3] || String(fallbackYear);
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

// GET /api/miniapp/calendar
router.get('/', requireAuthorized, async (req, res, next) => {
  try {
    if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) {
      return res.json({ ...cache.payload, cached: true });
    }

    const url = await getCalendarUrl();
    const spreadsheetId = parseSpreadsheetId(url);
    if (!spreadsheetId) {
      return res.json({ events: [], unavailable: 'ссылка на календарь не настроена в сценарии client_calendar' });
    }

    const rows = await readSheetValues(spreadsheetId, 'A1:H300');
    if (rows === null) {
      return res.json({
        events: [],
        sheet_url: url,
        unavailable: 'таблица недоступна (проверьте доступ сервис-аккаунта)',
      });
    }

    const headers = (rows[0] || []).map((h) => String(h || '').trim());
    const year = new Date().getFullYear();
    const events = [];
    for (const row of rows.slice(1)) {
      if (!row || row.every((c) => !String(c || '').trim())) continue;
      const cells = headers.map((h, i) => ({ header: h || `Колонка ${i + 1}`, value: String(row[i] ?? '').trim() }));
      const nonEmpty = cells.filter((c) => c.value);
      if (!nonEmpty.length) continue;
      // Дата — первая ячейка, где парсится дата; заголовок — первая длинная текстовая.
      const dateCell = cells.find((c) => parseRuDate(c.value, year));
      const titleCell = cells.find((c) => c !== dateCell && c.value.length > 2) || nonEmpty[0];
      events.push({
        date_raw: dateCell?.value || '',
        date_iso: dateCell ? parseRuDate(dateCell.value, year) : null,
        title: titleCell?.value || '',
        fields: cells.filter((c) => c !== dateCell && c !== titleCell && c.value),
      });
    }

    // Ближайшие сверху; события без даты — в конец.
    events.sort((a, b) => (a.date_iso || '9999') < (b.date_iso || '9999') ? -1 : 1);

    const payload = { events, headers, sheet_url: url, updated_at: new Date().toISOString() };
    cache = { at: Date.now(), payload };
    res.json(payload);
  } catch (err) { next(err); }
});

export default router;
