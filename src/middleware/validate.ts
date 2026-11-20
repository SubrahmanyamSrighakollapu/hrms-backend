import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Validates a request part against a Zod schema and replaces it with the
 * parsed (typed + coerced) value.
 *
 * Usage: router.post('/', validate(createSchema), handler)
 *        router.get('/', validate(listSchema, 'query'), handler)
 */
export const validate =
  (schema: ZodTypeAny, part: RequestPart = 'body'): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[part]);
      // query/params are read-only getters on some Express versions; assign per key.
      Object.assign(req[part] as object, parsed);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.') || part,
          message: issue.message,
        }));
        return next(ApiError.badRequest('Validation failed', details));
      }
      return next(error);
    }
  };
