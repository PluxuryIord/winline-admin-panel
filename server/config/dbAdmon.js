import mysql from 'mysql2/promise';
import {
  WL_ADMON_DB_HOST, WL_ADMON_DB_PORT, WL_ADMON_DB_USER,
  WL_ADMON_DB_PASSWORD, WL_ADMON_DB_NAME,
} from './env.js';

// Second pool → the wl_admon mirror (MariaDB on the DB-box, 45.10.41.110).
// Used only by the mini app login to check an email against the partner base.
// The mirror's firewall allows this server's IP (panel + bot share FDMS).
// Nullable by design: without env vars everything else keeps working.

let admonPool = null;

if (WL_ADMON_DB_HOST && WL_ADMON_DB_USER) {
  admonPool = mysql.createPool({
    host: WL_ADMON_DB_HOST,
    port: WL_ADMON_DB_PORT,
    user: WL_ADMON_DB_USER,
    password: WL_ADMON_DB_PASSWORD,
    database: WL_ADMON_DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 8000, // mirror down → fail fast, not a hanging login
  });
  console.log(`[dbAdmon] mirror pool → ${WL_ADMON_DB_HOST}/${WL_ADMON_DB_NAME}`);
} else {
  console.warn('[dbAdmon] WL_ADMON_DB_* не заданы — проверка email в Mini App будет отвечать 503');
}

export default admonPool;
