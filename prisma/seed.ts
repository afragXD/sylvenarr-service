import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/shared/generated/prisma/client';
import { heroSeeds } from './seed-data/heroes';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  for (const hero of heroSeeds) {
    await prisma.heroClass.upsert({
      where: { code: hero.code },
      create: { ...hero },
      update: {
        displayName: hero.displayName,
        health: hero.health,
        damage: hero.damage,
        armor: hero.armor,
        initiative: hero.initiative,
        dodge: hero.dodge,
        luck: hero.luck,
        morale: hero.morale,
        mana: hero.mana,
        power: hero.power,
        gold: hero.gold,
        accuracy: hero.accuracy,
        isPlayable: hero.isPlayable,
        sortOrder: hero.sortOrder,
      },
    });
  }
  console.log(`Seed: upsert ${heroSeeds.length} hero classes`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
