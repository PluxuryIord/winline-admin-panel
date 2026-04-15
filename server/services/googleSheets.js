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

const ANSWERS_SHEET_NAME = 'Ответы анкеты';

/**
 * Create a new sheet (tab) for updated questions.
 * 1. Renames existing "Ответы анкеты" → "Ответы DD.MM.YYYY" (archive)
 * 2. Creates fresh "Ответы анкеты" with new question headers
 * Bot always writes to "Ответы анкеты" — no bot changes needed.
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

  try {
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SPREADSHEET_ID });
    const existingSheets = data.sheets || [];
    const existingTitles = existingSheets.map(s => s.properties.title);

    // Step 1: Rename existing "Ответы анкеты" → "Ответы DD.MM.YYYY"
    const answersSheet = existingSheets.find(s => s.properties.title === ANSWERS_SHEET_NAME);
    if (answersSheet) {
      let archiveTitle = `Ответы ${dateStr}`;
      let suffix = 1;
      while (existingTitles.includes(archiveTitle)) {
        suffix++;
        archiveTitle = `Ответы ${dateStr} (${suffix})`;
      }

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SPREADSHEET_ID,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: {
                sheetId: answersSheet.properties.sheetId,
                title: archiveTitle,
              },
              fields: 'title',
            },
          }],
        },
      });
      console.log(`[googleSheets] Archived "${ANSWERS_SHEET_NAME}" → "${archiveTitle}"`);
    }

    // Step 2: Create new "Ответы анкеты" with updated headers
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: ANSWERS_SHEET_NAME },
          },
        }],
      },
    });

    // Write header row
    const headers = ['Дата', 'User ID', 'ФИО', 'Username', ...questions];
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `'${ANSWERS_SHEET_NAME}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });

    console.log(`[googleSheets] Created new "${ANSWERS_SHEET_NAME}" with ${questions.length} questions`);
    return ANSWERS_SHEET_NAME;
  } catch (err) {
    console.error('[googleSheets] Failed to create sheet:', err.message);
    return null;
  }
}

/**
 * Create a new "Ответы анкеты" sheet with fixed anketa columns.
 * Archives old sheet as "Ответы DD.MM.YYYY".
 */
export async function createAnketaSheet() {
  const questionCols = ['Роль', 'Компания', 'Категория трафика', 'Должность', 'Род деятельности'];
  return createSheetForQuestions(questionCols);
}

export function getSpreadsheetUrl() {
  if (!GOOGLE_SPREADSHEET_ID) return null;
  return `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}`;
}
