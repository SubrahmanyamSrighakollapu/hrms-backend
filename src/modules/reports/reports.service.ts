import { prisma } from '../../config/prisma';
import type { ReportQuery } from './reports.validation';

export async function getSummary(query: ReportQuery) {
  const yearStart = new Date(Date.UTC(query.year, 0, 1));
  const nextYear = new Date(Date.UTC(query.year + 1, 0, 1));
  const now = new Date();
  const period = query.period ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [periodYear, periodMonth] = period.split('-').map(Number);
  const periodStart = new Date(Date.UTC(periodYear, periodMonth - 1, 1));
  const nextPeriod = new Date(Date.UTC(periodYear, periodMonth, 1));

  const [employeeStatus, departments, timeOffGroups, monthlyPayslips, activeEmployees, periodPayslips] =
    await Promise.all([
      prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.department.findMany({
        include: { _count: { select: { users: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.timeOffRequest.groupBy({
        by: ['type', 'status'],
        where: { createdAt: { gte: yearStart, lt: nextYear } },
        _count: { _all: true },
        _sum: { days: true, extraHours: true },
      }),
      prisma.payslip.groupBy({
        by: ['payrollPeriod'],
        where: { payrollPeriod: { gte: yearStart, lt: nextYear } },
        _count: { _all: true },
        orderBy: { payrollPeriod: 'asc' },
      }),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.payslip.count({
        where: { payrollPeriod: { gte: periodStart, lt: nextPeriod } },
      }),
    ]);

  const statusCounts = { total: 0, active: 0, inactive: 0, suspended: 0 };
  for (const row of employeeStatus) {
    const count = row._count._all;
    statusCounts.total += count;
    if (row.status === 'ACTIVE') statusCounts.active = count;
    if (row.status === 'INACTIVE') statusCounts.inactive = count;
    if (row.status === 'SUSPENDED') statusCounts.suspended = count;
  }

  const timeOff = timeOffGroups.map((row) => ({
    type: row.type,
    status: row.status,
    requestCount: row._count._all,
    leaveDays: Number(row._sum.days ?? 0),
    extraHours: Number(row._sum.extraHours ?? 0),
  }));

  return {
    year: query.year,
    period,
    generatedAt: now.toISOString(),
    headcount: {
      ...statusCounts,
      byDepartment: departments.map((department) => ({
        departmentId: department.id,
        department: department.name,
        employees: department._count.users,
      })),
    },
    timeOff,
    payslips: {
      period,
      activeEmployees,
      uploaded: periodPayslips,
      missing: Math.max(0, activeEmployees - periodPayslips),
      byMonth: monthlyPayslips.map((row) => ({
        period: row.payrollPeriod.toISOString().slice(0, 7),
        uploaded: row._count._all,
      })),
    },
  };
}
