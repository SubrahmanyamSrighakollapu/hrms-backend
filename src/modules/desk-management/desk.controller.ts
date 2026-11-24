import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import * as deskService from './desk.service';
import type {
  BookDeskInput,
  CreateDeskInput,
  ListBookingsQuery,
  ListDesksQuery,
  UpdateDeskInput,
} from './desk.validation';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

/* ---------------- Desks ---------------- */

export const listDesks = asyncHandler(async (req: Request, res: Response) => {
  const desks = await deskService.listDesks(req.query as ListDesksQuery);
  res.status(200).json({ success: true, data: { desks } });
});

export const createDesk = asyncHandler(async (req: Request, res: Response) => {
  const desk = await deskService.createDesk(req.body as CreateDeskInput);
  res.status(201).json({ success: true, data: { desk } });
});

export const updateDesk = asyncHandler(async (req: Request, res: Response) => {
  const desk = await deskService.updateDesk(req.params.id, req.body as UpdateDeskInput);
  res.status(200).json({ success: true, data: { desk } });
});

export const deleteDesk = asyncHandler(async (req: Request, res: Response) => {
  const result = await deskService.deleteDesk(req.params.id);
  res.status(200).json({ success: true, data: result });
});

/* ---------------- Bookings ---------------- */

export const listBookings = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await deskService.listBookings(req.query as ListBookingsQuery);
  res.status(200).json({ success: true, data: { bookings } });
});

export const getMyBookings = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await deskService.getMyBookings(actorId(req));
  res.status(200).json({ success: true, data: { bookings } });
});

export const bookDesk = asyncHandler(async (req: Request, res: Response) => {
  const booking = await deskService.bookDesk(actorId(req), req.params.id, req.body as BookDeskInput);
  res.status(201).json({ success: true, data: { booking } });
});

export const cancelBooking = asyncHandler(async (req: Request, res: Response) => {
  const result = await deskService.cancelBooking(actorId(req), req.params.bookingId);
  res.status(200).json({ success: true, data: result });
});
