import type { AttackKind } from './damage';

/**
 * Тип базовой атаки для классов без слотов способностей (Бес и т.п. — MeleePattern в боте).
 * У пилотов тип задаёт каждая способность сама.
 */
export function basicAttackKind(_code: string): AttackKind {
  return 'melee';
}
