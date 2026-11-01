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
  DEFEND: 'Защитная стойка',
  POLYMORPH: 'Многоликий',
  INFECTED: 'Инфицирован',
  FIRESHIELD: 'Огненный щит',
  AIRSHIELD: 'Воздушный щит',
  LUCKY: 'Удача',
  FOCUSED: 'Изменение точности',
  STUNNED: 'Оглушение',
  STUN_IMMUNE: 'Сопротивление оглушению',
  WEAKNESS: 'Слабость',
  UNLUCKY: 'Неудача',
  GALL: 'Желчь',
  SANCTUM: 'Святилище',
  FIREDWEAPON: 'Огненное оружие',
  AIRWEAPON: 'Электрическое оружие',
  MIND_WARD: 'Вард разума',
  INVISIBLE: 'Невидимость',
  INTERDICT: 'Запрет лечения',
  MAGIC_SHACKLES: 'Волшебные оковы',
  ENSLAVED: 'Порабощённый',
  ROW_FORTIFY: 'Укрепление ряда',
  ASHILLNESS: 'Пепельная язва',
  ABSOLUTEPOWER: 'Могущество',
  BERSERK: 'Руна берсерка',
  IMAGINARY_HEALTH: 'Мнимое здоровье',
  IMMOLATION: 'Нечистый договор',
  DEATHWARD: 'Оковы войны',
  PAIN_REFLECT: 'Отражение боли',
  LIFE_FETTERS: 'Оковы взаимного терпения',
  LIFE_THREAD: 'Жизнь на нитке',
  ERUPTION: 'Извержение',
};

/**
 * Русское имя эффекта для боевого лога.
 * FOCUSED: нейтральное / + / − по знаку силы (CUT AC-12).
 */
export function effectLogLabel(id: EffectId | string, power?: number): string {
  if (id === 'FOCUSED') {
    if (typeof power === 'number') {
      if (power > 0) {
        return 'Повышение точности';
      }
      if (power < 0) {
        return 'Снижение точности';
      }
    }
    return 'Изменение точности';
  }
  return LABELS[id as EffectId] ?? id;
}
