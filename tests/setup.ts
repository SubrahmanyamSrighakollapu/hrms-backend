import 'dotenv/config';

/**
 * `src/config/env.ts` validates the environment at import time. Vitest does not
 * run the server bootstrap (which is where dotenv is normally loaded), so load
 * `.env` here and fall back to harmless placeholders. The expenses route tests
 * only exercise the auth guard and never open a database connection.
 */
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/hrms_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
