import { Elysia } from 'elysia';
import { config } from '../../config';

/**
 * Плагин проверки API-ключа для мутирующих операций.
 */
export const apiKeyPlugin = new Elysia({ name: 'api-key' }).macro({
  requireApiKey: {
    beforeHandle({ headers, status }) {
      const apiKeyHeader: string | undefined = headers['x-api-key'];
      if (apiKeyHeader !== config.API_KEY) {
        return status(401, { message: 'Неверный или отсутствующий API ключ' });
      }
    },
  },
});
