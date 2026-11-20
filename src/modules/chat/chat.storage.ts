/**
 * Filesystem storage for chat attachments.
 *
 * Files live outside Postgres (spec §12). We only ever persist metadata in
 * the database; the bytes live under `CHAT_STORAGE_ROOT` on the Linux host.
 *
 * Layout:
 *   <root>/uploads/images|documents|videos|audio/<uuid>.<ext>
 *   <root>/uploads/thumbnails/<uuid>.webp
 *   <root>/temp/        - streaming scratch space
 *   <root>/quarantine/  - reserved for files rejected after inspection
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import type { AttachmentFileDto } from './chat.types';

/** Absolute root for all chat attachments. */
export const storageRoot = path.resolve(process.cwd(), env.CHAT_STORAGE_ROOT);

export type AttachmentCategory = 'images' | 'documents' | 'videos' | 'audio';

const UPLOAD_CATEGORIES: AttachmentCategory[] = ['images', 'documents', 'videos', 'audio'];

/** Maps a MIME type onto the on-disk category directory. */
export function categoryForMime(mime: string): AttachmentCategory {
  const type = mime.toLowerCase();
  if (type.startsWith('image/')) return 'images';
  if (type.startsWith('video/')) return 'videos';
  if (type.startsWith('audio/')) return 'audio';
  return 'documents';
}

let dirsReady: Promise<void> | null = null;

/** Creates the storage tree once per process. Safe to call concurrently. */
export function ensureStorageDirs(): Promise<void> {
  if (!dirsReady) {
    const subDirs = [
      ...UPLOAD_CATEGORIES.map((category) => path.join('uploads', category)),
      path.join('uploads', 'thumbnails'),
      'temp',
      'quarantine',
    ];
    dirsReady = Promise.all([
      mkdir(storageRoot, { recursive: true }),
      ...subDirs.map((dir) => mkdir(path.join(storageRoot, dir), { recursive: true })),
    ]).then(() => undefined);
  }
  return dirsReady;
}

/**
 * Resolves a stored relative path to an absolute one while guaranteeing it
 * can never escape the storage root (path-traversal defence).
 */
export function resolveWithinRoot(relativePath: string): string {
  const absolute = path.resolve(storageRoot, relativePath);
  const rootWithSep = storageRoot.endsWith(path.sep) ? storageRoot : `${storageRoot}${path.sep}`;
  if (absolute !== storageRoot && !absolute.startsWith(rootWithSep)) {
    throw ApiError.forbidden('Invalid storage path');
  }
  return absolute;
}

/** Keeps only a short, safe extension derived from the original name. */
function safeExtension(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '';
}

export interface SavedFile {
  originalFilename: string;
  storedFilename: string;
  /** Relative to {@link storageRoot}. */
  storagePath: string;
  /** Relative to {@link storageRoot}, or null when no thumbnail exists. */
  thumbnailPath: string | null;
  mimeType: string;
  fileExtension: string | null;
  fileSize: number;
  category: AttachmentCategory;
  checksum: string;
  width: number | null;
  height: number | null;
}

/**
 * Persists an uploaded file under a random name and, for raster images,
 * generates a WebP thumbnail. Returns the metadata to store in Postgres.
 */
export async function saveUploadedFile(file: Express.Multer.File): Promise<SavedFile> {
  await ensureStorageDirs();

  const category = categoryForMime(file.mimetype);
  const extension = safeExtension(file.originalname);
  const storedFilename = `${randomUUID()}${extension}`;
  const storagePath = path.posix.join('uploads', category, storedFilename);
  await writeFile(path.join(storageRoot, storagePath), file.buffer);

  const checksum = createHash('sha256').update(file.buffer).digest('hex');

  let thumbnailPath: string | null = null;
  let width: number | null = null;
  let height: number | null = null;

  if (category === 'images' && env.CHAT_ENABLE_THUMBNAILS && file.mimetype !== 'image/svg+xml') {
    try {
      const metadata = await sharp(file.buffer, { failOn: 'none' }).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;

      const thumbName = `${path.parse(storedFilename).name}.webp`;
      const thumbRelative = path.posix.join('uploads', 'thumbnails', thumbName);
      await sharp(file.buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(path.join(storageRoot, thumbRelative));
      thumbnailPath = thumbRelative;
    } catch {
      // A thumbnail is best-effort; the original is still stored and served.
      thumbnailPath = null;
      width = null;
      height = null;
    }
  }

  return {
    originalFilename: file.originalname,
    storedFilename,
    storagePath,
    thumbnailPath,
    mimeType: file.mimetype,
    fileExtension: extension || null,
    fileSize: file.size,
    category,
    checksum,
    width,
    height,
  };
}

/** Best-effort delete of a stored file (used to roll back failed sends). */
export async function removeStoredFile(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  try {
    await unlink(resolveWithinRoot(relativePath));
  } catch {
    // File already gone - nothing to do.
  }
}

interface StoredAttachmentRef {
  storagePath: string;
  thumbnailPath?: string | null;
  mimeType: string;
  originalFilename: string;
  fileSize: number;
}

/** Converts stored metadata into an absolute path ready to be streamed. */
export function toAttachmentFile(ref: StoredAttachmentRef): AttachmentFileDto {
  return {
    absolutePath: resolveWithinRoot(ref.storagePath),
    mimeType: ref.mimeType,
    filename: ref.originalFilename,
    size: ref.fileSize,
  };
}

/** Absolute path of an attachment thumbnail. */
export function toThumbnailFile(ref: StoredAttachmentRef): AttachmentFileDto {
  if (!ref.thumbnailPath) throw ApiError.notFound('No thumbnail for this attachment');
  return {
    absolutePath: resolveWithinRoot(ref.thumbnailPath),
    mimeType: 'image/webp',
    filename: `${path.parse(ref.originalFilename).name}.webp`,
    size: 0,
  };
}
