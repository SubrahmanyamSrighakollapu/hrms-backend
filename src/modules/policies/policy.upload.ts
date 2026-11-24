import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

export const policyStorageRoot = path.resolve(process.cwd(), env.POLICY_STORAGE_ROOT);
const tempDirectory = path.join(policyStorageRoot, 'temp');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/octet-stream',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
]);

const uploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, tempDirectory),
    filename: (_req, _file, callback) => callback(null, `${randomUUID()}.upload`),
  }),
  limits: {
    fileSize: env.policyMaxFileSizeBytes,
    files: 1,
    fields: 8,
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(mime)) {
      callback(
        ApiError.badRequest(
          'Unsupported file type. Allowed: PDF, Word, Excel, PowerPoint, TXT',
        ),
      );
      return;
    }
    callback(null, true);
  },
}).single('document');

/** Accepts a single policy document and normalizes Multer errors to API errors. */
export const uploadPolicyDocument: RequestHandler = async (req, res, next) => {
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
        return next(
          ApiError.badRequest(`Document must be no larger than ${env.POLICY_MAX_FILE_SIZE_MB} MB`),
        );
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
