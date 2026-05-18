/**
 * Воркер очереди рассылок: ходит в БД, забирает батч pending/retrying job-ов,
 * шлёт их через TG с уважением к rate-limiter'у, обновляет статусы.
 *
 * Запускается из app.js однократно при старте процесса. Если процесс падает —
 * systemd рестартует Node, worker стартует заново, resetStuckJobs возвращает
 * висящие 'sending' в 'retrying'. Доставка к получателю — не теряется.
 *
 * Параллелизм: до WORKER_CONCURRENCY одновременных send'ов из одного процесса.
 * Per-chat и глобальный rate-limit обеспечиваются rateLimiter'ом.
 */

import {
  ensureTables, claimNextBatch, markSent, markRetry, markPermanentFail,
  resetStuckJobs, refreshMeta, MAX_ATTEMPTS,
} from './broadcastQueue.js';
import { globalRateLimiter } from './broadcastRateLimiter.js';
import dbPool from '../config/db.js';

const WORKER_CONCURRENCY = 20;     // параллельных send'ов
const POLL_INTERVAL_MS = 1500;     // как часто опрашивать БД на новые job'ы
const BATCH_SIZE = 50;             // сколько job'ов клеймить за раз

let _started = false;
let _stopRequested = false;

/**
 * Главный entry point. Вызывается из app.js на старте сервера.
 * Идемпотентно — повторный вызов будет no-op.
 */
export async function startBroadcastWorker(sendFn) {
  if (_started) return;
  _started = true;
  try {
    await ensureTables();
    await resetStuckJobs();
  } catch (e) {
    console.error('[broadcast-worker] startup error:', e.message);
  }
  console.log(`[broadcast-worker] starting (concurrency=${WORKER_CONCURRENCY}, poll=${POLL_INTERVAL_MS}ms)`);
  _runLoop(sendFn).catch(err => {
    console.error('[broadcast-worker] fatal:', err);
  });
}

export function stopBroadcastWorker() {
  _stopRequested = true;
}

async function _runLoop(sendFn) {
  while (!_stopRequested) {
    try {
      const batch = await claimNextBatch(BATCH_SIZE);
      if (!batch.length) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // Параллельно обрабатываем батч с ограничением concurrency
      await processBatch(batch, sendFn);

      // После каждого батча — обновляем счётчики по затронутым broadcast'ам
      const broadcastIds = [...new Set(batch.map(j => j.broadcastId))];
      for (const bid of broadcastIds) {
        try { await refreshMeta(bid); }
        catch (e) { /* non-fatal */ }
      }
    } catch (e) {
      console.error('[broadcast-worker] loop error:', e.message);
      await sleep(2000);
    }
  }
  console.log('[broadcast-worker] stopped');
}

async function processBatch(jobs, sendFn) {
  // Простой semaphore через Promise.all с чанками по WORKER_CONCURRENCY.
  for (let i = 0; i < jobs.length; i += WORKER_CONCURRENCY) {
    const chunk = jobs.slice(i, i + WORKER_CONCURRENCY);
    await Promise.all(chunk.map(job => processOne(job, sendFn).catch(e => {
      // На всякий случай ловим — иначе один сбой может прервать весь батч
      console.error(`[broadcast-worker] processOne unhandled for job ${job.id}:`, e.message);
    })));
  }
}

async function processOne(job, sendFn) {
  // 1. Ждём rate-limiter (sliding window + per-chat)
  await globalRateLimiter.acquire(job.chatId);

  const newAttempt = job.attemptCount + 1;
  try {
    const result = await sendFn(job.chatId, job.payload);
    if (result && result.ok === true) {
      await markSent(job.id);
      return;
    }

    // TG не вернул успех — анализируем ответ
    const code = result?.error_code || null;
    const desc = result?.description || '';

    // 429: flood control → ставим глобальную паузу, ретраим этот job
    if (code === 429 && result?.parameters?.retry_after) {
      globalRateLimiter.notifyFlood(result.parameters.retry_after);
      await markRetry(job.id, job.attemptCount, code, desc);  // attempt не инкрементим — это не вина юзера
      return;
    }

    // Permanent ошибки (юзера нет / забанил)
    if (isPermanentError(code, desc)) {
      await markPermanentFail(job.id, code, desc);
      await maybeMarkUserBlocked(job.chatId, desc);
      return;
    }

    // Прочее — ретраим с увеличением attempt
    if (newAttempt >= MAX_ATTEMPTS) {
      await markPermanentFail(job.id, code, desc);
    } else {
      await markRetry(job.id, newAttempt, code, desc);
    }
  } catch (err) {
    // Сетевые / неожиданные ошибки
    const code = err.code || null;
    const desc = err.message || String(err);
    if (newAttempt >= MAX_ATTEMPTS) {
      await markPermanentFail(job.id, code, desc);
    } else {
      await markRetry(job.id, newAttempt, code, desc);
    }
  }
}

// ── Классификация ошибок ───────────────────────────────────────────────────

function isPermanentError(code, desc) {
  if (code === 403) return true;  // bot blocked / kicked
  if (code === 400) {
    const d = (desc || '').toLowerCase();
    // chat not found / user is deactivated / wrong file_id — нет смысла ретраить
    if (d.includes('chat not found')) return true;
    if (d.includes('user is deactivated')) return true;
    if (d.includes('user_id_invalid')) return true;
    if (d.includes('peer_id_invalid')) return true;
    if (d.includes('forbidden')) return true;
  }
  return false;
}

async function maybeMarkUserBlocked(chatId, errorMsg) {
  try {
    const text = (errorMsg || '').toLowerCase();
    if (!text.includes('blocked') && !text.includes('forbidden') && !text.includes('deactivated')) return;
    await dbPool.query(
      'UPDATE users SET is_blocked = 1 WHERE user_id = ?',
      [chatId]
    ).catch(() => {});  // колонка может не быть — игнорим
  } catch (_) { /* non-fatal */ }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export { WORKER_CONCURRENCY, POLL_INTERVAL_MS, BATCH_SIZE };
