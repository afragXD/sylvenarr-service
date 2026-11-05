import { describe, expect, test } from 'bun:test';

import { isCreatorRole, isStaffRole } from './roles';

describe('isStaffRole', () => {
  test('admin и creator — staff', () => {
    expect(isStaffRole('admin')).toBe(true);
    expect(isStaffRole('creator')).toBe(true);
  });

  test('player и пустое — нет', () => {
    expect(isStaffRole('player')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
    expect(isStaffRole('')).toBe(false);
  });
});

describe('isCreatorRole', () => {
  test('только creator', () => {
    expect(isCreatorRole('creator')).toBe(true);
    expect(isCreatorRole('admin')).toBe(false);
    expect(isCreatorRole('player')).toBe(false);
  });
});
