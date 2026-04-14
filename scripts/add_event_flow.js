/**
 * One-time script: adds welcome message to event_flow screen in bot_scenarios.
 * Run: node scripts/add_event_flow.js
 */
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
}

const conn = await mysql.createConnection({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT || 3306,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
});

const [rows] = await conn.query("SELECT id, data FROM texts WHERE category = 'bot_scenarios' LIMIT 1");
if (!rows.length) {
  console.log('No bot_scenarios row found');
  await conn.end();
  process.exit(1);
}

const id = rows[0].id;
const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;

if (!data.screens?.event_flow) {
  console.log('event_flow screen not found');
  await conn.end();
  process.exit(1);
}

if (data.screens.event_flow.messages?.welcome) {
  console.log('welcome message already exists in event_flow');
  await conn.end();
  process.exit(0);
}

data.screens.event_flow.messages = {
  welcome: {
    label: 'Приветствие мероприятия',
    text: '<b>Приветственный текст для мероприятия\n\nЧтобы продолжить, пожалуйста, заполните небольшую анкету</b>',
  },
  ...data.screens.event_flow.messages,
};

await conn.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), id]);
console.log('✅ welcome message added to event_flow');
await conn.end();
