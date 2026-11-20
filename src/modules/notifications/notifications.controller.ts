import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import * as notificationsService from './notifications.service';

function userId(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await notificationsService.listNotifications(
    userId(req),
    Number((req.query as { limit?: number }).limit ?? 30),
  );
  res.status(200).json({ success: true, data: result });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notificationsService.markRead(userId(req), req.params.id);
  res.status(200).json({ success: true, data: { notification } });
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await notificationsService.markAllRead(userId(req));
  res.status(200).json({ success: true, data: result });
});
