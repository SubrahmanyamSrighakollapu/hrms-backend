import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './ApiError';

/** Who the token was issued for. Only these claims go inside a token. */
export interface TokenSubject {
  sub: string;
  email: string;
}

/**
 * Tokens carry an explicit `typ` claim so an access token can never be
 * replayed as a refresh token (or vice versa), independent of the secrets.
 */
export interface AccessClaims extends TokenSubject {
  typ: 'access';
}

export interface RefreshClaims extends TokenSubject {
  typ: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function sign(claims: TokenSubject & { typ: 'access' | 'refresh' }, secret: string, expiresIn: string): string {
  // `jwtid` guarantees every token is unique. Without it two tokens issued for
  // the same user within the same second would be byte-identical, which would
  // make refresh-token rotation a no-op (the old token would still validate).
  return jwt.sign(claims, secret, { expiresIn, jwtid: randomUUID() } as SignOptions);
}

/** Verifies signature + expiry + token type, and normalises the claims. */
function verify(token: string, secret: string, expected: 'access' | 'refresh') {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, secret);
  } catch (error) {
    const expired = error instanceof jwt.TokenExpiredError;
    throw ApiError.unauthorized(
      expired
        ? `The ${expected} token has expired`
        : `Invalid ${expected} token`,
    );
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw ApiError.unauthorized(`Invalid ${expected} token`);
  }

  const claims = decoded as Record<string, unknown>;

  // Guard against a token signed with the other secret / used for the wrong purpose.
  if (claims.typ !== expected) {
    throw ApiError.unauthorized(`Invalid ${expected} token`);
  }

  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw ApiError.unauthorized(`Invalid ${expected} token`);
  }

  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : '',
  };
}

export function signAccessToken(subject: TokenSubject): string {
  return sign({ ...subject, typ: 'access' }, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRES_IN);
}

export function signRefreshToken(subject: TokenSubject): string {
  return sign({ ...subject, typ: 'refresh' }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRES_IN);
}

export function verifyAccessToken(token: string): AccessClaims {
  return { ...verify(token, env.JWT_ACCESS_SECRET, 'access'), typ: 'access' };
}

export function verifyRefreshToken(token: string): RefreshClaims {
  return { ...verify(token, env.JWT_REFRESH_SECRET, 'refresh'), typ: 'refresh' };
}

export function issueTokenPair(subject: TokenSubject): TokenPair {
  return {
    accessToken: signAccessToken(subject),
    refreshToken: signRefreshToken(subject),
  };
}
