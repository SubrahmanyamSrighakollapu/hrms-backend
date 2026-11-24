import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import * as holidaysService from './holidays.service';
import type {
  CreateHolidayInput,
  HolidaySettingsInput,
  ListHolidaysQuery,
  UpdateHolidayInput,
} from './holidays.validation';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const listHolidays = asyncHandler(async (req: Request, res: Response) => {
  const holidays = await holidaysService.listHolidays(req.query as ListHolidaysQuery);
  res.status(200).json({ success: true, data: { holidays } });
});

export const createHoliday = asyncHandler(async (req: Request, res: Response) => {
  const holiday = await holidaysService.createHoliday(req.body as CreateHolidayInput);
  res.status(201).json({ success: true, data: { holiday } });
});

export const updateHoliday = asyncHandler(async (req: Request, res: Response) => {
  const holiday = await holidaysService.updateHoliday(req.params.id, req.body as UpdateHolidayInput);
  res.status(200).json({ success: true, data: { holiday } });
});

export const deleteHoliday = asyncHandler(async (req: Request, res: Response) => {
  const result = await holidaysService.deleteHoliday(req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await holidaysService.getSettings();
  res.status(200).json({ success: true, data: { settings } });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await holidaysService.updateSettings(req.body as HolidaySettingsInput);
  res.status(200).json({ success: true, data: { settings } });
});

export const getMyAvails = asyncHandler(async (req: Request, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const result = await holidaysService.getMyAvails(actorId(req), year);
  res.status(200).json({ success: true, data: result });
});

export const availHoliday = asyncHandler(async (req: Request, res: Response) => {
  const avail = await holidaysService.availHoliday(actorId(req), req.params.id);
  res.status(201).json({ success: true, data: { avail } });
});

export const cancelAvail = asyncHandler(async (req: Request, res: Response) => {
  const result = await holidaysService.cancelAvail(actorId(req), req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const getTeamAvails = asyncHandler(async (req: Request, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const result = await holidaysService.getTeamAvails(actorId(req), year);
  res.status(200).json({ success: true, data: result });
});
