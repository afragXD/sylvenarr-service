import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { config } from '../config';

const ALLOWED_EXT = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif']);

/**
 * Корень volume (прод: `/app/static`, локально: `./static`).
 */
export function staticRoot(): string {
  return config.STATIC_ROOT;
}

/**
 * Безопасное имя файла: только [a-z0-9._-], без path traversal.
 */
export function sanitizeImageFileName(originalName: string): string | null {
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

export type SaveStaticImageOptions = {
  /** Относительно STATIC_ROOT, например `images/scenes` */
  readonly subdir: string;
  /** Публичный префикс URL, например `/static/images/scenes` */
  readonly urlPrefix: string;
  readonly maxBytes: number;
};

/**
 * Пишет картинку на volume. Возвращает публичный путь.
 */
export async function saveStaticImage(
  file: File,
  options: SaveStaticImageOptions
): Promise<
  | { ok: true; url: string; fileName: string }
  | { ok: false; message: string }
> {
  if (file.size <= 0) {
    return { ok: false, message: 'Пустой файл' };
  }
  if (file.size > options.maxBytes) {
    const mb = Math.round(options.maxBytes / (1024 * 1024));
    return { ok: false, message: `Файл больше ${mb} МБ` };
  }
  const type = file.type || '';
  if (type && !type.startsWith('image/')) {
    return { ok: false, message: 'Нужен файл изображения' };
  }
  const safeName = sanitizeImageFileName(file.name);
  if (!safeName) {
    return { ok: false, message: 'Недопустимое имя или расширение (webp/png/jpg/gif/avif)' };
  }
  const stamp = Date.now().toString(36);
  const fileName = `${stamp}-${safeName}`;
  const dir = join(staticRoot(), ...options.subdir.split('/').filter(Boolean));
  await mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, fileName), bytes);
  const prefix = options.urlPrefix.replace(/\/$/, '');
  return {
    ok: true,
    url: `${prefix}/${fileName}`,
    fileName,
  };
}
