import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { swagger } from '@elysiajs/swagger';
import { Elysia } from 'elysia';
import { config } from './config';
import { appController } from './modules/app';
import { isDev } from './utils/isDev';

export const app = new Elysia({
  aot: !isDev,
  precompile: !isDev,
  strictPath: true,
  serve: {
    maxRequestBodySize: 1024 * 1024 * 256, // 256MB
    idleTimeout: 75,
    hostname: '0.0.0.0',
  },
  cookie: {
    sameSite: 'none',
    secure: !isDev,
    httpOnly: true,
    path: '/',
  },
})
  .use(swagger())
  .use(
    cors({
      origin: [config.FRONTEND_URL, config.LOCAL_FRONTEND_URL, config.LOCAL_FRONTEND_URL2],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-API-Key'],
      credentials: true,
    })
  )
  .use(
    staticPlugin({
      assets: 'static/public',
      prefix: '/static',
      alwaysStatic: true,
    })
  )
  .use(appController);
