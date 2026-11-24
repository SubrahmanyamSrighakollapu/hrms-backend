import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

interface ErrorBody {
  success: false;
  message: string;
  details?: unknown;
  stack?: string;
}

interface HttpishError extends Error {
  status: number;
  type?: string;
}

/** Errors thrown by body-parser / Express that already carry a 4xx status. */
function isHttpError(error: unknown): error is HttpishError {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * Single place that turns any thrown value into a JSON error response.
 */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  let statusCode = 500;
  let message = 'Internal server error';
  let details: unknown;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    details = error.details;
  } else if (isHttpError(error)) {
    // Body-parser / Express errors carry their own 4xx status (e.g. malformed
    // JSON -> 400, payload too large -> 413). Surface them as client errors.
    statusCode = error.status;
    message = error.type === 'entity.parse.failed' ? 'Malformed JSON body' : error.message;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    details = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      statusCode = 409;
      const target = error.meta?.target;
      message = `Duplicate value for ${Array.isArray(target) ? target.join(', ') : 'unique field'}`;
    } else if (error.code === 'P2025') {
      statusCode = 404;
      message = 'Record not found';
    } else {
      statusCode = 400;
      message = 'Database request error';
      details = env.isProduction ? undefined : { code: error.code, meta: error.meta };
    }
  } else if (error instanceof Error) {
    message = error.message || message;
  }

  if (statusCode >= 500) {
    console.error('[error]', error);
  }

  const body: ErrorBody = { success: false, message };
  if (details !== undefined) body.details = details;
  if (!env.isProduction && error instanceof Error && error.stack) body.stack = error.stack;

  res.status(statusCode).json(body);
}
