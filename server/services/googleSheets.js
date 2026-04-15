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

const ANKETA_HEADERS = ['Дата', 'User ID', 'ФИО', 'Username', 'Роль', 'Компания', 'Категория трафика', 'Должность', 'Род деятельности'];

/**
 * Create a new sheet tab named with today's date (e.g. "15.04.2026").
 * Returns the sheet title. Panel saves it to DB, bot reads from DB.
 */
export async function createAnketaSheet() {
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

export function getSpreadsheetUrl() {
  if (!GOOGLE_SPREADSHEET_ID) return null;
  return `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}`;
}
