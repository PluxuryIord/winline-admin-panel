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

/**
 * Create a new sheet (tab) in the spreadsheet with today's date as name.
 * Writes question headers as the first row.
 * @param {string[]} questions - list of question texts
 * @returns {string|null} sheet title or null on failure
 */
export async function createSheetForQuestions(questions) {
  const sheets = getSheets();
  if (!sheets) {
    console.log('[googleSheets] Not configured, skipping sheet creation');
    return null;
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  // Check existing sheets to avoid name collision
  let title = dateStr;
  try {
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SPREADSHEET_ID });
    const existing = (data.sheets || []).map(s => s.properties.title);
    let suffix = 1;
    while (existing.includes(title)) {
      suffix++;
      title = `${dateStr} (${suffix})`;
    }
  } catch (err) {
    console.error('[googleSheets] Failed to get spreadsheet info:', err.message);
    return null;
  }

  // Create new sheet
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title },
          },
        }],
      },
    });

    // Write header row: "Пользователь", "Username", "Дата", then each question
    const headers = ['Пользователь', 'Username', 'Дата', ...questions];
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `'${title}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });

    console.log(`[googleSheets] Created sheet "${title}" with ${questions.length} questions`);
    return title;
  } catch (err) {
    console.error('[googleSheets] Failed to create sheet:', err.message);
    return null;
  }
}

export function getSpreadsheetUrl() {
  if (!GOOGLE_SPREADSHEET_ID) return null;
  return `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}`;
}
