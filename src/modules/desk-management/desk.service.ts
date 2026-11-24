import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import type {
  BookDeskInput,
  CreateDeskInput,
  ListBookingsQuery,
  ListDesksQuery,
  UpdateDeskInput,
} from './desk.validation';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/* ============================== Desks ============================== */

export async function listDesks(query: ListDesksQuery) {
  const where: Record<string, unknown> = {};
  if (query.locationId) where.locationId = query.locationId;

  const desks = await prisma.desk.findMany({
    where,
    include: {
      location: { select: { id: true, name: true } },
      bookings: query.date
        ? {
            where: { date: new Date(query.date), status: 'BOOKED' },
            select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } },
          }
        : false,
    },
    orderBy: [{ code: 'asc' }],
  });

  return desks.map((d) => {
    const booking =
      d.bookings && d.bookings.length > 0
        ? (d.bookings[0] as unknown as { id: string; userId: string; user: { firstName: string; lastName: string } })
        : null;
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      locationId: d.locationId,
      locationName: d.location?.name ?? null,
      status: d.status,
      bookedBy: booking
        ? {
            id: booking.userId,
            name: `${booking.user.firstName} ${booking.user.lastName}`.trim(),
            bookingId: booking.id,
          }
        : null,
    };
  });
}

export async function createDesk(input: CreateDeskInput) {
  if (input.locationId) {
    const location = await prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true },
    });
    if (!location) throw ApiError.badRequest('The selected location does not exist');
  }

  const existing = await prisma.desk.findUnique({ where: { code: input.code } });
  if (existing) throw ApiError.badRequest('A desk with this code already exists');

  return prisma.desk.create({
    data: {
      name: input.name,
      code: input.code,
      locationId: input.locationId ?? null,
      status: input.status ?? 'ACTIVE',
    },
  });
}

export async function updateDesk(id: string, input: UpdateDeskInput) {
  const existing = await prisma.desk.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Desk not found');

  if (input.code) {
    const duplicate = await prisma.desk.findFirst({
      where: { code: input.code, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) throw ApiError.badRequest('A desk with this code already exists');
  }

  if (input.locationId) {
    const location = await prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true },
    });
    if (!location) throw ApiError.badRequest('The selected location does not exist');
  }

  return prisma.desk.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code,
      locationId: input.locationId === undefined ? undefined : input.locationId ?? null,
      status: input.status,
    },
  });
}

export async function deleteDesk(id: string) {
  const existing = await prisma.desk.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Desk not found');
  await prisma.desk.delete({ where: { id } });
  return { id };
}

/* ============================ Bookings ============================ */

export async function listBookings(query: ListBookingsQuery) {
  const where: Record<string, unknown> = {};
  if (query.date) where.date = new Date(query.date);
  if (query.deskId) where.deskId = query.deskId;

  const bookings = await prisma.deskBooking.findMany({
    where,
    include: {
      desk: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ date: 'asc' }],
  });

  return bookings.map((b) => ({
    id: b.id,
    deskId: b.deskId,
    deskName: b.desk.name,
    deskCode: b.desk.code,
    userId: b.userId,
    userName: `${b.user.firstName} ${b.user.lastName}`.trim(),
    userEmail: b.user.email,
    date: iso(b.date),
    status: b.status,
    notes: b.notes,
  }));
}

export async function bookDesk(userId: string, deskId: string, input: BookDeskInput) {
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest('Invalid date');

  const desk = await prisma.desk.findUnique({
    where: { id: deskId },
    select: { id: true, status: true },
  });
  if (!desk) throw ApiError.notFound('Desk not found');
  if (desk.status !== 'ACTIVE') throw ApiError.badRequest('This desk is not available');

  // Check for an existing active booking on that desk+date
  const existing = await prisma.deskBooking.findUnique({
    where: { deskId_date: { deskId, date } },
    select: { id: true, status: true },
  });
  if (existing && existing.status === 'BOOKED') {
    throw ApiError.badRequest('This desk is already booked for the selected date');
  }

  // One booking per user per day
  const userBooking = await prisma.deskBooking.findFirst({
    where: { userId, date, status: 'BOOKED' },
    select: { id: true },
  });
  if (userBooking) {
    throw ApiError.badRequest('You already have a desk booking for this date');
  }

  if (existing && existing.status === 'CANCELLED') {
    return prisma.deskBooking.update({
      where: { id: existing.id },
      data: { status: 'BOOKED', notes: input.notes ?? null, userId },
      include: { desk: { select: { name: true, code: true } } },
    });
  }

  return prisma.deskBooking.create({
    data: { deskId, userId, date, notes: input.notes ?? null },
    include: { desk: { select: { name: true, code: true } } },
  });
}

export async function cancelBooking(userId: string, bookingId: string) {
  const booking = await prisma.deskBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, status: true },
  });
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.userId !== userId) {
    throw ApiError.forbidden('You can only cancel your own bookings');
  }
  if (booking.status === 'CANCELLED') {
    throw ApiError.badRequest('This booking is already cancelled');
  }
  await prisma.deskBooking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
  return { id: bookingId };
}

export async function getMyBookings(userId: string) {
  const bookings = await prisma.deskBooking.findMany({
    where: { userId, status: 'BOOKED' },
    include: { desk: { select: { id: true, name: true, code: true } } },
    orderBy: [{ date: 'asc' }],
  });
  return bookings.map((b) => ({
    id: b.id,
    deskId: b.deskId,
    deskName: b.desk.name,
    deskCode: b.desk.code,
    date: iso(b.date),
    notes: b.notes,
  }));
}
