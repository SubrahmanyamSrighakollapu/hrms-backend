import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * Single PrismaClient instance shared across the process.
 * In dev, tsx watch reloads the module graph; keep the client on globalThis
 * so hot reloads do not open new connection pools.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (env.isDevelopment) {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
