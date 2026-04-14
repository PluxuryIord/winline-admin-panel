/**
 * One-time script: adds event_flow screen with welcome message to bot_scenarios.
 * Run: node scripts/add_event_flow.js
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [rows] = await conn.query("SELECT id, data FROM texts WHERE category = 'bot_scenarios' LIMIT 1");
if (!rows.length) {
  console.log('No bot_scenarios row found');
  await conn.end();
  process.exit(1);
}

const id = rows[0].id;
const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;

if (data.screens?.event_flow) {
  console.log('event_flow screen already exists, skipping');
  await conn.end();
  process.exit(0);
}

data.screens = data.screens || {};
data.screens.event_flow = {
  title: 'Ивент — приветствие',
  messages: {
    welcome: {
      label: 'Приветствие',
      text: '<b>Приветственный текст для мероприятия\n\nЧтобы продолжить, пожалуйста, заполните небольшую анкету</b>',
    },
  },
  buttons: {},
  buttonsOrder: [],
};

await conn.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), id]);
console.log('✅ event_flow screen added with welcome message');
await conn.end();
