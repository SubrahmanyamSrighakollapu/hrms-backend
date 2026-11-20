import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma, type EmployeeCategory } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { statusLabel } from '../roles/roles.service';
import type {
  ChangeStatusInput,
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
  UpdateSelfInput,
} from './employees.validation';

/** Built-in role new employees fall back to when none is chosen. */
const DEFAULT_ROLE_KEY = 'EMPLOYEE';

/**
 * Probation window per category. Automatic at creation and re-derived when the
 * category or joining date changes; can always be overridden explicitly.
 */
const PROBATION_MONTHS: Record<EmployeeCategory, number | null> = {
  INTERN: 6,
  FRESHER: 6,
  EXPERIENCED: 3,
  CONTRACT: null,
};

const employeeSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  status: true,
  employeeCode: true,
  designation: true,
  joinedAt: true,
  category: true,
  employmentType: true,
  priorExperienceMonths: true,
  probationEndDate: true,
  confirmationDate: true,
  contractEndDate: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  departmentId: true,
  department: { select: { name: true } },
  managerId: true,
  manager: { select: { firstName: true, lastName: true } },
  roleId: true,
  role: { select: { name: true } },
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type EmployeeRow = Prisma.UserGetPayload<{ select: typeof employeeSelect }>;

export interface EmployeeDto {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  statusRaw: string;
  category: EmployeeCategory;
  employmentType: string;
  priorExperienceMonths: number;
  designation: string | null;
  departmentId: string | null;
  department: string | null;
  managerId: string | null;
  managerName: string | null;
  roleId: string | null;
  roleName: string | null;
  joinedAt: string | null;
  probationEndDate: string | null;
  confirmationDate: string | null;
  contractEndDate: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Status breakdown for the current filter scope, used by the directory cards. */
export interface EmployeesSummary {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
}

export interface ListEmployeesResult {
  employees: EmployeeDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: EmployeesSummary;
}

export interface CreateEmployeeResult {
  employee: EmployeeDto;
  /** Present only when the server generated the password - shown to the admin once. */
  temporaryPassword?: string;
}

export interface FormOptions {
  departments: { id: string; name: string; code: string | null }[];
  roles: { id: string; name: string }[];
  managers: { id: string; name: string; email: string }[];
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

function toEmployeeDto(user: EmployeeRow): EmployeeDto {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    status: statusLabel(user.status),
    statusRaw: user.status,
    category: user.category,
    employmentType: user.employmentType,
    priorExperienceMonths: user.priorExperienceMonths,
    designation: user.designation,
    departmentId: user.departmentId,
    department: user.department?.name ?? null,
    managerId: user.managerId,
    managerName: user.manager
      ? `${user.manager.firstName} ${user.manager.lastName}`.trim()
      : null,
    roleId: user.roleId,
    roleName: user.role?.name ?? null,
    joinedAt: iso(user.joinedAt),
    probationEndDate: iso(user.probationEndDate),
    confirmationDate: iso(user.confirmationDate),
    contractEndDate: iso(user.contractEndDate),
    dateOfBirth: iso(user.dateOfBirth),
    gender: user.gender,
    address: user.address,
    emergencyContactName: user.emergencyContactName,
    emergencyContactPhone: user.emergencyContactPhone,
    lastLoginAt: iso(user.lastLoginAt),
    createdAt: user.createdAt.toISOString(),
  };
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

/** Probation end for a category, or null when the category has no probation. */
function deriveProbationEnd(joinedAt: Date | null, category: EmployeeCategory): Date | null {
  const months = PROBATION_MONTHS[category];
  if (!joinedAt || months === null) return null;
  return addMonths(joinedAt, months);
}

/** A fresh, readable password that satisfies the login policy. */
function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(8);
  let core = '';
  for (const byte of bytes) core += alphabet[byte % alphabet.length];
  return `Hr${core}9`;
}

/** Codes are issued from a counter, atomically, inside the caller's transaction. */
async function nextEmployeeCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "counters" ("key", "value") VALUES ('employee_code', 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "counters"."value" + 1
    RETURNING "value"
  `;
  const value = Number(rows[0]?.value ?? 1);
  return `EMP-${String(value).padStart(4, '0')}`;
}

/** Validates the optional references and returns them normalised. */
async function resolveReferences(input: {
  roleId?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
  selfId?: string;
}) {
  const [role, department, manager] = await Promise.all([
    input.roleId
      ? prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true } })
      : null,
    input.departmentId
      ? prisma.department.findUnique({ where: { id: input.departmentId }, select: { id: true } })
      : null,
    input.managerId
      ? prisma.user.findUnique({ where: { id: input.managerId }, select: { id: true } })
      : null,
  ]);

  if (input.roleId && !role) throw ApiError.badRequest('The selected role does not exist');
  if (input.departmentId && !department) {
    throw ApiError.badRequest('The selected department does not exist');
  }
  if (input.managerId && !manager) {
    throw ApiError.badRequest('The selected manager does not exist');
  }
  if (input.managerId && input.selfId && input.managerId === input.selfId) {
    throw ApiError.badRequest('An employee cannot report to themselves');
  }
  if (input.managerId && input.selfId) {
    const visited = new Set<string>([input.selfId]);
    let cursor: string | null = input.managerId;
    while (cursor) {
      if (visited.has(cursor)) {
        throw ApiError.badRequest('This reporting change would create a manager cycle');
      }
      visited.add(cursor);
      const ancestor: { managerId: string | null } | null = await prisma.user.findUnique({
        where: { id: cursor },
        select: { managerId: true },
      });
      cursor = ancestor?.managerId ?? null;
    }
  }

  return {
    roleId: input.roleId ?? null,
    departmentId: input.departmentId ?? null,
    managerId: input.managerId ?? null,
  };
}

/**
 * A contract employee must carry an end date, otherwise the engagement would
 * be open-ended and the category meaningless.
 */
function assertContractHasEndDate(
  category: EmployeeCategory,
  contractEndDate: Date | null | undefined,
): void {
  if (category === 'CONTRACT' && !contractEndDate) {
    throw ApiError.badRequest('A contract end date is required for contract employees');
  }
}

export async function listEmployees(query: ListEmployeesQuery): Promise<ListEmployeesResult> {
  const { q, status, category, departmentId, roleId, page, pageSize } = query;

  // Everything except the status filter - the summary reports the full status
  // breakdown of whatever scope the user is looking at.
  const scope: Prisma.UserWhereInput = {
    ...(category ? { category } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(roleId ? { roleId } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { employeeCode: { contains: q, mode: 'insensitive' } },
            { designation: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const where: Prisma.UserWhereInput = { ...scope, ...(status ? { status } : {}) };

  const [total, users, grouped] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: employeeSelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
  ]);

  const summary: EmployeesSummary = { total: 0, active: 0, inactive: 0, suspended: 0 };
  for (const row of grouped) {
    const count = row._count._all;
    summary.total += count;
    if (row.status === 'ACTIVE') summary.active = count;
    else if (row.status === 'INACTIVE') summary.inactive = count;
    else if (row.status === 'SUSPENDED') summary.suspended = count;
  }

  return {
    employees: users.map(toEmployeeDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary,
  };
}

export async function getEmployee(id: string): Promise<EmployeeDto> {
  const user = await prisma.user.findUnique({ where: { id }, select: employeeSelect });
  if (!user) {
    throw ApiError.notFound('Employee not found');
  }
  return toEmployeeDto(user);
}

export async function createEmployee(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (clash) {
    throw ApiError.conflict('An employee with this email already exists');
  }

  const refs = await resolveReferences(input);

  // No role chosen -> land on the built-in Employee role.
  if (!refs.roleId) {
    const fallback = await prisma.role.findUnique({
      where: { key: DEFAULT_ROLE_KEY },
      select: { id: true },
    });
    refs.roleId = fallback?.id ?? null;
  }

  const joinedAt = input.joinedAt ?? new Date();
  assertContractHasEndDate(input.category, input.contractEndDate);

  const probationEndDate =
    input.probationEndDate !== undefined
      ? input.probationEndDate
      : deriveProbationEnd(joinedAt, input.category);

  const generated = !input.password;
  const temporaryPassword = input.password ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_SALT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const employeeCode = await nextEmployeeCode(tx);

    return tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        employeeCode,
        roleId: refs.roleId,
        departmentId: refs.departmentId,
        managerId: refs.managerId,
        phone: input.phone ?? null,
        designation: input.designation ?? null,
        category: input.category,
        employmentType: input.employmentType,
        priorExperienceMonths: input.priorExperienceMonths ?? 0,
        joinedAt,
        probationEndDate,
        confirmationDate: input.confirmationDate ?? null,
        contractEndDate: input.contractEndDate ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
        address: input.address ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
      },
      select: employeeSelect,
    });
  });

  return {
    employee: toEmployeeDto(user),
    ...(generated ? { temporaryPassword } : {}),
  };
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
): Promise<EmployeeDto> {
  const existing = await prisma.user.findUnique({ where: { id }, select: employeeSelect });
  if (!existing) {
    throw ApiError.notFound('Employee not found');
  }

  if (input.email && input.email !== existing.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (clash) {
      throw ApiError.conflict('An employee with this email already exists');
    }
  }

  const refs = await resolveReferences({
    roleId: input.roleId,
    departmentId: input.departmentId,
    managerId: input.managerId,
    selfId: id,
  });

  // Effective values after the patch, needed for the cross-field rules.
  const category = input.category ?? existing.category;
  const joinedAt = input.joinedAt !== undefined ? input.joinedAt : existing.joinedAt;
  const contractEndDate =
    input.contractEndDate !== undefined ? input.contractEndDate : existing.contractEndDate;
  assertContractHasEndDate(category, contractEndDate);

  // Re-derive probation when the inputs it depends on changed, unless it was
  // set explicitly in this request.
  const classificationChanged =
    input.category !== undefined || input.joinedAt !== undefined;
  const probationEndDate =
    input.probationEndDate !== undefined
      ? input.probationEndDate
      : classificationChanged
        ? deriveProbationEnd(joinedAt, category)
        : existing.probationEndDate;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      firstName: input.firstName ?? undefined,
      lastName: input.lastName ?? undefined,
      email: input.email ?? undefined,
      phone: input.phone,
      designation: input.designation,
      roleId: input.roleId !== undefined ? refs.roleId : undefined,
      departmentId: input.departmentId !== undefined ? refs.departmentId : undefined,
      managerId: input.managerId !== undefined ? refs.managerId : undefined,
      category: input.category ?? undefined,
      employmentType: input.employmentType ?? undefined,
      priorExperienceMonths: input.priorExperienceMonths ?? undefined,
      joinedAt: input.joinedAt ?? undefined,
      probationEndDate,
      confirmationDate: input.confirmationDate,
      contractEndDate,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      address: input.address,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
    },
    select: employeeSelect,
  });

  return toEmployeeDto(updated);
}

export async function changeStatus(
  id: string,
  input: ChangeStatusInput,
  actorId: string,
): Promise<EmployeeDto> {
  if (id === actorId) {
    throw ApiError.badRequest('You cannot change your own account status');
  }

  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw ApiError.notFound('Employee not found');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: input.status,
      // Deactivating must end the session immediately, not at token expiry.
      ...(input.status !== 'ACTIVE' ? { refreshTokenHash: null } : {}),
    },
    select: employeeSelect,
  });

  return toEmployeeDto(updated);
}

export async function resetPassword(id: string): Promise<CreateEmployeeResult> {
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw ApiError.notFound('Employee not found');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_SALT_ROUNDS);

  const updated = await prisma.user.update({
    where: { id },
    data: { passwordHash, refreshTokenHash: null },
    select: employeeSelect,
  });

  return { employee: toEmployeeDto(updated), temporaryPassword };
}

export async function updateSelf(id: string, input: UpdateSelfInput): Promise<EmployeeDto> {
  const updated = await prisma.user.update({
    where: { id },
    data: {
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      address: input.address,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
    },
    select: employeeSelect,
  });

  return toEmployeeDto(updated);
}

export async function formOptions(): Promise<FormOptions> {
  const [departments, roles, managers] = await Promise.all([
    prisma.department.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
  ]);

  return {
    departments,
    roles,
    managers: managers.map((manager) => ({
      id: manager.id,
      name: `${manager.firstName} ${manager.lastName}`.trim(),
      email: manager.email,
    })),
  };
}
