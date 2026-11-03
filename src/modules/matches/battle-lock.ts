/**
 * Последовательная обработка изменений боя одного матча (read → apply → write).
 * Нужна для фаз, где оба игрока действуют одновременно (перки), и для сдачи/ничьей.
 * Блокировка внутри процесса: сервис запущен одним инстансом.
 */
const tails = new Map<string, Promise<unknown>>();

export function withBattleLock<T>(matchId: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(matchId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => undefined);
  tails.set(matchId, tail);
  void tail.then(() => {
    if (tails.get(matchId) === tail) {
      tails.delete(matchId);
    }
  });
  return run;
}
