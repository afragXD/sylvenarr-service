import { describe, expect, test } from 'bun:test';

import { AppService } from './service';

describe('AppService.healthcheck', () => {
  test('отдаёт commit из GIT_SHA', async () => {
    const prev = process.env.GIT_SHA;
    process.env.GIT_SHA = 'deadbeefcafebabe0123456789abcdef01234567';
    try {
      const result = await AppService.healthcheck();
      expect(result.status).toBe('ok');
      expect(result.commit).toBe('deadbeefcafebabe0123456789abcdef01234567');
      expect(typeof result.version).toBe('string');
    } finally {
      if (prev === undefined) {
        delete process.env.GIT_SHA;
      } else {
        process.env.GIT_SHA = prev;
      }
    }
  });

  test('без env commit = unknown', async () => {
    const keys = ['GIT_SHA', 'COMMIT_SHA', 'SOURCE_VERSION'] as const;
    const backup = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const key of keys) {
      delete process.env[key];
    }
    try {
      const result = await AppService.healthcheck();
      expect(result.commit).toBe('unknown');
    } finally {
      for (const key of keys) {
        const value = backup[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
