import { describe, expect, it } from 'bun:test';

import { sanitizeSceneFileName } from './upload';

describe('sanitizeSceneFileName', () => {
  it('оставляет безопасное имя и расширение', () => {
    expect(sanitizeSceneFileName('Battle Cover.WEBP')).toBe('battle-cover.webp');
  });

  it('отбрасывает path traversal', () => {
    expect(sanitizeSceneFileName('../../etc/passwd.png')).toBe('passwd.png');
  });

  it('отклоняет неизвестное расширение', () => {
    expect(sanitizeSceneFileName('note.txt')).toBeNull();
  });

  it('отклоняет пустой stem', () => {
    expect(sanitizeSceneFileName('....png')).toBeNull();
  });
});
