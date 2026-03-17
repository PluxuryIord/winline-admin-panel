import mysql from 'mysql2/promise';
import { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } from './env.js';

let dbPool = null;

if (MYSQL_HOST && MYSQL_USER && MYSQL_DATABASE) {
  dbPool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
  });
  console.log('[db] MySQL pool created for', MYSQL_DATABASE, '@', MYSQL_HOST);
} else {
  console.warn('[db] MySQL не настроен — добавьте MYSQL_HOST/USER/DATABASE в .env');
}

export default dbPool;
