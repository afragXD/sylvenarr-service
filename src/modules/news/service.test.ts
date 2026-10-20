import { describe, expect, test } from 'bun:test';

import { NewsService } from './service';

describe('NewsService', () => {
  test('listPublished returns only past published items', async () => {
    const result = await NewsService.listPublished({ limit: 20 });
    const now = Date.now();
    for (const item of result.items) {
      expect(item.publishedAt).not.toBeNull();
      expect(new Date(item.publishedAt as string).getTime()).toBeLessThanOrEqual(now);
    }
  });

  test('getPublishedBySlug hides drafts', async () => {
    const draft = await NewsService.getPublishedBySlug('new-look-of-the-arena');
    expect(draft).toBeNull();
  });

  test('create rejects duplicate slug', async () => {
    const first = await NewsService.listPublished({ limit: 1 });
    const existing = first.items[0];
    if (!existing) {
      return;
    }
    const result = await NewsService.create(
      {
        slug: existing.slug,
        title: 'Dup',
        summary: 'Dup summary',
        body: 'Dup body',
      },
      'test-author'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
    }
  });
});
