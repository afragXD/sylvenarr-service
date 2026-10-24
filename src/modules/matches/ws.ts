import { Elysia, t } from 'elysia';

import { getBattleStore, subscribeBattle, toBattleSummary } from '../../game/combat';
import { PLAYER_COOKIE_NAME } from '../../shared/constants/session';
import { prisma } from '../../shared/db';
import { MatchesService } from './service';

const BATTLE_ACTIONS = new Set(['attack', 'defend', 'wait', 'skill', 'ability', 'move']);
const ABILITY_SLOTS = new Set([1, 2, 3, 4, 5]);

type SocketSession = {
  playerId?: string;
  matchId?: string;
  ready?: boolean;
  unsub?: () => void;
};

/**
 * WebSocket комнаты боя: /matches/ws/:id
 * Клиент шлёт action / surrender / draw-*; сервер пушит battle:state / battle:ended.
 */
export const matchesWsController = new Elysia({ prefix: '/matches' }).ws('/ws/:id', {
  params: t.Object({ id: t.String() }),
  open(ws) {
    const matchId = ws.data.params.id;
    const cookieHeader = ws.data.request.headers.get('cookie') ?? '';
    const playerId = readCookie(cookieHeader, PLAYER_COOKIE_NAME);
    const session = ws.data as SocketSession;
    session.matchId = matchId;
    if (!playerId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Нужна авторизация' }));
      ws.close();
      return;
    }
    session.playerId = playerId;

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
      session.unsub = unsub;
      session.ready = true;

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
    const session = ws.data as SocketSession;
    session.ready = false;
    session.unsub?.();
  },
  message(ws, raw) {
    const session = ws.data as SocketSession;
    const message = parseMessage(raw);
    if (!message) {
      ws.send(JSON.stringify({ type: 'error', message: 'Некорректный кадр' }));
      return;
    }
    if (message.type === 'ping' || message.type === 'join') {
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
      return;
    }
    if (!session.ready || !session.playerId || !session.matchId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Соединение ещё не готово' }));
      return;
    }
    void handleBattleMessage(ws, session.matchId, session.playerId, message);
  },
});

async function handleBattleMessage(
  ws: { send: (data: string) => unknown },
  matchId: string,
  playerId: string,
  message: Record<string, unknown>
): Promise<void> {
  const fail = (text: string) => {
    ws.send(JSON.stringify({ type: 'error', message: text }));
  };

  if (message.type === 'action') {
    const action = message.action;
    if (typeof message.unitId !== 'string' || typeof action !== 'string' || !BATTLE_ACTIONS.has(action)) {
      fail('Некорректное действие');
      return;
    }
    const slot = message.slot;
    if (slot !== undefined && (typeof slot !== 'number' || !ABILITY_SLOTS.has(slot))) {
      fail('Некорректный слот способности');
      return;
    }
    const result = await MatchesService.battleAction({
      matchId,
      playerId,
      unitId: message.unitId,
      action: action as 'attack' | 'defend' | 'wait' | 'skill' | 'ability' | 'move',
      targetId: typeof message.targetId === 'string' ? message.targetId : undefined,
      slot: typeof slot === 'number' ? (slot as 1 | 2 | 3 | 4 | 5) : undefined,
      choice: typeof message.choice === 'string' ? message.choice : undefined,
    });
    if (!result.ok) {
      fail(result.message);
    }
    return;
  }

  if (message.type === 'surrender') {
    const result = await MatchesService.surrenderMatch({ matchId, playerId });
    if (!result.ok) {
      fail(result.message);
    }
    return;
  }

  if (message.type === 'draw-offer' || message.type === 'draw-accept' || message.type === 'draw-decline') {
    const call =
      message.type === 'draw-offer'
        ? MatchesService.offerDraw
        : message.type === 'draw-accept'
          ? MatchesService.acceptDraw
          : MatchesService.declineDraw;
    const result = await call({ matchId, playerId });
    if (!result.ok) {
      fail(result.message);
    }
    return;
  }

  fail('Неизвестный кадр');
}

function parseMessage(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === 'object' && raw !== null && 'type' in raw) {
    return raw as Record<string, unknown>;
  }
  return null;
}

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
