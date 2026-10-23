import type { EffectId } from './types';

const LABELS: Record<EffectId, string> = {
  GUARDED: 'Под охраной',
  STRENGTH: 'Сила',
  BLESSED: 'Благословение',
  POISON: 'Отравление',
  BURNING: 'Поджог',
  BLEEDING: 'Кровотечение',
  FATMAN: 'Головокружение',
  HAPPY: 'Радость',
  CHAINED: 'Обездвиженный',
  FEAR: 'Ужас',
  VAMPWEAPON: 'Пьющий жизни',
  REGENHP: 'Регенерация',
  HASTE: 'Ускорение',
  CHAMELEON: 'Хамелеон',
  PETRIFIED: 'Окаменение',
  SLOW: 'Замедление',
  STONEFLESH: 'Каменная плоть',
  CONTR: 'Контрудар',
  MARKED: 'Метка',
  DEATHSENTENCE: 'Смертный приговор',
  INTERFERENCE: 'Помехи',
  SILENCE: 'Немота',
  IMPISH: 'Бес',
  LUCKY: 'Удача',
  FOCUSED: 'Сосредоточение',
  STUNNED: 'Оглушение',
  STUN_IMMUNE: 'Сопротивление оглушению',
  WEAKNESS: 'Слабость',
  UNLUCKY: 'Неудача',
  GALL: 'Желчь',
  SANCTUM: 'Святилище',
  FIREDWEAPON: 'Огненное оружие',
  MIND_WARD: 'Вард разума',
  INVISIBLE: 'Невидимость',
  INTERDICT: 'Запрет лечения',
  MAGIC_SHACKLES: 'Волшебные оковы',
  ENSLAVED: 'Порабощённый',
  ROW_FORTIFY: 'Укрепление ряда',
  ASHILLNESS: 'Пепельная язва',
  ABSOLUTEPOWER: 'Могущество',
};

/**
 * Русское имя эффекта для боевого лога.
 */
export function effectLogLabel(id: EffectId | string): string {
  return LABELS[id as EffectId] ?? id;
}
