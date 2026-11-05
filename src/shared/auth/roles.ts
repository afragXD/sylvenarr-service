/**
 * Роли с полным админ-доступом (новости, глобальные пресеты и т.д.).
 * Сейчас admin и creator равноправны; позже права креатора можно сузить.
 */
export function isStaffRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'creator';
}

/** Только creator (редактор живых матчей и т.п.). */
export function isCreatorRole(role: string | null | undefined): boolean {
  return role === 'creator';
}
