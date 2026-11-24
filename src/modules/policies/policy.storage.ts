import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

export const policyRoot = path.resolve(process.cwd(), env.POLICY_STORAGE_ROOT);

export function resolvePolicyPath(relativePath: string): string {
  const absolute = path.resolve(policyRoot, relativePath);
  const rootWithSeparator = policyRoot.endsWith(path.sep) ? policyRoot : `${policyRoot}${path.sep}`;
  if (!absolute.startsWith(rootWithSeparator)) {
    throw ApiError.forbidden('Invalid policy storage path');
  }
  return absolute;
}

export interface StoredPolicyDocument {
  storagePath: string;
}

/** Moves an uploaded file from temporary storage into the policy document folder. */
export async function storePolicyDocument(
  tempPath: string,
  originalFilename: string,
): Promise<StoredPolicyDocument> {
  const ext = path.extname(originalFilename).toLowerCase() || '.bin';
  const relativePath = path.posix.join('documents', `${randomUUID()}${ext}`);
  const destination = resolvePolicyPath(relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(tempPath, destination);
  return { storagePath: relativePath };
}

export async function removePolicyFile(relativePath: string): Promise<void> {
  try {
    await unlink(resolvePolicyPath(relativePath));
  } catch {
    // The file may already have been removed during rollback.
  }
}
