import { BOT_TOKEN } from '../config/env.js';

export async function tgSend(chatId, text, parseMode = 'HTML') {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
  return r.json();
}
