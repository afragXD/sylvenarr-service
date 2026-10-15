import { config } from './config';
import { app } from './server';
import { prisma } from './shared/db/index';

const signals = ['SIGINT', 'SIGTERM'];

for (const signal of signals) {
  process.on(signal, async () => {
    console.log(`Received ${signal}. Initiating graceful shutdown...`);
    await app.stop();
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('uncaughtException', (error) => {
  console.error(error);
});

process.on('unhandledRejection', (error) => {
  console.error(error);
});

await prisma.$connect();
console.log('🗄️ Database was connected!');

app.listen(config.PORT, () =>
  console.log(`🦊 Server started at ${app.server?.url.origin} and mode ${config.NODE_ENV}`)
);
