import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import type {
  CreateEventInput,
  ListEventsQuery,
  RsvpInput,
  UpdateEventInput,
} from './event.validation';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const rsvpSummary = (rsvps: { response: string }[]) => ({
  going: rsvps.filter((r) => r.response === 'GOING').length,
  interested: rsvps.filter((r) => r.response === 'INTERESTED').length,
  notGoing: rsvps.filter((r) => r.response === 'NOT_GOING').length,
  total: rsvps.length,
});

/* ============================== Events ============================== */

export async function listEvents(userId: string, query: ListEventsQuery) {
  const where: Record<string, unknown> = { status: 'ACTIVE' };
  if (query.upcoming) {
    where.date = { gte: new Date() };
  }

  const events = await prisma.event.findMany({
    where,
    include: {
      rsvps: { select: { userId: true, response: true } },
    },
    orderBy: [{ date: 'asc' }],
  });

  return events.map((e) => {
    const myRsvp = e.rsvps.find((r) => r.userId === userId) ?? null;
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      date: iso(e.date),
      endDate: iso(e.endDate),
      location: e.location,
      category: e.category,
      status: e.status,
      createdById: e.createdById,
      createdAt: iso(e.createdAt),
      updatedAt: iso(e.updatedAt),
      rsvpSummary: rsvpSummary(e.rsvps),
      myRsvp: myRsvp ? (myRsvp.response as 'GOING' | 'INTERESTED' | 'NOT_GOING') : null,
    };
  });
}

export async function getEvent(userId: string, id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      rsvps: {
        select: {
          id: true,
          userId: true,
          response: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!event) throw ApiError.notFound('Event not found');

  const myRsvp = event.rsvps.find((r) => r.userId === userId) ?? null;

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    date: iso(event.date),
    endDate: iso(event.endDate),
    location: event.location,
    category: event.category,
    status: event.status,
    createdById: event.createdById,
    createdAt: iso(event.createdAt),
    updatedAt: iso(event.updatedAt),
    rsvpSummary: rsvpSummary(event.rsvps),
    myRsvp: myRsvp ? (myRsvp.response as 'GOING' | 'INTERESTED' | 'NOT_GOING') : null,
    rsvps: event.rsvps.map((r) => ({
      id: r.id,
      userId: r.userId,
      response: r.response,
      user: {
        id: r.user.id,
        name: `${r.user.firstName} ${r.user.lastName}`.trim(),
        email: r.user.email,
      },
    })),
  };
}

export async function createEvent(actorId: string, input: CreateEventInput) {
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest('Invalid event date');

  let endDate: Date | null = null;
  if (input.endDate) {
    endDate = new Date(input.endDate);
    if (Number.isNaN(endDate.getTime())) throw ApiError.badRequest('Invalid end date');
  }

  return prisma.event.create({
    data: {
      title: input.title,
      description: input.description?.trim() || null,
      date,
      endDate,
      location: input.location?.trim() || null,
      category: input.category?.trim() || null,
      createdById: actorId,
      status: input.status ?? 'ACTIVE',
    },
  });
}

export async function updateEvent(id: string, input: UpdateEventInput) {
  const existing = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Event not found');

  let date: Date | undefined;
  if (input.date) {
    date = new Date(input.date);
    if (Number.isNaN(date.getTime())) throw ApiError.badRequest('Invalid event date');
  }

  let endDate: Date | null | undefined;
  if (input.endDate !== undefined) {
    endDate = input.endDate ? new Date(input.endDate) : null;
    if (endDate && Number.isNaN(endDate.getTime())) throw ApiError.badRequest('Invalid end date');
  }

  return prisma.event.update({
    where: { id },
    data: {
      title: input.title,
      description:
        input.description === undefined ? undefined : input.description?.trim() || null,
      date,
      endDate,
      location: input.location === undefined ? undefined : input.location?.trim() || null,
      category: input.category === undefined ? undefined : input.category?.trim() || null,
      status: input.status,
    },
  });
}

export async function deleteEvent(id: string) {
  const existing = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Event not found');
  await prisma.event.delete({ where: { id } });
  return { id };
}

/* ================================ RSVP ================================ */

export async function rsvpToEvent(userId: string, eventId: string, input: RsvpInput) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true },
  });
  if (!event) throw ApiError.notFound('Event not found');
  if (event.status !== 'ACTIVE') throw ApiError.badRequest('This event is no longer active');

  const rsvp = await prisma.eventRSVP.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: { response: input.response },
    create: { eventId, userId, response: input.response },
  });

  return rsvp;
}

export async function getMyRsvps(userId: string) {
  const rsvps = await prisma.eventRSVP.findMany({
    where: { userId },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          date: true,
          endDate: true,
          location: true,
          category: true,
          status: true,
        },
      },
    },
    orderBy: [{ event: { date: 'asc' } }],
  });

  return rsvps.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    response: r.response,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    event: {
      id: r.event.id,
      title: r.event.title,
      date: iso(r.event.date),
      endDate: iso(r.event.endDate),
      location: r.event.location,
      category: r.event.category,
      status: r.event.status,
    },
  }));
}
