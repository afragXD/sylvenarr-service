import { describe, expect, test } from 'bun:test';

import { withBattleLock } from './battle-lock';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('withBattleLock', () => {
  test('два одновременных изменения одного матча не затирают друг друга', async () => {
    let stored = { picks: [] as string[] };
    const pick = (id: string) =>
      withBattleLock('m1', async () => {
        const snapshot = { picks: [...stored.picks] };
        await tick();
        snapshot.picks.push(id);
        stored = snapshot;
      });
    await Promise.all([pick('host'), pick('guest')]);
    expect(stored.picks.sort()).toEqual(['guest', 'host']);
  });

  test('ошибка задачи не блокирует следующую', async () => {
    await expect(
      withBattleLock('m2', async () => {
        throw new Error('сбой');
      })
    ).rejects.toThrow('сбой');
    expect(await withBattleLock('m2', async () => 'ok')).toBe('ok');
  });

  test('разные матчи не ждут друг друга', async () => {
    const order: string[] = [];
    await Promise.all([
      withBattleLock('a', async () => {
        await tick();
        order.push('a');
      }),
      withBattleLock('b', async () => {
        order.push('b');
      }),
    ]);
    expect(order).toEqual(['b', 'a']);
  });
});
