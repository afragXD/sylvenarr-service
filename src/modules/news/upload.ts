import { saveStaticImage, sanitizeImageFileName } from '../../shared/static-upload';

/** @deprecated используйте sanitizeImageFileName — оставлено для тестов имён сцен */
export const sanitizeSceneFileName = sanitizeImageFileName;

/**
 * Пишет картинку в `images/scenes/` на volume. Возвращает публичный путь для coverUrl.
 */
export async function saveNewsSceneFile(
  file: File
): Promise<
  | { ok: true; url: string; fileName: string }
  | { ok: false; message: string }
> {
  return saveStaticImage(file, {
    subdir: 'images/scenes',
    urlPrefix: '/static/images/scenes',
    maxBytes: 5 * 1024 * 1024,
  });
}
