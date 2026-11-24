import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import * as eventService from './event.service';
import type {
  CreateEventInput,
  ListEventsQuery,
  RsvpInput,
  UpdateEventInput,
} from './event.validation';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const listEvents = asyncHandler(async (req: Request, res: Response) => {
  const events = await eventService.listEvents(actorId(req), req.query as unknown as ListEventsQuery);
  res.status(200).json({ success: true, data: { events } });
});

export const getEvent = asyncHandler(async (req: Request, res: Response) => {
  const event = await eventService.getEvent(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: { event } });
});

export const createEvent = asyncHandler(async (req: Request, res: Response) => {
  const event = await eventService.createEvent(actorId(req), req.body as CreateEventInput);
  res.status(201).json({ success: true, data: { event } });
});

export const updateEvent = asyncHandler(async (req: Request, res: Response) => {
  const event = await eventService.updateEvent(req.params.id, req.body as UpdateEventInput);
  res.status(200).json({ success: true, data: { event } });
});

export const deleteEvent = asyncHandler(async (req: Request, res: Response) => {
  const result = await eventService.deleteEvent(req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const rsvpToEvent = asyncHandler(async (req: Request, res: Response) => {
  const rsvp = await eventService.rsvpToEvent(actorId(req), req.params.id, req.body as RsvpInput);
  res.status(200).json({ success: true, data: { rsvp } });
});

export const getMyRsvps = asyncHandler(async (req: Request, res: Response) => {
  const rsvps = await eventService.getMyRsvps(actorId(req));
  res.status(200).json({ success: true, data: { rsvps } });
});
