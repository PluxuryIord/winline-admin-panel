/**
 * Скользящий лимитер для рассылок.
 *
 * Решает 3 задачи:
 *   1. Глобальный лимит 25 msg/sec (с запасом до TG-лимита 30) —
 *      sliding window через deque отметок времени отправки.
 *   2. Per-chat 1 msg/sec — TG жёстко ограничивает скорость в один чат,
 *      нарушение даёт 429 retry_after.
 *   3. Глобальная flood-пауза — если TG прислал 429, ВСЕ workers
 *      останавливаются до конца указанного retry_after.
 *
 * API:
 *   const limiter = createRateLimiter();
 *   await limiter.acquire(chatId);   // wait if needed, then permit
 *   ...do the send...
 *   limiter.notifyFlood(retryAfterSec);  // если получили 429
 */

// Telegram официально пускает 30 msg/sec на бота. С 25 иногда ловили
// краевые 429 при больших рассылках; 15 даёт двойной запас и сильно
// уменьшает шанс flood-control'а, который раньше ставил всю отправку
// на длинную глобальную паузу. Скорость 2700 юзеров: ~3 минуты —
// приемлемый компромисс между нагрузкой на TG и временем рассылки.
const GLOBAL_RATE = 15;            // msg/sec
const GLOBAL_WINDOW_MS = 1000;
const PER_CHAT_GAP_MS = 1100;      // 1 сек + 100мс запас — TG жёстко

export function createRateLimiter() {
  // sliding window: timestamps последних отправок (любых chat'ов)
  const globalSendTimes = [];
  // last-send timestamp по каждому chat_id
  const lastSendByChat = new Map();
  // глобальная пауза до этого timestamp'а (если TG сказал retry_after)
  let floodPauseUntil = 0;

  async function acquire(chatId) {
    while (true) {
      const now = Date.now();

      // 1) Flood pause — TG явно попросил замедлиться
      if (now < floodPauseUntil) {
        await sleep(floodPauseUntil - now + 5);
        continue;
      }

      // 2) Per-chat gap (1 сек на конкретного юзера)
      const lastForChat = lastSendByChat.get(chatId);
      if (lastForChat && now - lastForChat < PER_CHAT_GAP_MS) {
        await sleep(PER_CHAT_GAP_MS - (now - lastForChat) + 5);
        continue;
      }

      // 3) Global sliding window
      // выкидываем устаревшие
      while (globalSendTimes.length && globalSendTimes[0] < now - GLOBAL_WINDOW_MS) {
        globalSendTimes.shift();
      }
      if (globalSendTimes.length >= GLOBAL_RATE) {
        // ждём пока старшее «состарится»
        const waitMs = globalSendTimes[0] + GLOBAL_WINDOW_MS - now + 5;
        await sleep(waitMs);
        continue;
      }

      // permit granted — фиксируем отправку
      globalSendTimes.push(now);
      lastSendByChat.set(chatId, now);
      // Чистим старые записи в lastSendByChat чтобы не текла память (раз в ~1000 отправок)
      if (lastSendByChat.size > 10000 && globalSendTimes.length % 1000 === 0) {
        const cutoff = now - PER_CHAT_GAP_MS * 2;
        for (const [k, v] of lastSendByChat) {
          if (v < cutoff) lastSendByChat.delete(k);
        }
      }
      return;
    }
  }

  function notifyFlood(retryAfterSec) {
    const pauseMs = Math.max(1, Number(retryAfterSec) + 2) * 1000;
    const newPause = Date.now() + pauseMs;
    if (newPause > floodPauseUntil) {
      floodPauseUntil = newPause;
      console.warn(`[broadcast-rate-limiter] FLOOD: pause for ${pauseMs}ms (retry_after=${retryAfterSec})`);
    }
  }

  function stats() {
    return {
      globalRate: GLOBAL_RATE,
      globalInflight: globalSendTimes.length,
      chatsTracked: lastSendByChat.size,
      floodPauseRemainingMs: Math.max(0, floodPauseUntil - Date.now()),
    };
  }

  return { acquire, notifyFlood, stats };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Единственный экземпляр для всего серверного процесса.
// Все рассылки в этом процессе делят общий лимитер — TG не различает «откуда»
// от одного бота, и общий лимит у нас один на бот.
export const globalRateLimiter = createRateLimiter();
