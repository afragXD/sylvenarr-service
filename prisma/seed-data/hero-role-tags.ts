/**
 * Каталог ролевых тегов и связи с HeroClass.
 * label — подпись CAPS для UI; mood — цвет чипа на клиенте.
 */

export type HeroRoleTagMood =
  | 'offense'
  | 'support'
  | 'heal'
  | 'control'
  | 'summon'
  | 'curse'
  | 'identity';

export type HeroRoleTagSeed = {
  readonly id: string;
  readonly label: string;
  readonly mood: HeroRoleTagMood;
  readonly sortOrder: number;
};

export const heroRoleTagSeeds: ReadonlyArray<HeroRoleTagSeed> = [
  { id: 'dd_melee', label: 'ДД-МИЛИ', mood: 'offense', sortOrder: 10 },
  { id: 'dd_ranged', label: 'ДД-РЕЙНДЖ', mood: 'offense', sortOrder: 20 },
  { id: 'dd_mage', label: 'ДД-МАГ', mood: 'offense', sortOrder: 30 },
  { id: 'aoe', label: 'АОЕ', mood: 'offense', sortOrder: 40 },
  { id: 'berserk', label: 'БЕРСЕРК', mood: 'offense', sortOrder: 50 },
  { id: 'crits', label: 'КРИТЫ', mood: 'offense', sortOrder: 60 },
  { id: 'support', label: 'САППОРТ', mood: 'support', sortOrder: 70 },
  { id: 'buffer', label: 'БАФФЕР', mood: 'support', sortOrder: 80 },
  { id: 'guard', label: 'ОХРАНА', mood: 'support', sortOrder: 90 },
  { id: 'healer', label: 'ХИЛЕР', mood: 'heal', sortOrder: 100 },
  { id: 'regen', label: 'РЕГЕН', mood: 'heal', sortOrder: 110 },
  { id: 'resurrect', label: 'ВОСКРЕШЕНИЕ', mood: 'heal', sortOrder: 120 },
  { id: 'control', label: 'КОНТРОЛЬ', mood: 'control', sortOrder: 130 },
  { id: 'morph', label: 'МОРФ', mood: 'control', sortOrder: 140 },
  { id: 'stealth', label: 'СТЕЛС', mood: 'control', sortOrder: 150 },
  { id: 'summoner', label: 'ПРИЗЫВАТЕЛЬ', mood: 'summon', sortOrder: 160 },
  { id: 'morale_damage', label: 'БЬЮЩИЙ ПО МОРАЛИ', mood: 'curse', sortOrder: 170 },
  { id: 'poison', label: 'ЯД', mood: 'curse', sortOrder: 180 },
  { id: 'mark', label: 'МЕТКА', mood: 'curse', sortOrder: 190 },
  { id: 'vampirism', label: 'ВАМПИР', mood: 'curse', sortOrder: 200 },
  { id: 'reflect', label: 'ОТРАЖЕНИЕ', mood: 'curse', sortOrder: 210 },
  { id: 'undead', label: 'НЕЖИТЬ', mood: 'identity', sortOrder: 220 },
  { id: 'demon', label: 'ДЕМОН', mood: 'identity', sortOrder: 230 },
  { id: 'giant', label: 'ГИГАНТ', mood: 'identity', sortOrder: 240 },
  { id: 'construct', label: 'МЕХАНИЗМ', mood: 'identity', sortOrder: 250 },
];

/** Порядок массива = порядок чипов у героя. */
export const heroClassRoleTagMap: Readonly<Record<string, ReadonlyArray<string>>> = {
  Assassin: ['dd_melee', 'crits', 'morph'],
  Paladin: ['dd_melee', 'regen'],
  Inquisitor: ['dd_melee', 'control'],
  Detective: ['dd_melee', 'stealth'],
  DemonLord: ['giant', 'demon', 'aoe', 'control'],
  Abbess: ['support', 'healer', 'dd_mage', 'buffer'],
  OrcKing: ['dd_melee', 'berserk', 'summoner'],
  Marauder: ['dd_ranged', 'aoe', 'morph'],
  Archlich: ['dd_mage', 'summoner', 'undead', 'morale_damage'],
  Witch: ['dd_ranged', 'vampirism', 'morph', 'mark'],
  GhostWarrior: ['dd_melee', 'undead', 'vampirism', 'buffer'],
  Specter: ['control', 'undead', 'mark'],
  Oracle: ['healer', 'buffer', 'support'],
  Herbalist: ['buffer', 'healer', 'support'],
  Demiurge: ['dd_mage', 'summoner', 'control'],
  GoldGolem: ['dd_melee', 'construct', 'reflect', 'buffer'],
  BeerElemental: ['buffer', 'poison', 'crits'],
  Knight: ['dd_melee', 'guard', 'buffer'],
  Mermaid: ['healer', 'control', 'regen'],
  Patriarch: ['healer', 'resurrect', 'guard'],
  Pyro: ['dd_mage', 'aoe', 'buffer'],
  EvilTree: ['buffer', 'vampirism', 'support'],
  Dracolich: ['giant', 'undead', 'aoe', 'morale_damage'],
  Werewolf: ['morph', 'dd_melee'],
  GoblinTrapper: ['dd_ranged', 'poison'],
  GoblinShaman: ['dd_mage', 'buffer'],
  Zombie: ['undead', 'morale_damage'],
  SkeletonChampion: ['undead', 'dd_melee'],
  Ectoplasm: ['dd_mage'],
  Imp: ['morph', 'demon'],
};
