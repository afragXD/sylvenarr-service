import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/shared/generated/prisma/client';
import { heroSeeds } from './seed-data/heroes';
import { globalSquadPresetSeeds } from './seed-data/squad-presets';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  for (const hero of heroSeeds) {
    await prisma.heroClass.upsert({
      where: { code: hero.code },
      create: { ...hero },
      update: {
        displayName: hero.displayName,
        description: hero.description,
        roleSummary: hero.roleSummary,
        health: hero.health,
        damage: hero.damage,
        armor: hero.armor,
        initiative: hero.initiative,
        dodge: hero.dodge,
        luck: hero.luck,
        morale: hero.morale,
        mana: hero.mana,
        maxMana: hero.maxMana,
        power: hero.power,
        gold: hero.gold,
        accuracy: hero.accuracy,
        size: hero.size,
        isPlayable: hero.isPlayable,
        sortOrder: hero.sortOrder,
      },
    });
  }
  console.log(`Seed: upsert ${heroSeeds.length} hero classes`);

  for (const pack of globalSquadPresetSeeds) {
    const existing = await prisma.squadPreset.findUnique({
      where: { catalogCode: pack.catalogCode },
      select: { id: true },
    });
    if (existing) {
      await prisma.squadPresetSlot.deleteMany({ where: { presetId: existing.id } });
      await prisma.squadPreset.update({
        where: { id: existing.id },
        data: {
          name: pack.name,
          teamSize: pack.teamSize,
          playerId: null,
          slots: {
            create: pack.slots.map((slot) => ({
              heroClassCode: slot.heroClassCode,
              row: slot.row,
              slotOrder: slot.slotOrder,
            })),
          },
        },
      });
    } else {
      await prisma.squadPreset.create({
        data: {
          catalogCode: pack.catalogCode,
          name: pack.name,
          teamSize: pack.teamSize,
          playerId: null,
          slots: {
            create: pack.slots.map((slot) => ({
              heroClassCode: slot.heroClassCode,
              row: slot.row,
              slotOrder: slot.slotOrder,
            })),
          },
        },
      });
    }
  }
  console.log(`Seed: upsert ${globalSquadPresetSeeds.length} global squad presets`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
