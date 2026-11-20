import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { hasPermission, toPermissionMap, type PermissionLevel } from '../config/modules';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Loads the account behind an id and rebuilds the permission map from the
 * role currently assigned to it.
 *
 * This runs on every request so deactivating an account or changing a role's
 * permissions takes effect immediately - a token never carries stale rights.
 *
 * Exported so the Socket.IO gateway can authenticate a handshake with the
 * exact same rules as HTTP requests.
 */
export async function resolveUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      status: true,
      roleId: true,
      role: {
        select: {
          key: true,
          permissions: { select: { module: true, level: true } },
        },
      },
    },
  });

  if (!user) {
    throw ApiError.unauthorized('Account no longer exists');
  }

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden(`Account is ${user.status.toLowerCase()}`);
  }

  return {
    id: user.id,
    email: user.email,
    roleId: user.roleId,
    roleKey: user.role?.key ?? null,
    permissions: toPermissionMap(user.role?.permissions ?? []),
  };
}

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/** Verifies the Bearer access token and attaches `req.user`, or rejects. */
export const authenticate: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = readBearerToken(req);
    if (!token) {
      throw ApiError.unauthorized('Missing bearer token');
    }

    const claims = verifyAccessToken(token);
    req.user = await resolveUser(claims.sub);

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Same as `authenticate` but never rejects: an invalid, expired or missing
 * token simply leaves `req.user` undefined. Used by endpoints that also work
 * anonymously (e.g. logout, which can revoke using the refresh token alone).
 */
export const optionalAuth: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const token = readBearerToken(req);

  if (token) {
    try {
      const claims = verifyAccessToken(token);
      req.user = await resolveUser(claims.sub);
    } catch {
      // Treated as an anonymous request.
    }
  }

  next();
};

/**
 * Built-in role guard, kept for system-only endpoints.
 * Usage: router.post('/', authenticate, authorize('ADMIN'), handler)
 */
export const authorize =
  (...allowedRoleKeys: string[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (!req.user.roleKey || !allowedRoleKeys.includes(req.user.roleKey)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }

    return next();
  };

/**
 * Permission guard - the primary way modules protect their endpoints.
 * Usage: router.patch('/:id', authenticate, requirePermission('roles', 'MANAGE'), handler)
 */
export const requirePermission =
  (moduleId: string, level: Exclude<PermissionLevel, 'NONE'> = 'VIEW'): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (!hasPermission(req.user.permissions, moduleId, level)) {
      return next(
        ApiError.forbidden(`You need ${level} access to ${moduleId} to perform this action`),
      );
    }

    return next();
  };
