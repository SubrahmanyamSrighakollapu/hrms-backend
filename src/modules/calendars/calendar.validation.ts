import { z } from 'zod';

function dateString() {
  return z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Must be a valid date (YYYY-MM-DD)',
  });
}

export const calendarEventsQuerySchema = z.object({
  start: dateString(),
  end: dateString(),
});

export type CalendarEventsQuery = z.infer<typeof calendarEventsQuerySchema>;
