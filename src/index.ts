import 'dotenv/config';
import { createServer, type Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/prisma';
import { attachChatRealtime } from './modules/chat/chat.socket';
import { ensureStorageDirs } from './modules/chat/chat.storage';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  // Create the chat attachment tree up front so the first upload never races
  // directory creation.
  await ensureStorageDirs();

  const app = createApp();
  const server: Server = createServer(app);

  // Socket.IO rides on the same HTTP server/process as the REST API (spec §17).
  attachChatRealtime(server);

  server.listen(env.PORT, () => {
    console.log(`\n  HRMS API running [${env.NODE_ENV}]`);
    console.log(`  http://localhost:${env.PORT}${env.API_PREFIX}`);
    console.log(`  Health: http://localhost:${env.PORT}${env.API_PREFIX}/health`);
    console.log(`  Chat realtime: ws://localhost:${env.PORT}/socket.io\n`);
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
