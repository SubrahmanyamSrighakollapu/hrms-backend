import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import type {
  CreateHolidayInput,
  HolidaySettingsInput,
  ListHolidaysQuery,
  UpdateHolidayInput,
} from './holidays.validation';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

function yearFromDate(date: Date): number {
  return date.getFullYear();
}

/* ============================== Holidays ============================== */

export async function listHolidays(query: ListHolidaysQuery) {
  const where: Record<string, unknown> = {};
  if (query.year) where.year = query.year;
  if (query.type) where.type = query.type;

  const holidays = await prisma.holiday.findMany({
    where,
    include: { location: { select: { name: true } } },
    orderBy: [{ date: 'asc' }],
  });

  return holidays.map((h) => ({
    id: h.id,
    name: h.name,
    date: iso(h.date),
    type: h.type,
    year: h.year,
    description: h.description,
    locationId: h.locationId,
    locationName: h.location?.name ?? null,
    status: h.status,
    createdAt: iso(h.createdAt),
    updatedAt: iso(h.updatedAt),
  }));
}

export async function createHoliday(input: CreateHolidayInput) {
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest('Invalid date');

  if (input.locationId) {
    const location = await prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true },
    });
    if (!location) throw ApiError.badRequest('The selected location does not exist');
  }

  return prisma.holiday.create({
    data: {
      name: input.name,
      date,
      type: input.type ?? 'PUBLIC',
      year: input.year ?? yearFromDate(date),
      description: input.description?.trim() || null,
      locationId: input.locationId ?? null,
      status: input.status ?? 'ACTIVE',
    },
  });
}

export async function updateHoliday(id: string, input: UpdateHolidayInput) {
  const existing = await prisma.holiday.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Holiday not found');

  let date: Date | undefined;
  if (input.date) {
    const parsed = new Date(input.date);
    if (Number.isNaN(parsed.getTime())) throw ApiError.badRequest('Invalid date');
    date = parsed;
  }

  if (input.locationId) {
    const location = await prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true },
    });
    if (!location) throw ApiError.badRequest('The selected location does not exist');
  }

  return prisma.holiday.update({
    where: { id },
    data: {
      name: input.name,
      date,
      type: input.type,
      year: input.year,
      description: input.description === undefined ? undefined : input.description?.trim() || null,
      locationId: input.locationId === undefined ? undefined : input.locationId ?? null,
      status: input.status,
    },
  });
}

export async function deleteHoliday(id: string) {
  const existing = await prisma.holiday.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Holiday not found');
  await prisma.holiday.delete({ where: { id } });
  return { id };
}

/* ============================== Settings ============================== */

export async function getSettings() {
  const settings = await prisma.holidaySettings.upsert({
    where: { id: 'primary' },
    update: {},
    create: { id: 'primary' },
  });
  return { optionalHolidayAllowance: settings.optionalHolidayAllowance };
}

export async function updateSettings(input: HolidaySettingsInput) {
  const settings = await prisma.holidaySettings.upsert({
    where: { id: 'primary' },
    update: { optionalHolidayAllowance: input.optionalHolidayAllowance },
    create: { id: 'primary', optionalHolidayAllowance: input.optionalHolidayAllowance },
  });
  return { optionalHolidayAllowance: settings.optionalHolidayAllowance };
}

/* =============================== Avails =============================== */

export async function getMyAvails(userId: string, year?: number) {
  const settings = await getSettings();
  const where: Record<string, unknown> = { userId };
  if (year) where.year = year;

  const avails = await prisma.holidayAvail.findMany({
    where,
    include: {
      holiday: {
        select: {
          id: true,
          name: true,
          date: true,
          type: true,
          year: true,
          description: true,
        },
      },
    },
    orderBy: [{ holiday: { date: 'asc' } }],
  });

  const usedYear = year ?? new Date().getFullYear();
  const usedCount = avails.filter((a) => a.year === usedYear).length;

  return {
    optionalHolidayAllowance: settings.optionalHolidayAllowance,
    used: usedCount,
    remaining: Math.max(0, settings.optionalHolidayAllowance - usedCount),
    avails: avails.map((a) => ({
      id: a.id,
      holidayId: a.holidayId,
      year: a.year,
      createdAt: iso(a.createdAt),
      holiday: {
        id: a.holiday.id,
        name: a.holiday.name,
        date: iso(a.holiday.date),
        type: a.holiday.type,
        description: a.holiday.description,
      },
    })),
  };
}

export async function availHoliday(userId: string, holidayId: string) {
  const holiday = await prisma.holiday.findUnique({
    where: { id: holidayId },
    select: { id: true, type: true, year: true, status: true },
  });
  if (!holiday) throw ApiError.notFound('Holiday not found');
  if (holiday.status !== 'ACTIVE') throw ApiError.badRequest('This holiday is no longer active');
  if (holiday.type !== 'OPTIONAL') {
    throw ApiError.badRequest('Only optional holidays can be availed');
  }

  const existing = await prisma.holidayAvail.findUnique({
    where: { holidayId_userId: { holidayId, userId } },
    select: { id: true },
  });
  if (existing) {
    // Idempotent: already availed.
    return prisma.holidayAvail.findUniqueOrThrow({
      where: { id: existing.id },
      include: { holiday: true },
    });
  }

  const settings = await getSettings();
  const usedCount = await prisma.holidayAvail.count({
    where: { userId, year: holiday.year },
  });
  if (usedCount >= settings.optionalHolidayAllowance) {
    throw ApiError.badRequest(
      `You have already availed all ${settings.optionalHolidayAllowance} optional holidays for ${holiday.year}`,
    );
  }

  return prisma.holidayAvail.create({
    data: { holidayId, userId, year: holiday.year },
    include: { holiday: true },
  });
}

export async function cancelAvail(userId: string, holidayId: string) {
  const avail = await prisma.holidayAvail.findUnique({
    where: { holidayId_userId: { holidayId, userId } },
    select: { id: true },
  });
  if (!avail) throw ApiError.notFound('You have not availed this holiday');
  await prisma.holidayAvail.delete({ where: { id: avail.id } });
  return { holidayId };
}

/* ================================ Team ================================ */

export async function getTeamAvails(managerId: string, year?: number) {
  const reports = await prisma.user.findMany({
    where: { managerId, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (reports.length === 0) {
    return { reports: [] as unknown[], avails: [] };
  }

  const reportIds = reports.map((r) => r.id);
  const where: Record<string, unknown> = { userId: { in: reportIds } };
  if (year) where.year = year;

  const avails = await prisma.holidayAvail.findMany({
    where,
    include: {
      holiday: { select: { id: true, name: true, date: true, type: true, year: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ holiday: { date: 'asc' } }],
  });

  const reportMap = new Map(reports.map((r) => [r.id, r]));
  return {
    reports: reports.map((r) => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
    })),
    avails: avails
      .filter((a) => reportMap.has(a.userId))
      .map((a) => ({
        id: a.id,
        holidayId: a.holidayId,
        year: a.year,
        createdAt: iso(a.createdAt),
        employee: {
          id: a.user.id,
          name: `${a.user.firstName} ${a.user.lastName}`.trim(),
          email: a.user.email,
        },
        holiday: {
          id: a.holiday.id,
          name: a.holiday.name,
          date: iso(a.holiday.date),
          type: a.holiday.type,
        },
      })),
  };
}
