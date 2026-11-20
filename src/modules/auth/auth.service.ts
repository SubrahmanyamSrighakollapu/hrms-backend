import bcrypt from 'bcryptjs';
import type { Role, User } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { issueTokenPair, verifyRefreshToken, type TokenPair } from '../../utils/jwt';
import type { LoginInput, RegisterInput } from './auth.validation';

/** Shape returned to the client - never includes the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  status: User['status'];
  phone: string | null;
  avatarUrl: string | null;
  employeeCode: string | null;
  department: string | null;
  designation: string | null;
  managerId: string | null;
  joinedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    role: user.role,
    status: user.status,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    employeeCode: user.employeeCode,
    department: user.department,
    designation: user.designation,
    managerId: user.managerId,
    joinedAt: user.joinedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

function buildPayload(user: User) {
  return { sub: user.id, email: user.email, role: user.role };
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

/**
 * Public self sign-up. Always creates an EMPLOYEE so the role cannot be
 * escalated from the client. ADMIN/HR accounts are created by an admin
 * (or by the seed script).
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      role: 'EMPLOYEE',
    },
  });

  const tokens = issueTokenPair(buildPayload(user));
  await storeRefreshToken(user.id, tokens.refreshToken);

  return { user: toPublicUser(user), tokens };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

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
      refreshTokenHash: await bcrypt.hash(tokens.refreshToken, env.BCRYPT_SALT_ROUNDS),
    },
  });

  return { user: toPublicUser(updated), tokens };
}

/** Rotates the refresh token: old token is invalidated by overwriting the stored hash. */
export async function refresh(refreshToken: string): Promise<AuthResult> {
  const payload = verifyRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user?.refreshTokenHash) {
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!matches) {
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  const tokens = issueTokenPair(buildPayload(user));
  await storeRefreshToken(user.id, tokens.refreshToken);

  return { user: toPublicUser(user), tokens };
}

export async function logout(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: null },
  });
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return toPublicUser(user);
}

async function storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: await bcrypt.hash(refreshToken, env.BCRYPT_SALT_ROUNDS) },
  });
}
