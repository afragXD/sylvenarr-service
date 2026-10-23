import { describe, expect, it } from 'bun:test';

import { sanitizeImageFileName } from './static-upload';

describe('sanitizeImageFileName', () => {
  it('оставляет безопасное имя и расширение', () => {
    expect(sanitizeImageFileName('Battle Cover.WEBP')).toBe('battle-cover.webp');
  });

  it('отбрасывает path traversal', () => {
    expect(sanitizeImageFileName('../../etc/passwd.png')).toBe('passwd.png');
  });

  it('отклоняет неизвестное расширение', () => {
    expect(sanitizeImageFileName('note.txt')).toBeNull();
  });

  it('отклоняет пустой stem', () => {
    expect(sanitizeImageFileName('....png')).toBeNull();
  });
});
