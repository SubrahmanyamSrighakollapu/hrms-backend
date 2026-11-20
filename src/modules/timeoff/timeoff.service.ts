import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import type {
  ApproveRejectInput,
  CreateTimeOffInput,
  ListTimeOffQuery,
  UpdateApprovalFlowInput,
} from './timeoff.validation';

/* ---------------- types ---------------- */

export interface TimeOffRequestDto {
  id: string;
  type: string;
  status: string;
  reason: string;

  // employee
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  employeeCode: string | null;
  department: string | null;
  designation: string | null;

  // leave
  leaveType: string | null;
  fromDate: string | null;
  toDate: string | null;
  days: number | null;

  // permission
  permissionDate: string | null;
  fromTime: string | null;
  toTime: string | null;

  // regularization
  regularizationDate: string | null;
  actualInTime: string | null;
  actualOutTime: string | null;

  // extra hours
  extraHoursDate: string | null;
  extraHoursFrom: string | null;
  extraHoursTo: string | null;
  extraHours: number | null;

  // approval
  approverId: string | null;
  approverName: string | null;
  approverRoleId: string | null;
  approverRoleName: string | null;
  approvedAt: string | null;
  approvalComment: string | null;

  createdAt: string;
}

const requestSelect = {
  id: true,
  type: true,
  status: true,
  reason: true,
  employeeId: true,
  leaveType: true,
  fromDate: true,
  toDate: true,
  days: true,
  permissionDate: true,
  fromTime: true,
  toTime: true,
  regularizationDate: true,
  actualInTime: true,
  actualOutTime: true,
  extraHoursDate: true,
  extraHoursFrom: true,
  extraHoursTo: true,
  extraHours: true,
  approverId: true,
  approverRoleId: true,
  approvedAt: true,
  approvalComment: true,
  createdAt: true,
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      employeeCode: true,
      designation: true,
      department: { select: { name: true } },
    },
  },
  approver: { select: { firstName: true, lastName: true } },
  approverRole: { select: { name: true } },
} satisfies Prisma.TimeOffRequestSelect;

type RequestRow = Prisma.TimeOffRequestGetPayload<{ select: typeof requestSelect }>;

function toDto(row: RequestRow): TimeOffRequestDto {
  const name = `${row.employee.firstName} ${row.employee.lastName}`.trim();
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    reason: row.reason,
    employeeId: row.employee.id,
    employeeName: name,
    employeeEmail: row.employee.email,
    employeeCode: row.employee.employeeCode,
    department: row.employee.department?.name ?? null,
    designation: row.employee.designation,
    leaveType: row.leaveType,
    fromDate: row.fromDate ? row.fromDate.toISOString() : null,
    toDate: row.toDate ? row.toDate.toISOString() : null,
    days: row.days ? Number(row.days) : null,
    permissionDate: row.permissionDate ? row.permissionDate.toISOString() : null,
    fromTime: row.fromTime,
    toTime: row.toTime,
    regularizationDate: row.regularizationDate ? row.regularizationDate.toISOString() : null,
    actualInTime: row.actualInTime,
    actualOutTime: row.actualOutTime,
    extraHoursDate: row.extraHoursDate ? row.extraHoursDate.toISOString() : null,
    extraHoursFrom: row.extraHoursFrom,
    extraHoursTo: row.extraHoursTo,
    extraHours: row.extraHours ? Number(row.extraHours) : null,
    approverId: row.approverId,
    approverName: row.approver ? `${row.approver.firstName} ${row.approver.lastName}`.trim() : null,
    approverRoleId: row.approverRoleId,
    approverRoleName: row.approverRole?.name ?? null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    approvalComment: row.approvalComment,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Look up which role approves a given request type. Falls back to HR. */
async function approverRoleFor(type: string): Promise<{ id: string; name: string }> {
  const flow = await prisma.approvalFlow.findUnique({
    where: { requestType: type as never },
    include: { approverRole: { select: { id: true, name: true } } },
  });
  if (flow) return { id: flow.approverRole.id, name: flow.approverRole.name };
  const hr = await prisma.role.findUnique({ where: { key: 'HR' }, select: { id: true, name: true } });
  if (!hr) throw ApiError.internal('No HR role and no approval flow configured');
  return hr;
}

/* ---------------- list / get ---------------- */

export interface ListResult {
  requests: TimeOffRequestDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listRequests(
  employeeId: string,
  query: ListTimeOffQuery,
): Promise<ListResult> {
  const { type, status, page, pageSize } = query;
  const where: Prisma.TimeOffRequestWhereInput = {
    employeeId,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.timeOffRequest.count({ where }),
    prisma.timeOffRequest.findMany({
      where,
      select: requestSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    requests: rows.map(toDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Requests pending approval for the actor's role (the approval inbox). */
export async function listPendingForApprover(
  approverRoleId: string,
  query: ListTimeOffQuery,
): Promise<ListResult> {
  const { type, status, page, pageSize } = query;
  const where: Prisma.TimeOffRequestWhereInput = {
    approverRoleId,
    ...(type ? { type } : {}),
    ...(status ? { status } : { status: 'PENDING' }),
  };

  const [total, rows] = await Promise.all([
    prisma.timeOffRequest.count({ where }),
    prisma.timeOffRequest.findMany({
      where,
      select: requestSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    requests: rows.map(toDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getRequest(id: string): Promise<TimeOffRequestDto> {
  const row = await prisma.timeOffRequest.findUnique({ where: { id }, select: requestSelect });
  if (!row) throw ApiError.notFound('Request not found');
  return toDto(row);
}

/* ---------------- create ---------------- */

export async function createRequest(
  employeeId: string,
  input: CreateTimeOffInput,
): Promise<TimeOffRequestDto> {
  const approverRole = await approverRoleFor(input.type);

  const data: Prisma.TimeOffRequestCreateInput = {
    type: input.type,
    reason: input.reason,
    approverRole: { connect: { id: approverRole.id } },
    employee: { connect: { id: employeeId } },
  };

  if (input.type === 'LEAVE') {
    data.leaveType = input.leaveType;
    data.fromDate = input.fromDate;
    data.toDate = input.toDate;
    data.days = new Prisma.Decimal(input.days);

    // Leave balance guard for paid leaves (skip UNPAID).
    if (input.leaveType !== 'UNPAID') {
      const year = input.fromDate.getFullYear();
      const balance = await prisma.leaveBalance.findUnique({
        where: { employeeId_leaveType_year: { employeeId, leaveType: input.leaveType, year } },
      });
      if (balance) {
        const remaining = Number(balance.total) - Number(balance.used);
        if (input.days > remaining) {
          throw ApiError.badRequest(
            `Insufficient ${input.leaveType} balance (${remaining.toFixed(2)} of ${Number(balance.total)} remaining)`,
          );
        }
      }
    }
  } else if (input.type === 'PERMISSION') {
    data.permissionDate = input.permissionDate;
    data.fromTime = input.fromTime;
    data.toTime = input.toTime;
  } else if (input.type === 'REGULARIZATION') {
    data.regularizationDate = input.regularizationDate;
    data.actualInTime = input.actualInTime;
    data.actualOutTime = input.actualOutTime;
  } else if (input.type === 'EXTRA_HOURS') {
    data.extraHoursDate = input.extraHoursDate;
    data.extraHoursFrom = input.extraHoursFrom;
    data.extraHoursTo = input.extraHoursTo;
    data.extraHours = new Prisma.Decimal(input.extraHours);
  }

  const row = await prisma.timeOffRequest.create({ data, select: requestSelect });
  return toDto(row);
}

/* ---------------- approve / reject ---------------- */

export async function decideRequest(
  requestId: string,
  actorId: string,
  actorRoleId: string | null,
  decision: 'APPROVED' | 'REJECTED',
  input: ApproveRejectInput,
): Promise<TimeOffRequestDto> {
  const row = await prisma.timeOffRequest.findUnique({ where: { id: requestId }, select: requestSelect });
  if (!row) throw ApiError.notFound('Request not found');

  if (row.status !== 'PENDING') {
    throw ApiError.badRequest(`This request is already ${row.status.toLowerCase()}`);
  }

  // Only the configured approver role can decide (and they need time-off MANAGE).
  if (!actorRoleId || actorRoleId !== row.approverRoleId) {
    throw ApiError.forbidden('You are not the configured approver for this request');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (decision === 'APPROVED' && row.type === 'LEAVE' && row.leaveType && row.leaveType !== 'UNPAID') {
      const year = row.fromDate!.getFullYear();
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveType_year: { employeeId: row.employeeId, leaveType: row.leaveType, year },
        },
      });
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { used: { increment: row.days ?? 0 } },
        });
      }
    }

    return tx.timeOffRequest.update({
      where: { id: requestId },
      data: {
        status: decision,
        approverId: actorId,
        approvedAt: new Date(),
        approvalComment: input.comment?.trim() || null,
      },
      select: requestSelect,
    });
  });

  return toDto(updated);
}

/* ---------------- approval flow config ---------------- */

export interface ApprovalFlowDto {
  requestType: string;
  approverRoleId: string;
  approverRoleName: string;
}

export async function listApprovalFlows(): Promise<ApprovalFlowDto[]> {
  const flows = await prisma.approvalFlow.findMany({
    include: { approverRole: { select: { id: true, name: true } } },
    orderBy: { requestType: 'asc' },
  });
  return flows.map((f) => ({
    requestType: f.requestType,
    approverRoleId: f.approverRoleId,
    approverRoleName: f.approverRole.name,
  }));
}

export async function updateApprovalFlow(
  requestType: string,
  input: UpdateApprovalFlowInput,
): Promise<ApprovalFlowDto> {
  const role = await prisma.role.findUnique({ where: { id: input.approverRoleId }, select: { id: true, name: true } });
  if (!role) throw ApiError.badRequest('The selected approver role does not exist');

  const flow = await prisma.approvalFlow.upsert({
    where: { requestType: requestType as never },
    update: { approverRoleId: input.approverRoleId },
    create: { requestType: requestType as never, approverRoleId: input.approverRoleId },
    include: { approverRole: { select: { id: true, name: true } } },
  });

  return {
    requestType: flow.requestType,
    approverRoleId: flow.approverRoleId,
    approverRoleName: flow.approverRole.name,
  };
}

/* ---------------- leave balances ---------------- */

export interface LeaveBalanceDto {
  leaveType: string;
  year: number;
  total: number;
  used: number;
  remaining: number;
}

export async function listLeaveBalances(employeeId: string): Promise<LeaveBalanceDto[]> {
  const year = new Date().getFullYear();
  const rows = await prisma.leaveBalance.findMany({
    where: { employeeId, year },
    orderBy: { leaveType: 'asc' },
  });
  return rows.map((r) => {
    const total = Number(r.total);
    const used = Number(r.used);
    return { leaveType: r.leaveType, year: r.year, total, used, remaining: +(total - used).toFixed(2) };
  });
}
