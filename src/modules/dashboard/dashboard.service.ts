import { prisma } from '../../config/prisma';
import { hasPermission } from '../../config/modules';

export async function getSummary(
  userId: string,
  roleId: string | null,
  permissions: Record<string, 'NONE' | 'VIEW' | 'MANAGE'>,
) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const year = now.getUTCFullYear();

  const canReadEmployees = hasPermission(permissions, 'employees');
  const canManageTimeOff = hasPermission(permissions, 'time-off', 'MANAGE');
  const canReadTimeOff = hasPermission(permissions, 'time-off');
  const canReadPayroll = hasPermission(permissions, 'payroll');

  const [
    employeeCounts,
    departmentRows,
    recentEmployees,
    newJoinerCount,
    pendingCount,
    pendingRequests,
    leaveTodayCount,
    balances,
    recentRequests,
    currentPeriodPayslips,
    user,
  ] = await Promise.all([
    canReadEmployees
      ? prisma.user.groupBy({ by: ['status'], _count: { _all: true } })
      : Promise.resolve([]),
    canReadEmployees
      ? prisma.department.findMany({
          include: { _count: { select: { users: { where: { status: 'ACTIVE' } } } } },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    canReadEmployees
      ? prisma.user.findMany({
          where: { status: 'ACTIVE', joinedAt: { gte: monthStart } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            designation: true,
            joinedAt: true,
            department: { select: { name: true } },
          },
          orderBy: { joinedAt: 'desc' },
          take: 5,
        })
      : Promise.resolve([]),
    canReadEmployees
      ? prisma.user.count({ where: { status: 'ACTIVE', joinedAt: { gte: monthStart } } })
      : Promise.resolve(0),
    canManageTimeOff
      ? prisma.timeOffRequest.count({
          where: { status: 'PENDING', ...(roleId ? { approverRoleId: roleId } : {}) },
        })
      : Promise.resolve(0),
    canManageTimeOff && roleId
      ? prisma.timeOffRequest.findMany({
          where: { status: 'PENDING', approverRoleId: roleId },
          select: {
            id: true,
            type: true,
            leaveType: true,
            days: true,
            fromDate: true,
            toDate: true,
            createdAt: true,
            employee: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 5,
        })
      : Promise.resolve([]),
    canReadEmployees && canReadTimeOff
      ? prisma.timeOffRequest.count({
          where: {
            type: 'LEAVE',
            status: 'APPROVED',
            fromDate: { lt: tomorrow },
            toDate: { gte: today },
          },
        })
      : Promise.resolve(0),
    canReadTimeOff
      ? prisma.leaveBalance.findMany({
          where: { employeeId: userId, year },
          orderBy: { leaveType: 'asc' },
        })
      : Promise.resolve([]),
    canReadTimeOff
      ? prisma.timeOffRequest.findMany({
          where: { employeeId: userId },
          select: {
            id: true,
            type: true,
            status: true,
            leaveType: true,
            fromDate: true,
            toDate: true,
            permissionDate: true,
            extraHoursDate: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : Promise.resolve([]),
    canReadPayroll
      ? prisma.payslip.count({
          where: {
            ...(hasPermission(permissions, 'payroll', 'MANAGE') ? {} : { employeeId: userId }),
            payrollPeriod: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
          },
        })
      : Promise.resolve(0),
    prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, role: { select: { name: true } } },
    }),
  ]);

  const employeeSummary = { total: 0, active: 0, inactive: 0, suspended: 0 };
  for (const row of employeeCounts) {
    const count = row._count._all;
    employeeSummary.total += count;
    if (row.status === 'ACTIVE') employeeSummary.active = count;
    if (row.status === 'INACTIVE') employeeSummary.inactive = count;
    if (row.status === 'SUSPENDED') employeeSummary.suspended = count;
  }

  return {
    generatedAt: now.toISOString(),
    viewer: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      roleName: user?.role?.name ?? 'Employee',
    },
    employees: canReadEmployees ? employeeSummary : null,
    departments: departmentRows.map((row) => ({
      id: row.id,
      name: row.name,
      activeEmployees: row._count.users,
    })),
    recentEmployees: recentEmployees.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      designation: employee.designation,
      department: employee.department?.name ?? null,
      joinedAt: employee.joinedAt?.toISOString() ?? null,
    })),
    newJoinerCount: canReadEmployees ? newJoinerCount : null,
    pendingApprovals: canManageTimeOff
      ? {
          total: pendingCount,
          requests: pendingRequests.map((request) => ({
            id: request.id,
            employeeName: `${request.employee.firstName} ${request.employee.lastName}`.trim(),
            type: request.type,
            leaveType: request.leaveType,
            days: request.days ? Number(request.days) : null,
            fromDate: request.fromDate?.toISOString() ?? null,
            toDate: request.toDate?.toISOString() ?? null,
            createdAt: request.createdAt.toISOString(),
          })),
        }
      : null,
    approvedLeaveToday: canReadEmployees && canReadTimeOff ? leaveTodayCount : null,
    leaveBalances: balances.map((balance) => ({
      leaveType: balance.leaveType,
      total: Number(balance.total),
      used: Number(balance.used),
      remaining: Number((Number(balance.total) - Number(balance.used)).toFixed(2)),
    })),
    recentRequests: recentRequests.map((request) => ({
      id: request.id,
      type: request.type,
      status: request.status,
      leaveType: request.leaveType,
      fromDate: request.fromDate?.toISOString() ?? null,
      toDate: request.toDate?.toISOString() ?? null,
      requestDate:
        request.permissionDate?.toISOString() ??
        request.extraHoursDate?.toISOString() ??
        request.createdAt.toISOString(),
      createdAt: request.createdAt.toISOString(),
    })),
    currentPeriod: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    currentPeriodPayslips: canReadPayroll ? currentPeriodPayslips : null,
  };
}
