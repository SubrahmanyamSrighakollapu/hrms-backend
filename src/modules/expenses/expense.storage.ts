import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

export const expenseRoot = path.resolve(process.cwd(), env.EXPENSE_STORAGE_ROOT);

/** Resolves a stored receipt path, refusing anything that escapes the root. */
export function resolveExpensePath(relativePath: string): string {
  const absolute = path.resolve(expenseRoot, relativePath);
  const rootWithSeparator = expenseRoot.endsWith(path.sep) ? expenseRoot : `${expenseRoot}${path.sep}`;
  if (!absolute.startsWith(rootWithSeparator)) {
    throw ApiError.forbidden('Invalid expense storage path');
  }
  return absolute;
}

export interface StoredReceipt {
  storagePath: string;
}

/** Moves an uploaded receipt from temporary storage into the receipts folder. */
export async function storeExpenseReceipt(
  tempPath: string,
  originalFilename: string,
): Promise<StoredReceipt> {
  const ext = path.extname(originalFilename).toLowerCase() || '.bin';
  const relativePath = path.posix.join('receipts', `${randomUUID()}${ext}`);
  const destination = resolveExpensePath(relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(tempPath, destination);
  return { storagePath: relativePath };
}

export async function removeExpenseReceipt(relativePath: string): Promise<void> {
  try {
    await unlink(resolveExpensePath(relativePath));
  } catch {
    // Already gone - deletion is best-effort.
  }
}
