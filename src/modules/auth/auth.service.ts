import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma, type User } from '@prisma/client';
import { toPermissionMap, type PermissionLevel } from '../../config/modules';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { issueTokenPair, verifyRefreshToken, type TokenPair } from '../../utils/jwt';
import type { LoginInput, RegisterInput } from './auth.validation';

/** Built-in role assigned to self-registered accounts. */
const DEFAULT_ROLE_KEY = 'EMPLOYEE';

/** Role + permissions + department loaded alongside a user for every auth response. */
const withRole = {
  role: {
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      isSystem: true,
      permissions: { select: { module: true, level: true } },
    },
  },
  department: { select: { id: true, name: true } },
} satisfies Prisma.UserInclude;

type UserWithRole = Prisma.UserGetPayload<{ include: typeof withRole }>;

/** Shape returned to the client - never includes the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  roleId: string | null;
  roleKey: string | null;
  status: User['status'];
  phone: string | null;
  avatarUrl: string | null;
  employeeCode: string | null;
  departmentId: string | null;
  department: string | null;
  designation: string | null;
  category: User['category'];
  employmentType: User['employmentType'];
  managerId: string | null;
  joinedAt: Date | null;
  probationEndDate: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface RoleSummary {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface SessionPayload {
  user: PublicUser;
  role: RoleSummary | null;
  permissions: Record<string, PermissionLevel>;
}

export interface AuthResult extends SessionPayload {
  tokens: TokenPair;
}

export function toPublicUser(user: UserWithRole): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    roleId: user.roleId,
    roleKey: user.role?.key ?? null,
    status: user.status,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    employeeCode: user.employeeCode,
    departmentId: user.departmentId,
    department: user.department?.name ?? null,
    designation: user.designation,
    category: user.category,
    employmentType: user.employmentType,
    managerId: user.managerId,
    joinedAt: user.joinedAt,
    probationEndDate: user.probationEndDate,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

/** Public user + the role they carry + flattened permissions. */
export function toSession(user: UserWithRole): SessionPayload {
  return {
    user: toPublicUser(user),
    role: user.role
      ? {
          id: user.role.id,
          key: user.role.key,
          name: user.role.name,
          description: user.role.description,
          isSystem: user.role.isSystem,
        }
      : null,
    permissions: toPermissionMap(user.role?.permissions ?? []),
  };
}

function buildPayload(user: UserWithRole) {
  return { sub: user.id, email: user.email };
}

/**
 * Public self sign-up. Always lands on the built-in Employee role so the role
 * cannot be escalated from the client. ADMIN/HR accounts are created by an
 * admin (or by the seed script).
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const defaultRole = await prisma.role.findUnique({ where: { key: DEFAULT_ROLE_KEY } });
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      roleId: defaultRole?.id ?? null,
    },
    include: withRole,
  });

  const tokens = issueTokenPair(buildPayload(user));
  await storeRefreshToken(user.id, tokens.refreshToken);

  return { ...toSession(user), tokens };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email }, include: withRole });

  // Same error for unknown email and wrong password to avoid user enumeration.
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden(`Account is ${user.status.toLowerCase()}`);
  }

  const tokens = issueTokenPair(buildPayload(user));

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      refreshTokenHash: hashToken(tokens.refreshToken),
    },
    include: withRole,
  });

  return { ...toSession(updated), tokens };
}

/** Rotates the refresh token: old token is invalidated by overwriting the stored hash. */
export async function refresh(refreshToken: string): Promise<AuthResult> {
  const payload = verifyRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: withRole });

  // No stored hash => signed out, revoked, or never issued.
  if (!user?.refreshTokenHash) {
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  // A deactivated account must not be able to mint new tokens.
  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden(`Account is ${user.status.toLowerCase()}`);
  }

  const matches = tokenMatches(refreshToken, user.refreshTokenHash);
  if (!matches) {
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  const tokens = issueTokenPair(buildPayload(user));
  await storeRefreshToken(user.id, tokens.refreshToken);

  return { ...toSession(user), tokens };
}

/**
 * Revokes the stored refresh token. Works with an authenticated user or, if
 * the access token has already expired, with the refresh token itself - so a
 * session can always be ended server-side.
 */
export async function logout(userId: string | null, refreshToken?: string): Promise<void> {
  let target = userId;

  if (!target && refreshToken) {
    try {
      target = verifyRefreshToken(refreshToken).sub;
    } catch {
      return; // Nothing to revoke for an unusable token.
    }
  }

  if (!target) return;

  await prisma.user.update({ where: { id: target }, data: { refreshTokenHash: null } });
}

export async function getProfile(userId: string): Promise<SessionPayload> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: withRole });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return toSession(user);
}

async function storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: hashToken(refreshToken) },
  });
}

/**
 * Refresh tokens are long, high-entropy JWTs, so a SHA-256 digest is the right
 * way to store them. bcrypt must NOT be used here: it only reads the first 72
 * bytes, and two JWTs for the same user share that prefix - they would compare
 * as equal and rotation would never invalidate the previous token.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of a token against its stored digest. */
function tokenMatches(token: string, storedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
