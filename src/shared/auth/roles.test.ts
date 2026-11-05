import { describe, expect, test } from 'bun:test';

import { isStaffRole } from './roles';

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
