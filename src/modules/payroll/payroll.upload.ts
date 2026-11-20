import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { uploadPayslipsSchema } from './payroll.validation';

export const payrollStorageRoot = path.resolve(process.cwd(), env.PAYROLL_STORAGE_ROOT);
const tempDirectory = path.join(payrollStorageRoot, 'temp');

const uploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, tempDirectory),
    filename: (_req, _file, callback) => callback(null, `${randomUUID()}.upload`),
  }),
  limits: {
    fileSize: env.payrollMaxFileSizeBytes,
    files: env.PAYROLL_MAX_FILES_PER_BATCH,
    fields: 1,
    parts: env.PAYROLL_MAX_FILES_PER_BATCH + 1,
    fieldSize: 32,
  },
  fileFilter: (_req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
      callback(ApiError.badRequest('Only PDF payslips are supported'));
      return;
    }
    if (!['application/pdf', 'application/octet-stream'].includes(file.mimetype.toLowerCase())) {
      callback(ApiError.badRequest('Only PDF payslips are supported'));
      return;
    }
    callback(null, true);
  },
}).array('files', env.PAYROLL_MAX_FILES_PER_BATCH);

/** Accepts a bounded batch of PDFs and normalizes Multer errors to API errors. */
export const uploadPayslipFiles: RequestHandler = async (req, res, next) => {
  try {
    await mkdir(tempDirectory, { recursive: true });
  } catch (error) {
    next(error);
    return;
  }

  uploader(req, res, (error: unknown) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    const cleanTemporaryFiles = () =>
      Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));

    if (error instanceof multer.MulterError) {
      void cleanTemporaryFiles();
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(
          ApiError.badRequest(`Each PDF must be no larger than ${env.PAYROLL_MAX_FILE_SIZE_MB} MB`),
        );
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return next(ApiError.badRequest(`Upload no more than ${env.PAYROLL_MAX_FILES_PER_BATCH} PDFs at once`));
      }
      return next(ApiError.badRequest(error.message));
    }
    if (error) {
      void cleanTemporaryFiles();
      return next(error);
    }

    const parsed = uploadPayslipsSchema.safeParse(req.body);
    if (!parsed.success) {
      void cleanTemporaryFiles();
      return next(ApiError.badRequest('Choose a valid payroll period in YYYY-MM format'));
    }
    return next();
  });
};
