import { z } from 'zod';

/** Reads a boolean from env text ("true"/"1"/"yes"/"on" ⇒ true). */
const booleanFromEnv = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((value) =>
      typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.toLowerCase()),
    );

/** Default attachment allow-list (kept intentionally conservative). */
const DEFAULT_CHAT_MIME_TYPES = [
  // images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
  // documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  // media
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
].join(',');

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

  // ---- Chat module ----
  /** Root for chat attachment storage. Production: /var/www/hrms-chat-storage */
  CHAT_STORAGE_ROOT: z.string().min(1).default('storage/chat'),
  CHAT_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(25),
  CHAT_ALLOWED_MIME_TYPES: z.string().min(1).default(DEFAULT_CHAT_MIME_TYPES),
  CHAT_ENABLE_THUMBNAILS: booleanFromEnv(true),
  /** Page size ceiling for message history / search. */
  CHAT_MESSAGE_PAGE_SIZE: z.coerce.number().int().positive().max(200).default(30),
  /** Uploads allowed per employee per minute. */
  CHAT_UPLOAD_RATE_LIMIT: z.coerce.number().int().positive().default(30),

  // ---- Payroll module ----
  /** Root for private payslip PDFs. Production should use persistent storage. */
  PAYROLL_STORAGE_ROOT: z.string().min(1).default('storage/payroll'),
  PAYROLL_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().max(50).default(10),
  PAYROLL_MAX_FILES_PER_BATCH: z.coerce.number().int().positive().max(500).default(100),
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
  /** Chat attachment allow-list, normalised to an array of MIME types. */
  chatAllowedMimeTypes: raw.CHAT_ALLOWED_MIME_TYPES.split(',')
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean),
  chatMaxFileSizeBytes: raw.CHAT_MAX_FILE_SIZE_MB * 1024 * 1024,
  payrollMaxFileSizeBytes: raw.PAYROLL_MAX_FILE_SIZE_MB * 1024 * 1024,
};

export type Env = typeof env;
