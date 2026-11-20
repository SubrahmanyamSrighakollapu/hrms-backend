import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { prisma } from '../../config/prisma';

const router = Router();

/** Liveness probe. */
router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

/** Readiness probe - confirms the database is reachable. */
router.get(
  '/db',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, data: { database: 'connected' } });
  }),
);

export default router;
