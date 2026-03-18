import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import crypto from 'crypto';
import { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } from '../config/env.js';

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: 'ru-1',
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

/**
 * Загрузить буфер в S3.
 * @param {Buffer} buffer
 * @param {string} originalName — имя файла (для расширения)
 * @param {string} contentType — MIME
 * @param {string} [prefix='chat-media'] — папка в бакете
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function uploadToS3(buffer, originalName, contentType, prefix = 'chat-media') {
  const ext = path.extname(originalName) || '.bin';
  const key = `${prefix}/${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read',
  }));

  return { key, url: getPublicUrl(key) };
}

/**
 * Публичный URL файла в S3.
 */
export function getPublicUrl(key) {
  return `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;
}

/**
 * Скачать файл по URL и вернуть буфер.
 */
export async function downloadBuffer(url) {
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}
