import { INVITE_CODE_LENGTH } from '../shared/constants/session';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Генерирует короткий код приглашения для лобби.
 */
export function createInviteCode(length: number = INVITE_CODE_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
