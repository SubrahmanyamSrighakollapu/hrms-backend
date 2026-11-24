import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

export const expenseStorageRoot = path.resolve(process.cwd(), env.EXPENSE_STORAGE_ROOT);
const tempDirectory = path.join(expenseStorageRoot, 'temp');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/octet-stream',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.txt']);

const uploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, tempDirectory),
    filename: (_req, _file, callback) => callback(null, `${randomUUID()}.upload`),
  }),
  limits: {
    fileSize: env.expenseMaxFileSizeBytes,
    files: 1,
    fields: 8,
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(mime)) {
      callback(ApiError.badRequest('Unsupported receipt type. Allowed: PDF, PNG, JPG, WEBP, GIF, TXT'));
      return;
    }
    callback(null, true);
  },
}).single('receipt');

/** Accepts a single receipt image/PDF and normalizes Multer errors to API errors. */
export const uploadExpenseReceipt: RequestHandler = async (req, res, next) => {
  try {
    await mkdir(tempDirectory, { recursive: true });
  } catch (error) {
    next(error);
    return;
  }

  uploader(req, res, (error: unknown) => {
    const file = req.file;
    const cleanTemporaryFile = () => {
      if (file) return unlink(file.path).catch(() => undefined);
      return Promise.resolve();
    };

    if (error instanceof multer.MulterError) {
      void cleanTemporaryFile();
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest(`Receipt must be no larger than ${env.EXPENSE_MAX_FILE_SIZE_MB} MB`));
      }
      return next(ApiError.badRequest(error.message));
    }
    if (error) {
      void cleanTemporaryFile();
      return next(error);
    }
    return next();
  });
};
