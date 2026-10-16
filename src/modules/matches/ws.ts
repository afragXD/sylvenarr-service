import { Elysia, t } from 'elysia';

import { getBattleStore, subscribeBattle, toBattleSummary } from '../../game/combat';
import { PLAYER_COOKIE_NAME } from '../../shared/constants/session';
import { prisma } from '../../shared/db';

/**
 * WebSocket комнаты боя: /matches/ws/:id
 * Клиент шлёт { type: 'join' }; сервер пушит battle:state / battle:ended.
 */
export const matchesWsController = new Elysia({ prefix: '/matches' }).ws('/ws/:id', {
  params: t.Object({ id: t.String() }),
  open(ws) {
    const matchId = ws.data.params.id;
    const cookieHeader = ws.data.request.headers.get('cookie') ?? '';
    const playerId = readCookie(cookieHeader, PLAYER_COOKIE_NAME);
    if (!playerId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Нужна авторизация' }));
      ws.close();
      return;
    }

    void (async () => {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        select: { hostId: true, guestId: true, status: true },
      });
      if (!match || (match.hostId !== playerId && match.guestId !== playerId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Нет доступа к матчу' }));
        ws.close();
        return;
      }

      const unsub = subscribeBattle(matchId, (payload) => {
        ws.send(JSON.stringify(payload));
      });
      (ws.data as { unsub?: () => void }).unsub = unsub;

      const state = await getBattleStore().get(matchId);
      if (state) {
        ws.send(
          JSON.stringify({
            type: state.outcome === 'ongoing' ? 'battle:state' : 'battle:ended',
            battle: toBattleSummary(state),
          })
        );
      }
    })();
  },
  close(ws) {
    const unsub = (ws.data as { unsub?: () => void }).unsub;
    unsub?.();
  },
  message(ws, message) {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      (message as { type: string }).type === 'ping'
    ) {
      ws.send(JSON.stringify({ type: 'pong' }));
    }
  },
});

function readCookie(header: string, name: string): string | null {
  const parts = header.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}
