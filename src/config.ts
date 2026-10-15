import env from 'env-var';

export const config = {
  NODE_ENV: env
    .get('NODE_ENV')
    .default('development')
    .asEnum(['production', 'test', 'development']),

  PORT: env.get('PORT').default(4000).asPortNumber(),
  API_URL: env
    .get('API_URL')
    .default(`https://${env.get('PUBLIC_DOMAIN').asString()}`)
    .asString(),
  DATABASE_URL: env.get('DATABASE_URL').required().asString(),
  /** Опционально до фазы 3 (realtime бой). */
  REDIS_URL: env.get('REDIS_URL').asString(),
  API_KEY: env.get('API_KEY').required().asString(),
  FRONTEND_URL: env.get('FRONTEND_URL').required().asString(),
  LOCAL_FRONTEND_URL: env.get('LOCAL_FRONTEND_URL').default('http://localhost:4001').asString(),
  LOCAL_FRONTEND_URL2: env.get('LOCAL_FRONTEND_URL2').default('https://localhost:4001').asString(),
};
