import { t } from 'elysia';

export namespace AppModel {
  export const healthcheckResponse = t.Object({
    status: t.Literal('ok'),
    timestamp: t.String(),
    version: t.String(),
    uptime: t.String(),
    database: t.Object({
      status: t.Union([t.Literal('connected'), t.Literal('disconnected')]),
      responseTime: t.Number(),
    }),
  });
  export type healthcheckResponse = typeof healthcheckResponse.static;
}
