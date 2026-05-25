/**
 * Persistent очередь рассылочных job'ов.
 *
 * Создаёт две таблицы:
 *   - wl_broadcast_jobs  — одна строка на (broadcast, recipient)
 *   - wl_broadcast_meta  — сводка по каждой рассылке (total/sent/failed/...)
 *
 * Жизненный цикл job:
 *   pending → sending → sent | retrying → ... → sent | permanent_fail
 *
 * Атомарный claim через SELECT ... FOR UPDATE SKIP LOCKED + UPDATE гарантирует
 * что один job не возьмут два worker-потока одновременно. На рестарте сервера:
 * job'ы со status='sending' возвращаются в 'retrying' (см. resetStuckJobs).
 *
 * Retry-политика: 6 попыток, exponential backoff
 *   1 → 0s    2 → +5s    3 → +30s    4 → +5min    5 → +30min    6 → +2h
 *   После 6-й — permanent_fail.
 */
import dbPool from '../config/db.js';

const RETRY_DELAYS_SEC = [0, 5, 30, 300, 1800, 7200]; // 6 попыток
const MAX_ATTEMPTS = RETRY_DELAYS_SEC.length;

// ── Bootstrap таблиц ────────────────────────────────────────────────────────

let _tablesReady = false;
let _readyPromise = null;

export async function ensureTables() {
  if (_tablesReady) return;
  if (_readyPromise) return _readyPromise;
  _readyPromise = (async () => {
    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS wl_broadcast_jobs (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          broadcast_id BIGINT NOT NULL,
          chat_id BIGINT NOT NULL,
          payload JSON NOT NULL,
          status ENUM('pending','sending','sent','retrying','permanent_fail') NOT NULL DEFAULT 'pending',
          attempt_count INT NOT NULL DEFAULT 0,
          next_retry_at DATETIME NULL,
          last_error_code INT NULL,
          last_error_msg TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          started_at DATETIME NULL,
          sent_at DATETIME NULL,
          INDEX idx_status_retry (status, next_retry_at),
          INDEX idx_broadcast (broadcast_id),
          INDEX idx_chat_status (chat_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS wl_broadcast_meta (
          broadcast_id BIGINT PRIMARY KEY,
          total INT NOT NULL,
          sent INT NOT NULL DEFAULT 0,
          permanent_fail INT NOT NULL DEFAULT 0,
          retrying INT NOT NULL DEFAULT 0,
          pending INT NOT NULL DEFAULT 0,
          sending INT NOT NULL DEFAULT 0,
          status ENUM('queued','running','completed') NOT NULL DEFAULT 'queued',
          payload_summary TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME NULL,
          INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      _tablesReady = true;
    } catch (e) {
      console.error('[broadcast-queue] ensureTables failed:', e.message);
      _readyPromise = null;  // позволим повторить попытку
      throw e;
    }
  })();
  return _readyPromise;
}

// ── Enqueue: создать job'ы под новую рассылку ──────────────────────────────

/**
 * Кладёт в очередь N job'ов в одной транзакции.
 * @param {number} broadcastId  — id из таблицы `broadcasts`
 * @param {Array<{ chatId: number, payload: object }>} jobs
 * @param {string} [summary]    — короткое описание для UI
 */
export async function enqueueBroadcast(broadcastId, jobs, summary = '') {
  await ensureTables();
  const total = jobs.length;
  if (!total) return;

  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    // Bulk INSERT job-ов. Делим на чанки по 500, чтобы не упереться в max_allowed_packet.
    const CHUNK = 500;
    for (let i = 0; i < jobs.length; i += CHUNK) {
      const chunk = jobs.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(',');
      const flat = [];
      for (const j of chunk) {
        flat.push(broadcastId, j.chatId, JSON.stringify(j.payload), 'pending');
      }
      await conn.query(
        `INSERT INTO wl_broadcast_jobs (broadcast_id, chat_id, payload, status) VALUES ${placeholders}`,
        flat
      );
    }

    await conn.query(
      `INSERT INTO wl_broadcast_meta (broadcast_id, total, pending, status, payload_summary)
       VALUES (?, ?, ?, 'queued', ?)
       ON DUPLICATE KEY UPDATE total=VALUES(total), pending=VALUES(pending), status='queued'`,
      [broadcastId, total, total, summary.substring(0, 500)]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// ── Worker side: атомарный claim batch'а ───────────────────────────────────

/**
 * Атомарно берёт до `limit` job'ов готовых к отправке и переводит их в 'sending'.
 * SELECT FOR UPDATE SKIP LOCKED — параллельные worker'ы не возьмут одни и те же.
 */
export async function claimNextBatch(limit = 50) {
  await ensureTables();
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, broadcast_id, chat_id, payload, attempt_count
       FROM wl_broadcast_jobs
       WHERE (status = 'pending')
          OR (status = 'retrying' AND next_retry_at <= NOW())
       ORDER BY id
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    if (!rows.length) {
      await conn.commit();
      return [];
    }
    const ids = rows.map(r => r.id);
    await conn.query(
      `UPDATE wl_broadcast_jobs
       SET status='sending', started_at = NOW()
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    await conn.commit();
    // payload приходит из MySQL уже как объект (json column)
    return rows.map(r => ({
      id: r.id,
      broadcastId: r.broadcast_id,
      chatId: r.chat_id,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      attemptCount: r.attempt_count,
    }));
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

export async function markSent(jobId) {
  await dbPool.query(
    `UPDATE wl_broadcast_jobs SET status='sent', sent_at=NOW() WHERE id = ?`,
    [jobId]
  );
}

export async function markRetry(jobId, attemptCount, errorCode, errorMsg) {
  // Считаем задержку для следующей попытки
  if (attemptCount >= MAX_ATTEMPTS) {
    return markPermanentFail(jobId, errorCode, errorMsg);
  }
  const delaySec = RETRY_DELAYS_SEC[attemptCount] || RETRY_DELAYS_SEC[RETRY_DELAYS_SEC.length - 1];
  await dbPool.query(
    `UPDATE wl_broadcast_jobs
     SET status='retrying', attempt_count=?, next_retry_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
         last_error_code=?, last_error_msg=?
     WHERE id = ?`,
    [attemptCount, delaySec, errorCode || null, (errorMsg || '').substring(0, 500), jobId]
  );
}

export async function markPermanentFail(jobId, errorCode, errorMsg) {
  await dbPool.query(
    `UPDATE wl_broadcast_jobs
     SET status='permanent_fail', last_error_code=?, last_error_msg=?
     WHERE id = ?`,
    [errorCode || null, (errorMsg || '').substring(0, 500), jobId]
  );
}

// ── Crash recovery ─────────────────────────────────────────────────────────

/**
 * При старте worker'а возвращает все 'sending' job'ы (которые остались висеть
 * после краша процесса) обратно в 'retrying' с немедленной готовностью.
 */
export async function resetStuckJobs() {
  await ensureTables();
  const [result] = await dbPool.query(
    `UPDATE wl_broadcast_jobs
     SET status='retrying', next_retry_at = NOW()
     WHERE status='sending'`
  );
  if (result.affectedRows > 0) {
    console.log(`[broadcast-queue] crash-recovery: reset ${result.affectedRows} stuck 'sending' jobs to 'retrying'`);
  }
}

// ── Прогресс и сводки ──────────────────────────────────────────────────────

export async function refreshMeta(broadcastId) {
  await ensureTables();
  const [counts] = await dbPool.query(
    `SELECT status, COUNT(*) AS c FROM wl_broadcast_jobs WHERE broadcast_id=? GROUP BY status`,
    [broadcastId]
  );
  const agg = { pending: 0, sending: 0, sent: 0, retrying: 0, permanent_fail: 0 };
  for (const row of counts) agg[row.status] = Number(row.c);
  const total = agg.pending + agg.sending + agg.sent + agg.retrying + agg.permanent_fail;
  const stillPending = agg.pending + agg.sending + agg.retrying;
  const status = stillPending === 0 ? 'completed' : 'running';

  await dbPool.query(
    `UPDATE wl_broadcast_meta
     SET total=?, pending=?, sending=?, sent=?, retrying=?, permanent_fail=?, status=?,
         completed_at = CASE WHEN ?='completed' THEN NOW() ELSE completed_at END
     WHERE broadcast_id=?`,
    [total, agg.pending, agg.sending, agg.sent, agg.retrying, agg.permanent_fail, status, status, broadcastId]
  );

  // Зеркалим живые счётчики (total/success/failed) в wl_admin_broadcasts —
  // эти колонки INT, можем писать всегда. Статус (ENUM, без права ALTER) —
  // ТОЛЬКО при завершении: 'published' если хоть кому-то ушло, иначе 'failed'.
  // Пока stillPending > 0 — оставляем status какой был, а UI получает синтез
  // 'queued' из этой meta-таблицы через GET-эндпоинт.
  try {
    if (status === 'completed') {
      const adminStatus = agg.sent > 0 ? 'published' : 'failed';
      await dbPool.query(
        `UPDATE wl_admin_broadcasts SET status=?, total=?, success=?, failed=? WHERE id=?`,
        [adminStatus, total, agg.sent, agg.permanent_fail, broadcastId]
      );
    } else {
      await dbPool.query(
        `UPDATE wl_admin_broadcasts SET total=?, success=?, failed=? WHERE id=?`,
        [total, agg.sent, agg.permanent_fail, broadcastId]
      );
    }
  } catch (e) {
    // Не падаем: meta-таблица — основной источник истины, зеркало — best-effort.
    console.warn(`[broadcast-queue] mirror to wl_admin_broadcasts failed: ${e.message}`);
  }

  return { broadcastId, total, ...agg, status };
}

export async function getProgress(broadcastId) {
  await ensureTables();
  const [rows] = await dbPool.query(
    `SELECT * FROM wl_broadcast_meta WHERE broadcast_id=?`,
    [broadcastId]
  );
  if (!rows.length) return null;
  const m = rows[0];
  return {
    broadcastId: m.broadcast_id,
    total: m.total,
    pending: m.pending,
    sending: m.sending,
    sent: m.sent,
    retrying: m.retrying,
    permanent_fail: m.permanent_fail,
    status: m.status,
    created_at: m.created_at,
    completed_at: m.completed_at,
    summary: m.payload_summary || '',
  };
}

export async function listActive(limit = 20) {
  await ensureTables();
  const [rows] = await dbPool.query(
    `SELECT * FROM wl_broadcast_meta WHERE status IN ('queued','running') ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(m => ({
    broadcastId: m.broadcast_id, total: m.total, pending: m.pending, sending: m.sending,
    sent: m.sent, retrying: m.retrying, permanent_fail: m.permanent_fail,
    status: m.status, created_at: m.created_at, summary: m.payload_summary || '',
  }));
}

export { MAX_ATTEMPTS, RETRY_DELAYS_SEC };
