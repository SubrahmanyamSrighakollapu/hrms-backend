import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/prisma';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    console.log(`\n  HRMS API running [${env.NODE_ENV}]`);
    console.log(`  http://localhost:${env.PORT}${env.API_PREFIX}`);
    console.log(`  Health: http://localhost:${env.PORT}${env.API_PREFIX}/health\n`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      console.log('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
