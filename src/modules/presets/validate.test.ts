import { describe, expect, test } from 'bun:test';

import { normalizePresetName, validatePresetSlots } from './validate';

const heroes = new Map([
  ['Knight', { code: 'Knight', displayName: 'Рыцарь', size: 1, isPlayable: true }],
  ['Oracle', { code: 'Oracle', displayName: 'Оракул', size: 1, isPlayable: true }],
  ['Herbalist', { code: 'Herbalist', displayName: 'Травница', size: 1, isPlayable: true }],
  ['DemonLord', { code: 'DemonLord', displayName: 'Владыка', size: 2, isPlayable: true }],
  ['Locked', { code: 'Locked', displayName: 'Закрыт', size: 1, isPlayable: false }],
]);

describe('validatePresetSlots', () => {
  test('accepts size 3 squad', () => {
    const result = validatePresetSlots({
      slots: [
        { heroClassCode: 'Knight', row: 0 },
        { heroClassCode: 'Oracle', row: 1 },
        { heroClassCode: 'Herbalist', row: 1 },
      ],
      heroesByCode: heroes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.teamSize).toBe(3);
    }
  });

  test('rejects size below 3', () => {
    const result = validatePresetSlots({
      slots: [
        { heroClassCode: 'Knight', row: 0 },
        { heroClassCode: 'Oracle', row: 1 },
      ],
      heroesByCode: heroes,
    });
    expect(result.ok).toBe(false);
  });

  test('rejects unplayable hero', () => {
    const result = validatePresetSlots({
      slots: [
        { heroClassCode: 'Locked', row: 0 },
        { heroClassCode: 'Oracle', row: 1 },
        { heroClassCode: 'Herbalist', row: 1 },
      ],
      heroesByCode: heroes,
    });
    expect(result.ok).toBe(false);
  });
});

describe('normalizePresetName', () => {
  test('trims and accepts', () => {
    expect(normalizePresetName('  Мой отряд  ')).toBe('Мой отряд');
  });

  test('rejects empty', () => {
    expect(normalizePresetName('   ')).toBeNull();
  });
});
