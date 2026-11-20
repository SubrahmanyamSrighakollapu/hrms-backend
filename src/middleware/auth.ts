import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Verifies the Bearer access token and attaches `req.user`.
 * Also re-checks the user exists and is ACTIVE on every request so that
 * deactivating an account takes effect immediately.
 */
export const authenticate: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing bearer token');
    }

    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user) {
      throw ApiError.unauthorized('Account no longer exists');
    }

    if (user.status !== 'ACTIVE') {
      throw ApiError.forbidden(`Account is ${user.status.toLowerCase()}`);
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role guard. Usage: router.post('/', authenticate, authorize('ADMIN', 'HR'), handler)
 */
export const authorize =
  (...allowedRoles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }

    return next();
  };
