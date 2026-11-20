import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

export const payrollRoot = path.resolve(process.cwd(), env.PAYROLL_STORAGE_ROOT);

export function resolvePayrollPath(relativePath: string): string {
  const absolute = path.resolve(payrollRoot, relativePath);
  const rootWithSeparator = payrollRoot.endsWith(path.sep) ? payrollRoot : `${payrollRoot}${path.sep}`;
  if (!absolute.startsWith(rootWithSeparator)) throw ApiError.forbidden('Invalid payslip storage path');
  return absolute;
}

export interface StoredPayslip {
  storagePath: string;
  checksum: string;
}

/** Verifies the PDF header, hashes the file, and moves it out of temporary storage. */
export async function storePayslip(tempPath: string): Promise<StoredPayslip> {
  const content = await readFile(tempPath);
  if (content.subarray(0, 1024).indexOf(Buffer.from('%PDF-')) < 0) {
    throw ApiError.badRequest('File content is not a valid PDF');
  }

  const relativePath = path.posix.join('uploads', `${randomUUID()}.pdf`);
  const destination = resolvePayrollPath(relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(tempPath, destination);

  return {
    storagePath: relativePath,
    checksum: createHash('sha256').update(content).digest('hex'),
  };
}

export async function removePayslipFile(relativePath: string): Promise<void> {
  try {
    await unlink(resolvePayrollPath(relativePath));
  } catch {
    // The file may already have been removed during rollback.
  }
}
