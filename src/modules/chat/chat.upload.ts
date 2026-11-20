/**
 * Multipart handling for chat uploads.
 *
 * Files are buffered in memory (they are size-capped) so we can hash and
 * thumbnail them before writing to the storage tree.
 */
import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

const memoryStorage = multer.memoryStorage();

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback,
): void {
  if (env.chatAllowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    callback(null, true);
    return;
  }
  callback(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
}

const singleUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: env.chatMaxFileSizeBytes, files: 1 },
  fileFilter,
}).single('file');

/** Wraps multer so its errors become consistent ApiErrors. */
export const uploadChatFile: RequestHandler = (req, res, next) => {
  singleUpload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest(`File exceeds the ${env.CHAT_MAX_FILE_SIZE_MB} MB limit`));
      }
      return next(ApiError.badRequest(error.message));
    }
    if (error) return next(error);
    return next();
  });
};
