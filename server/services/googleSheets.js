import { google } from 'googleapis';
import { GOOGLE_SERVICE_ACCOUNT, GOOGLE_SPREADSHEET_ID } from '../config/env.js';

let _sheets = null;

function getSheets() {
  if (_sheets) return _sheets;
  if (!GOOGLE_SERVICE_ACCOUNT || !GOOGLE_SPREADSHEET_ID) return null;

  try {
    const creds = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    _sheets = google.sheets({ version: 'v4', auth });
    return _sheets;
  } catch (err) {
    console.error('[googleSheets] Failed to init:', err.message);
    return null;
  }
}

const ANKETA_BASE_HEADERS = ['Дата', 'User ID', 'ФИО', 'Username'];

/**
 * Create a new sheet tab named with today's date (e.g. "15.04.2026").
 * @param {string[]} answerColumns - column names from answerKey fields of anketa screens
 * Returns the sheet title. Panel saves it to DB, bot reads from DB.
 */
export async function createAnketaSheet(answerColumns = []) {
  const ANKETA_HEADERS = [...ANKETA_BASE_HEADERS, ...answerColumns];
  const sheets = getSheets();
  if (!sheets) return null;

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  try {
    // Check for duplicate title
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SPREADSHEET_ID });
    const existingTitles = (data.sheets || []).map(s => s.properties.title);
    let title = dateStr;
    let suffix = 1;
    while (existingTitles.includes(title)) {
      suffix++;
      title = `${dateStr} (${suffix})`;
    }

    // Create sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });

    // Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `'${title}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [ANKETA_HEADERS] },
    });

    // Bold header
    const newData = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SPREADSHEET_ID });
    const newSheet = newData.data.sheets.find(s => s.properties.title === title);
    if (newSheet) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SPREADSHEET_ID,
        requestBody: { requests: [{ repeatCell: {
          range: { sheetId: newSheet.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        } }] },
      });
    }

    console.log(`[googleSheets] Created anketa sheet "${title}"`);
    return title;
  } catch (err) {
    console.error('[googleSheets] Failed to create anketa sheet:', err.message);
    return null;
  }
}

/**
 * Legacy: create sheet for event questions (used by events.js).
 * Renames existing "Ответы анкеты" → dated archive, creates fresh one.
 */
export async function createSheetForQuestions(questions) {
  const sheets = getSheets();
  if (!sheets) return null;

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const SHEET_NAME = 'Ответы анкеты';

  try {
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SPREADSHEET_ID });
    const existing = data.sheets || [];
    const titles = existing.map(s => s.properties.title);

    const old = existing.find(s => s.properties.title === SHEET_NAME);
    if (old) {
      let archive = `Ответы ${dateStr}`;
      let n = 1;
      while (titles.includes(archive)) { n++; archive = `Ответы ${dateStr} (${n})`; }
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SPREADSHEET_ID,
        requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: old.properties.sheetId, title: archive }, fields: 'title' } }] },
      });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });

    const headers = ['Дата', 'User ID', 'ФИО', 'Username', ...questions];
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });

    return SHEET_NAME;
  } catch (err) {
    console.error('[googleSheets] Failed to create sheet:', err.message);
    return null;
  }
}

export function getSpreadsheetUrl() {
  if (!GOOGLE_SPREADSHEET_ID) return null;
  return `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}`;
}
