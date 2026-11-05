/** Пол юнита для механик (пассивка ПЭ и далее). */
export type HeroGender = 'female' | 'male' | 'none';

const FEMALE_CODES = new Set([
  'Detective',
  'Abbess',
  'Witch',
  'Specter',
  'Oracle',
  'Herbalist',
  'Mermaid',
  'Angel',
]);

const NONE_CODES = new Set(['EvilTree', 'Ectoplasm']);

/**
 * Пол по коду класса. Неизвестные коды → male (безопасный дефолт для саммонов/новых классов).
 */
export function genderForClass(code: string): HeroGender {
  if (FEMALE_CODES.has(code)) {
    return 'female';
  }
  if (NONE_CODES.has(code)) {
    return 'none';
  }
  return 'male';
}
