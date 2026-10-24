import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { resetBattleStoreForTests } from '../../game/combat';
import { prisma } from '../../shared/db';
import { PresetsService } from '../presets/service';
import { MatchesService } from './service';

const suffix = Date.now().toString(36);
const TIMEOUT = 30_000;

async function createPlayer() {
  return prisma.player.create({
    data: {
      displayName: `draft-preset-${suffix}-${Math.random().toString(36).slice(2, 7)}`,
    },
  });
}

const trioSlots = [
  { heroClassCode: 'Knight', row: 0 },
  { heroClassCode: 'Oracle', row: 1 },
  { heroClassCode: 'Herbalist', row: 1 },
];

describe('draftPreset + redaction', () => {
  const playerIds: string[] = [];
  const presetIds: string[] = [];
  const matchIds: string[] = [];

  beforeAll(() => {
    resetBattleStoreForTests();
  });

  afterAll(async () => {
    if (matchIds.length > 0) {
      await prisma.matchPick.deleteMany({ where: { matchId: { in: matchIds } } });
      await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
    }
    if (presetIds.length > 0) {
      await prisma.squadPreset.deleteMany({ where: { id: { in: presetIds } } });
    }
    if (playerIds.length > 0) {
      await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    }
  });

  async function openDraftMatch() {
    const host = await createPlayer();
    const guest = await createPlayer();
    playerIds.push(host.id, guest.id);
    const created = await MatchesService.createMatch(host.id, { initialTeamSize: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error(created.message);
    }
    matchIds.push(created.match.id);
    const joined = await MatchesService.joinMatch({
      inviteCode: created.match.inviteCode,
      guestId: guest.id,
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) {
      throw new Error(joined.message);
    }
    return { host, guest, matchId: created.match.id };
  }

  test(
    'rejects foreign personal preset',
    async () => {
      const { host, guest, matchId } = await openDraftMatch();
      const created = await PresetsService.create({
        playerId: guest.id,
        isAdmin: false,
        body: { name: `guest-only-${suffix}`, slots: trioSlots },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      presetIds.push(created.preset.id);

      const result = await MatchesService.draftPreset({
        matchId,
        playerId: host.id,
        presetId: created.preset.id,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
      }
    },
    TIMEOUT
  );

  test(
    'mixed: host preset hidden from guest until fighting',
    async () => {
      const { host, guest, matchId } = await openDraftMatch();
      const created = await PresetsService.create({
        playerId: host.id,
        isAdmin: false,
        body: { name: `host-mix-${suffix}`, slots: trioSlots },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      presetIds.push(created.preset.id);

      const applied = await MatchesService.draftPreset({
        matchId,
        playerId: host.id,
        presetId: created.preset.id,
      });
      expect(applied.ok).toBe(true);
      if (!applied.ok) {
        return;
      }
      expect(applied.match.status).toBe('drafting');
      expect(applied.match.draft.hostEntry).toBe('preset');
      expect(applied.match.draft.hostPicks.every((pick) => pick.heroClassCode.length > 0)).toBe(
        true
      );

      const asGuest = await MatchesService.findById(matchId, guest.id);
      expect(asGuest).not.toBeNull();
      if (!asGuest) {
        return;
      }
      expect(asGuest.draft.hostEntry).toBe('preset');
      expect(asGuest.draft.hostPicks.length).toBeGreaterThan(0);
      expect(asGuest.draft.hostPicks.every((pick) => pick.displayName === 'Скрыто')).toBe(true);
      expect(asGuest.draft.hostPicks.every((pick) => pick.heroClassCode === '')).toBe(true);
      expect(asGuest.draft.hostSize).toBe(3);

      const pick1 = await MatchesService.draftPick({
        matchId,
        playerId: guest.id,
        heroCode: 'Assassin',
        row: 0,
      });
      expect(pick1.ok).toBe(true);
      if (!pick1.ok) {
        return;
      }
      expect(pick1.match.draft.guestPicks[0]?.heroClassCode).toBe('Assassin');

      const asHostWhileDraft = await MatchesService.findById(matchId, host.id);
      expect(asHostWhileDraft?.draft.guestPicks[0]?.heroClassCode).toBe('Assassin');

      await MatchesService.draftPick({
        matchId,
        playerId: guest.id,
        heroCode: 'Pyro',
        row: 1,
      });
      const last = await MatchesService.draftPick({
        matchId,
        playerId: guest.id,
        heroCode: 'Marauder',
        row: 1,
      });
      expect(last.ok).toBe(true);
      if (!last.ok) {
        return;
      }
      expect(last.match.status).toBe('fighting');
      expect(
        last.match.draft.hostPicks.every(
          (pick) => pick.heroClassCode.length > 0 && pick.displayName !== 'Скрыто'
        )
      ).toBe(true);
    },
    TIMEOUT
  );

  test(
    'double preset: mutually blind then both visible in fighting',
    async () => {
      const { host, guest, matchId } = await openDraftMatch();
      const hostPreset = await PresetsService.create({
        playerId: host.id,
        isAdmin: false,
        body: { name: `host-dbl-${suffix}`, slots: trioSlots },
      });
      const guestPreset = await PresetsService.create({
        playerId: guest.id,
        isAdmin: false,
        body: {
          name: `guest-dbl-${suffix}`,
          slots: [
            { heroClassCode: 'Assassin', row: 0 },
            { heroClassCode: 'Marauder', row: 1 },
            { heroClassCode: 'Pyro', row: 1 },
          ],
        },
      });
      expect(hostPreset.ok && guestPreset.ok).toBe(true);
      if (!hostPreset.ok || !guestPreset.ok) {
        return;
      }
      presetIds.push(hostPreset.preset.id, guestPreset.preset.id);

      const hostApply = await MatchesService.draftPreset({
        matchId,
        playerId: host.id,
        presetId: hostPreset.preset.id,
      });
      expect(hostApply.ok).toBe(true);
      if (!hostApply.ok) {
        return;
      }

      const guestView = await MatchesService.findById(matchId, guest.id);
      expect(guestView?.draft.hostPicks.every((pick) => pick.displayName === 'Скрыто')).toBe(
        true
      );

      const guestApply = await MatchesService.draftPreset({
        matchId,
        playerId: guest.id,
        presetId: guestPreset.preset.id,
      });
      expect(guestApply.ok).toBe(true);
      if (!guestApply.ok) {
        return;
      }
      expect(guestApply.match.status).toBe('fighting');
      expect(
        guestApply.match.draft.hostPicks.every((pick) => pick.displayName !== 'Скрыто')
      ).toBe(true);
      expect(
        guestApply.match.draft.guestPicks.every((pick) => pick.displayName !== 'Скрыто')
      ).toBe(true);

      const rejectAgain = await MatchesService.draftPreset({
        matchId,
        playerId: host.id,
        presetId: hostPreset.preset.id,
      });
      expect(rejectAgain.ok).toBe(false);
    },
    TIMEOUT
  );

  test(
    'global preset apply ok; repeat after lock rejected',
    async () => {
      const { host, matchId } = await openDraftMatch();
      const global = await prisma.squadPreset.findFirst({
        where: { catalogCode: 'balanced-3' },
      });
      expect(global).not.toBeNull();
      if (!global) {
        return;
      }

      const applied = await MatchesService.draftPreset({
        matchId,
        playerId: host.id,
        presetId: global.id,
      });
      expect(applied.ok).toBe(true);
      if (!applied.ok) {
        return;
      }
      expect(applied.match.draft.hostEntry).toBe('preset');

      const again = await MatchesService.draftPreset({
        matchId,
        playerId: host.id,
        presetId: global.id,
      });
      expect(again.ok).toBe(false);
      if (!again.ok) {
        expect(again.status).toBe(400);
      }

      const pickAfter = await MatchesService.draftPick({
        matchId,
        playerId: host.id,
        heroCode: 'Assassin',
        row: 0,
      });
      expect(pickAfter.ok).toBe(false);
    },
    TIMEOUT
  );
});
