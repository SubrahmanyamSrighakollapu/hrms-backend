import { prisma } from '../../config/prisma';
import type { CalendarEventsQuery } from './calendar.validation';

/** A normalized calendar event returned to the frontend. */
export interface CalendarEvent {
  id: string;
  type: 'BIRTHDAY' | 'ANNIVERSARY' | 'NEW_JOINEE' | 'HOLIDAY';
  title: string;
  date: string; // YYYY-MM-DD
  // Person-based event details
  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;
  designation?: string | null;
  // Holiday details
  holidayType?: 'PUBLIC' | 'OPTIONAL';
  // Anniversary detail
  years?: number;
}

/**
 * Build a list of calendar events for the given date range by combining:
 *  - employee birthdays (recurring, based on dateOfBirth)
 *  - work anniversaries (recurring, based on joinedAt)
 *  - new joinees (joined within 30 days before the range start, or within range)
 *  - public + optional holidays from the Holiday table
 */
export async function getCalendarEvents(query: CalendarEventsQuery): Promise<CalendarEvent[]> {
  const start = new Date(query.start);
  const end = new Date(query.end);
  const events: CalendarEvent[] = [];

  // ---- Holidays (already stored per year) ----
  const holidays = await prisma.holiday.findMany({
    where: {
      date: { gte: start, lte: end },
      status: 'ACTIVE',
    },
    select: { id: true, name: true, date: true, type: true },
    orderBy: { date: 'asc' },
  });

  for (const h of holidays) {
    events.push({
      id: `holiday-${h.id}`,
      type: 'HOLIDAY',
      title: h.name,
      date: h.date.toISOString().slice(0, 10),
      holidayType: h.type,
    });
  }

  // ---- Employees for birthdays / anniversaries / new joinees ----
  const employees = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
      dateOfBirth: true,
      joinedAt: true,
    },
  });

  const startMs = start.getTime();
  const endMs = end.getTime();
  const now = new Date();
  const rangeStartYear = start.getFullYear();
  const rangeEndYear = end.getFullYear();

  for (const emp of employees) {
    const name = `${emp.firstName} ${emp.lastName}`.trim();

    // Birthdays: project the month/day onto each year in the range
    if (emp.dateOfBirth) {
      const month = emp.dateOfBirth.getMonth();
      const day = emp.dateOfBirth.getDate();
      for (let year = rangeStartYear; year <= rangeEndYear; year++) {
        const candidate = new Date(year, month, day);
        const cMs = candidate.getTime();
        if (cMs >= startMs && cMs <= endMs) {
          events.push({
            id: `bday-${emp.id}-${year}`,
            type: 'BIRTHDAY',
            title: `${name}'s Birthday`,
            date: candidate.toISOString().slice(0, 10),
            employeeId: emp.id,
            employeeName: name,
            employeeCode: emp.employeeCode ?? undefined,
            designation: emp.designation,
          });
        }
      }
    }

    // Work anniversaries: project joinedAt month/day onto each year in range
    if (emp.joinedAt) {
      const month = emp.joinedAt.getMonth();
      const day = emp.joinedAt.getDate();
      const joinYear = emp.joinedAt.getFullYear();
      for (let year = rangeStartYear; year <= rangeEndYear; year++) {
        if (year < joinYear) continue; // no anniversary before they joined
        const candidate = new Date(year, month, day);
        const cMs = candidate.getTime();
        if (cMs >= startMs && cMs <= endMs) {
          events.push({
            id: `anniv-${emp.id}-${year}`,
            type: 'ANNIVERSARY',
            title: `${name}'s Work Anniversary`,
            date: candidate.toISOString().slice(0, 10),
            employeeId: emp.id,
            employeeName: name,
            employeeCode: emp.employeeCode ?? undefined,
            designation: emp.designation,
            years: year - joinYear,
          });
        }
      }

      // New joinees: show if joined within 30 days of now (or within the range)
      const joinedMs = emp.joinedAt.getTime();
      const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
      if (joinedMs >= thirtyDaysAgo && joinedMs <= endMs) {
        events.push({
          id: `joinee-${emp.id}`,
          type: 'NEW_JOINEE',
          title: `${name} joined as ${emp.designation ?? 'the team'}`,
          date: emp.joinedAt.toISOString().slice(0, 10),
          employeeId: emp.id,
          employeeName: name,
          employeeCode: emp.employeeCode ?? undefined,
          designation: emp.designation,
        });
      }
    }
  }

  // Sort by date then type
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.type.localeCompare(b.type);
  });

  return events;
}
