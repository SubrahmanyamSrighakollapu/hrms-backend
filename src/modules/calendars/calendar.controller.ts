import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as calendarService from './calendar.service';
import type { CalendarEventsQuery } from './calendar.validation';

export const getEvents = asyncHandler(async (req: Request, res: Response) => {
  const events = await calendarService.getCalendarEvents(req.query as CalendarEventsQuery);
  res.status(200).json({ success: true, data: { events } });
});
