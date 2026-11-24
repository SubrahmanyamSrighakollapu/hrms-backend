import { z } from 'zod';

/**
 * Shared `page` / `pageSize` query fields.
 *
 * Spread into a module's list query schema so every list endpoint accepts the
 * same pagination contract:
 *
 *   const listQuerySchema = z.object({ status: z.string().optional(), ...paginationFields() });
 */
export function paginationFields(defaultPageSize = 20) {
  return {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(defaultPageSize),
  };
}

/** Prisma `skip` / `take` for a 1-based page. */
export function skipTake(page: number, pageSize: number): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Metadata returned alongside every paginated list. Spread it into the response
 * payload:
 *
 *   return { holidays: rows.map(toDto), ...pageMeta(page, pageSize, total) };
 */
export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
