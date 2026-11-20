import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import type {
  ListLeaveBalancesQuery,
  SetLeaveBalanceInput,
  UpdateProfileInput,
} from './settings.validation';

const PROFILE_ID = 'primary';

interface OrganizationProfileRow {
  id: string;
  name: string;
  support_email: string | null;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

function profileDto(row: OrganizationProfileRow) {
  return {
    id: row.id,
    name: row.name,
    supportEmail: row.support_email,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getProfile() {
  const [row] = await prisma.$queryRaw<OrganizationProfileRow[]>`
    SELECT "id", "name", "support_email", "timezone", "created_at", "updated_at"
    FROM "organization_profiles"
    WHERE "id" = ${PROFILE_ID}
  `;
  if (!row) throw ApiError.internal('Organization profile has not been initialized');
  return profileDto(row);
}

export async function updateProfile(input: UpdateProfileInput) {
  if (input.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format();
    } catch {
      throw ApiError.badRequest('Enter a valid IANA time zone');
    }
  }

  await prisma.$executeRaw`
    UPDATE "organization_profiles"
    SET
      "name" = COALESCE(${input.name ?? null}, "name"),
      "support_email" = CASE
        WHEN ${input.supportEmail !== undefined} THEN ${input.supportEmail ?? null}
        ELSE "support_email"
      END,
      "timezone" = COALESCE(${input.timezone ?? null}, "timezone"),
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${PROFILE_ID}
  `;
  return getProfile();
}

export async function listLeaveBalances(query: ListLeaveBalancesQuery) {
  const rows = await prisma.leaveBalance.findMany({
    where: { year: query.year },
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          email: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ employee: { firstName: 'asc' } }, { leaveType: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employeeCode: row.employee.employeeCode,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
    email: row.employee.email,
    department: row.employee.department?.name ?? null,
    leaveType: row.leaveType,
    year: row.year,
    total: Number(row.total),
    used: Number(row.used),
    remaining: Number((Number(row.total) - Number(row.used)).toFixed(2)),
  }));
}

export async function setLeaveBalance(input: SetLeaveBalanceInput) {
  const employee = await prisma.user.findUnique({
    where: { id: input.employeeId },
    select: { id: true, status: true },
  });
  if (!employee) throw ApiError.notFound('Employee not found');

  const key = {
    employeeId_leaveType_year: {
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      year: input.year,
    },
  };
  const existing = await prisma.leaveBalance.findUnique({ where: key });
  const used = existing ? Number(existing.used) : 0;
  if (input.total < used) {
    throw ApiError.badRequest(`Entitlement cannot be lower than the ${used} day(s) already used`);
  }

  const balance = await prisma.leaveBalance.upsert({
    where: key,
    update: { total: input.total },
    create: {
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      year: input.year,
      total: input.total,
      used: 0,
    },
  });

  return {
    id: balance.id,
    employeeId: balance.employeeId,
    leaveType: balance.leaveType,
    year: balance.year,
    total: Number(balance.total),
    used: Number(balance.used),
    remaining: Number((Number(balance.total) - Number(balance.used)).toFixed(2)),
  };
}
