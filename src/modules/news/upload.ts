import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { config } from '../../config';

const ALLOWED_EXT = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif']);
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Корень volume (прод: `/app/static`, локально: `./static`).
 */
export function staticRoot(): string {
  return config.STATIC_ROOT;
}

/**
 * Безопасное имя файла: только [a-z0-9._-], без path traversal.
 */
export function sanitizeSceneFileName(originalName: string): string | null {
  const base = originalName.split(/[/\\]/).pop() ?? '';
  const ext = extname(base).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return null;
  }
  const stem = base
    .slice(0, base.length - ext.length)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  if (!stem || !/[a-z0-9]/.test(stem)) {
    return null;
  }
  return `${stem}${ext}`;
}

/**
 * Пишет картинку в `images/scenes/` на volume. Возвращает публичный путь для coverUrl.
 */
export async function saveNewsSceneFile(
  file: File
): Promise<
  | { ok: true; url: string; fileName: string }
  | { ok: false; message: string }
> {
  if (file.size <= 0) {
    return { ok: false, message: 'Пустой файл' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: 'Файл больше 5 МБ' };
  }
  const type = file.type || '';
  if (type && !type.startsWith('image/')) {
    return { ok: false, message: 'Нужен файл изображения' };
  }
  const safeName = sanitizeSceneFileName(file.name);
  if (!safeName) {
    return { ok: false, message: 'Недопустимое имя или расширение (webp/png/jpg/gif/avif)' };
  }
  const stamp = Date.now().toString(36);
  const fileName = `${stamp}-${safeName}`;
  const dir = join(staticRoot(), 'images', 'scenes');
  await mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, fileName), bytes);
  return {
    ok: true,
    url: `/static/images/scenes/${fileName}`,
    fileName,
  };
}
