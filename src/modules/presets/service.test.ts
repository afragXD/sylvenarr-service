import { afterAll, describe, expect, test } from 'bun:test';

import { prisma } from '../../shared/db';
import { PresetsService } from './service';

const suffix = Date.now().toString(36);

async function createPlayer(role: 'player' | 'admin' = 'player') {
  return prisma.player.create({
    data: {
      displayName: `preset-test-${role}-${suffix}-${Math.random().toString(36).slice(2, 7)}`,
      role,
    },
  });
}

const trioSlots = [
  { heroClassCode: 'Knight', row: 0 },
  { heroClassCode: 'Oracle', row: 1 },
  { heroClassCode: 'Herbalist', row: 1 },
];

describe('PresetsService', () => {
  const createdPresetIds: string[] = [];
  const createdPlayerIds: string[] = [];

  afterAll(async () => {
    if (createdPresetIds.length > 0) {
      await prisma.squadPreset.deleteMany({ where: { id: { in: createdPresetIds } } });
    }
    if (createdPlayerIds.length > 0) {
      await prisma.player.deleteMany({ where: { id: { in: createdPlayerIds } } });
    }
  });

  test('player CRUD personal preset', async () => {
    const player = await createPlayer('player');
    createdPlayerIds.push(player.id);

    const created = await PresetsService.create({
      playerId: player.id,
      isAdmin: false,
      body: { name: 'Мой тест', slots: trioSlots },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    createdPresetIds.push(created.preset.id);
    expect(created.preset.isGlobal).toBe(false);
    expect(created.preset.teamSize).toBe(3);

    const listed = await PresetsService.list({
      playerId: player.id,
      scope: 'mine',
    });
    expect(listed.some((item) => item.id === created.preset.id)).toBe(true);

    const updated = await PresetsService.update({
      presetId: created.preset.id,
      playerId: player.id,
      isAdmin: false,
      body: { name: 'Мой тест 2' },
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.preset.name).toBe('Мой тест 2');
    }

    const removed = await PresetsService.remove({
      presetId: created.preset.id,
      playerId: player.id,
      isAdmin: false,
    });
    expect(removed.ok).toBe(true);
    createdPresetIds.splice(createdPresetIds.indexOf(created.preset.id), 1);
  });

  test('non-admin cannot create global preset', async () => {
    const player = await createPlayer('player');
    createdPlayerIds.push(player.id);

    const result = await PresetsService.create({
      playerId: player.id,
      isAdmin: false,
      body: { name: 'Глобал хак', slots: trioSlots, global: true },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  test('admin creates global; player sees and cannot delete', async () => {
    const admin = await createPlayer('admin');
    const player = await createPlayer('player');
    createdPlayerIds.push(admin.id, player.id);

    const created = await PresetsService.create({
      playerId: admin.id,
      isAdmin: true,
      body: { name: `Глоб ${suffix}`, slots: trioSlots, global: true },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    createdPresetIds.push(created.preset.id);
    expect(created.preset.isGlobal).toBe(true);

    const forPlayer = await PresetsService.list({
      playerId: player.id,
      scope: 'global',
    });
    expect(forPlayer.some((item) => item.id === created.preset.id)).toBe(true);

    const usable = await PresetsService.getUsableByPlayer(created.preset.id, player.id);
    expect(usable).not.toBeNull();

    const denied = await PresetsService.remove({
      presetId: created.preset.id,
      playerId: player.id,
      isAdmin: false,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.status).toBe(403);
    }

    const removed = await PresetsService.remove({
      presetId: created.preset.id,
      playerId: admin.id,
      isAdmin: true,
    });
    expect(removed.ok).toBe(true);
    createdPresetIds.splice(createdPresetIds.indexOf(created.preset.id), 1);
  });

  test('cannot use another player personal preset', async () => {
    const owner = await createPlayer('player');
    const other = await createPlayer('player');
    createdPlayerIds.push(owner.id, other.id);

    const created = await PresetsService.create({
      playerId: owner.id,
      isAdmin: false,
      body: { name: 'Чужой', slots: trioSlots },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    createdPresetIds.push(created.preset.id);

    const usable = await PresetsService.getUsableByPlayer(created.preset.id, other.id);
    expect(usable).toBeNull();
  });
});
