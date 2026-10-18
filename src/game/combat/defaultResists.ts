import type { DamageSource } from './damageSources';
import { cloneResists } from './resists';
import type { ResistEntry, ResistMap } from './types';

type Spec = {
  value?: number;
  ward?: number;
  immune?: boolean;
};

const entry = (spec: Spec = {}): ResistEntry => {
  const result: ResistEntry = { value: spec.value ?? 0 };
  if (spec.immune) {
    result.immune = true;
  }
  if (spec.ward && spec.ward > 0) {
    result.wardCharges = spec.ward;
  }
  return result;
};

const map = (pairs: Array<[DamageSource, Spec]>): ResistMap => {
  const resists: ResistMap = {};
  for (const [source, spec] of pairs) {
    resists[source] = entry(spec);
  }
  return resists;
};

/**
 * Стартовые резисты классов (порт конструкторов arenamsterbot/characters + summon_classes).
 * Коды — HeroClass.code веба.
 */
export const DEFAULT_RESISTS: Record<string, ResistMap> = {
  Pyro: map([['FIRE', { ward: 1 }]]),
  Oracle: map([['FIRE', { ward: 1 }]]),
  Witch: map([
    ['FINALSTRIKE', { value: 25, ward: 1 }],
    ['DEATH', { value: 25, ward: 1 }],
    ['FIRE', { value: -20 }],
    ['WATER', { value: -20 }],
  ]),
  Paladin: map([
    ['HOLY', { value: 20 }],
    ['WATER', { value: 25, ward: 1 }],
    ['DESTROYARMOR', { ward: 1 }],
  ]),
  Knight: map([['FINALSTRIKE', { value: 25 }]]),
  Archlich: map([
    ['FIRE', { value: -20 }],
    ['DEATH', { value: 75, ward: 1 }],
    ['HOLY', { value: -20 }],
  ]),
  Marauder: map([
    ['POLYMORPH', { value: 25, ward: 1 }],
    ['HOLY', { value: 40 }],
  ]),
  Werewolf: map([
    ['POLYMORPH', { value: 25, ward: 1 }],
    ['HOLY', { value: 40 }],
  ]),
  GoldGolem: map([
    ['FIRE', { value: 25, ward: 1 }],
    ['AIR', { value: 25, ward: 1 }],
    ['DEATH', { value: 25 }],
  ]),
  Herbalist: map([['STUN', { ward: 1 }]]),
  Inquisitor: map([
    ['MIND', { value: 60, ward: 1 }],
    ['FIRE', { value: 20 }],
    ['LOWERINGLEVEL', { ward: 1 }],
  ]),
  Dracolich: map([
    ['MOVEMENT', { ward: 1 }],
    ['DEATH', { value: 80, ward: 1 }],
    ['LOWERINGLEVEL', { immune: true }],
    ['POLYMORPH', { ward: 1 }],
  ]),
  GhostWarrior: map([
    ['DEATH', { value: 85 }],
    ['HOLY', { value: -35 }],
    ['WEAPON', { value: 20 }],
  ]),
  Demiurge: map([
    ['IMITATION', { immune: true }],
    ['AIR', { value: 20 }],
    ['POLYMORPH', { ward: 1 }],
  ]),
  DemonLord: map([
    ['MOVEMENT', { immune: true }],
    ['FIRE', { value: 50, ward: 1 }],
    ['MIND', { ward: 1 }],
  ]),
  Abbess: map([
    ['IMITATION', { ward: 1 }],
    ['AIR', { value: 20, ward: 1 }],
    ['EARTH', { value: 15 }],
  ]),
  Assassin: map([
    ['MIND', { value: -25 }],
    ['DEATH', { value: 35, ward: 1 }],
  ]),
  Zombie: map([
    ['FIRE', { value: -25 }],
    ['DEATH', { value: 50 }],
    ['HOLY', { value: -40 }],
  ]),
  SkeletonChampion: map([
    ['AIR', { value: -25 }],
    ['DEATH', { value: 65 }],
    ['ARROWS', { value: 50, ward: 1 }],
    ['HOLY', { value: -30 }],
  ]),
  Ectoplasm: map([['WEAPON', { ward: 1 }]]),
};

/**
 * Копия дефолтных резистов класса (пустая карта, если не заданы).
 */
export function resistsForClass(heroClassCode: string): ResistMap {
  const base = DEFAULT_RESISTS[heroClassCode];
  return base ? cloneResists(base) : {};
}
