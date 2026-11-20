import { Prisma } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import * as notificationsService from '../notifications/notifications.service';
import { removePayslipFile, resolvePayrollPath, storePayslip } from './payroll.storage';
import type { ListPayslipsQuery, UploadPayslipsInput } from './payroll.validation';

const payslipSelect = {
  id: true,
  employeeId: true,
  payrollPeriod: true,
  originalFilename: true,
  fileSize: true,
  createdAt: true,
  employee: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.PayslipSelect;

type PayslipRow = Prisma.PayslipGetPayload<{ select: typeof payslipSelect }>;

export interface PayslipDto {
  id: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  employeeEmail: string;
  payrollPeriod: string;
  originalFilename: string;
  fileSize: number;
  uploadedAt: string;
}

export interface PayslipUploadResult {
  filename: string;
  employeeCode: string | null;
  employeeName?: string;
  status: 'UPLOADED' | 'REJECTED';
  reason?: string;
}

function toDto(row: PayslipRow): PayslipDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeCode: row.employee.employeeCode,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
    employeeEmail: row.employee.email,
    payrollPeriod: row.payrollPeriod.toISOString().slice(0, 7),
    originalFilename: row.originalFilename,
    fileSize: row.fileSize,
    uploadedAt: row.createdAt.toISOString(),
  };
}

function periodDate(period: string): Date {
  return new Date(`${period}-01T00:00:00.000Z`);
}

function displayFilename(originalName: string): string {
  const basename = originalName.replace(/\\/g, '/').split('/').pop() ?? 'payslip.pdf';
  return basename.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240) || 'payslip.pdf';
}

function employeeCodeFromFile(originalName: string): string {
  return path.posix.basename(displayFilename(originalName), path.posix.extname(originalName)).trim();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function uploadPayslips(
  actorId: string,
  input: UploadPayslipsInput,
  files: Express.Multer.File[],
): Promise<{ payrollPeriod: string; uploaded: number; rejected: number; results: PayslipUploadResult[] }> {
  if (files.length === 0) throw ApiError.badRequest('Choose at least one PDF to upload');

  try {
  const period = periodDate(input.payrollPeriod);
  const fileEntries = files.map((file) => ({
    file,
    filename: displayFilename(file.originalname),
    employeeCode: employeeCodeFromFile(file.originalname),
  }));
  const codes = [...new Set(fileEntries.map((entry) => entry.employeeCode.toUpperCase()).filter(Boolean))];
  const employees = codes.length
    ? await prisma.user.findMany({
        where: { employeeCode: { in: codes, mode: 'insensitive' } },
        select: { id: true, employeeCode: true, firstName: true, lastName: true },
      })
    : [];
  const employeesByCode = new Map(
    employees.map((employee) => [employee.employeeCode?.toUpperCase() ?? '', employee]),
  );

  const occurrences = new Map<string, number>();
  for (const entry of fileEntries) {
    const code = entry.employeeCode.toUpperCase();
    occurrences.set(code, (occurrences.get(code) ?? 0) + 1);
  }

  const employeeIds = employees.map((employee) => employee.id);
  const existing = employeeIds.length
    ? await prisma.payslip.findMany({
        where: { employeeId: { in: employeeIds }, payrollPeriod: period },
        select: { employeeId: true },
      })
    : [];
  const existingIds = new Set(existing.map((row) => row.employeeId));
  const processed = new Set<string>();
  const results: PayslipUploadResult[] = [];

  for (const entry of fileEntries) {
    const code = entry.employeeCode.toUpperCase();
    const employee = employeesByCode.get(code);
    const reject = (reason: string): void => {
      results.push({ filename: entry.filename, employeeCode: entry.employeeCode || null, status: 'REJECTED', reason });
    };

    try {
      if (!employeeCodeLooksLikeFilename(entry.file.originalname)) {
        reject('Name each PDF with the employee code, for example EMP-0001.pdf');
      } else if (!employee) {
        reject(`No employee matches code "${entry.employeeCode}"`);
      } else if ((occurrences.get(code) ?? 0) > 1) {
        reject('More than one file in this batch uses this employee code');
      } else if (existingIds.has(employee.id)) {
        reject('A payslip already exists for this employee and month');
      } else if (processed.has(employee.id)) {
        reject('This employee has already been processed in the batch');
      } else {
        processed.add(employee.id);
        let stored: Awaited<ReturnType<typeof storePayslip>> | null = null;
        try {
          stored = await storePayslip(entry.file.path);
          await prisma.payslip.create({
            data: {
              employeeId: employee.id,
              uploadedById: actorId,
              payrollPeriod: period,
              originalFilename: entry.filename,
              storagePath: stored.storagePath,
              fileSize: entry.file.size,
              checksum: stored.checksum,
            },
          });
          results.push({
            filename: entry.filename,
            employeeCode: entry.employeeCode,
            employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
            status: 'UPLOADED',
          });
          void notificationsService
            .createNotification({
              userId: employee.id,
              kind: 'PAYSLIP_AVAILABLE',
              title: 'Payslip is available',
              body: `Your payslip for ${input.payrollPeriod} is ready to download.`,
              href: '/payroll',
            })
            .catch((error) => console.error('Could not create payslip notification:', error));
        } catch (error) {
          if (stored) await removePayslipFile(stored.storagePath);
          const reason =
            error instanceof ApiError
              ? error.message
              : isUniqueViolation(error)
                ? 'A payslip already exists for this employee and month'
                : 'Could not save this payslip';
          reject(reason);
        }
      }
    } finally {
      await unlink(entry.file.path).catch(() => undefined);
    }
  }

  const uploaded = results.filter((result) => result.status === 'UPLOADED').length;
  return {
    payrollPeriod: input.payrollPeriod,
    uploaded,
    rejected: results.length - uploaded,
    results,
  };
  } finally {
    await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
  }
}

function employeeSearch(q: string): Prisma.UserWhereInput {
  return {
    OR: [
      { employeeCode: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ],
  };
}

export async function listPayslips(
  actorId: string,
  canManage: boolean,
  query: ListPayslipsQuery,
): Promise<{ payslips: PayslipDto[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const where: Prisma.PayslipWhereInput = {
    ...(!canManage ? { employeeId: actorId } : {}),
    ...(query.payrollPeriod ? { payrollPeriod: periodDate(query.payrollPeriod) } : {}),
    ...(query.q ? { employee: employeeSearch(query.q) } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.payslip.count({ where }),
    prisma.payslip.findMany({
      where,
      select: payslipSelect,
      orderBy: [{ payrollPeriod: 'desc' }, { employee: { firstName: 'asc' } }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    payslips: rows.map(toDto),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getPayslipFile(
  actorId: string,
  canManage: boolean,
  payslipId: string,
): Promise<{ absolutePath: string; filename: string }> {
  const payslip = await prisma.payslip.findFirst({
    where: { id: payslipId, ...(!canManage ? { employeeId: actorId } : {}) },
    select: { storagePath: true, originalFilename: true },
  });
  if (!payslip) throw ApiError.notFound('Payslip not found');
  return {
    absolutePath: resolvePayrollPath(payslip.storagePath),
    filename: payslip.originalFilename,
  };
}

function employeeCodeLooksLikeFilename(originalName: string): boolean {
  return path.posix.extname(displayFilename(originalName)).toLowerCase() === '.pdf';
}
