import { t } from 'elysia';

export namespace AppModel {
  export const healthcheckResponse = t.Object({
    status: t.Literal('ok'),
    timestamp: t.String(),
    version: t.String(),
    /** SHA коммита сервиса (GIT_SHA / COMMIT_SHA / SOURCE_VERSION). */
    commit: t.String(),
    uptime: t.String(),
    database: t.Object({
      status: t.Union([t.Literal('connected'), t.Literal('disconnected')]),
      responseTime: t.Number(),
    }),
  });
  export type healthcheckResponse = typeof healthcheckResponse.static;
}
