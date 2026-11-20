import { z } from 'zod';

/**
 * Central env loader. Validates process.env once at boot so the app fails
 * fast with a readable message instead of crashing deep inside a request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(8, 'JWT_ACCESS_SECRET must be at least 8 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET must be at least 8 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
});

/** Secrets that ship with the repo - refused in production. */
const DEV_SECRETS = ['dev-access-secret-change-me', 'dev-refresh-secret-change-me'];

const parsed = envSchema.superRefine((value, ctx) => {
  // Distinct secrets keep access and refresh tokens cryptographically separate.
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_REFRESH_SECRET'],
      message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
    });
  }

  if (value.NODE_ENV === 'production') {
    const weak = [value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET].filter(
      (secret) => secret.length < 32 || DEV_SECRETS.includes(secret),
    );
    if (weak.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'Production requires unique JWT secrets of at least 32 characters',
      });
    }
  }
}).safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export type Env = typeof env;
