import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import type {
  ListLeaveBalancesQuery,
  SetLeaveBalanceInput,
  UpdateProfileInput,
} from './settings.validation';
import * as settingsService from './settings.service';

export const getProfile = asyncHandler(async (_req: Request, res: Response) => {
  const profile = await settingsService.getProfile();
  res.status(200).json({ success: true, data: { profile } });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await settingsService.updateProfile(req.body as UpdateProfileInput);
  res.status(200).json({ success: true, data: { profile } });
});

export const listLeaveBalances = asyncHandler(async (req: Request, res: Response) => {
  const balances = await settingsService.listLeaveBalances(req.query as unknown as ListLeaveBalancesQuery);
  res.status(200).json({ success: true, data: { balances } });
});

export const setLeaveBalance = asyncHandler(async (req: Request, res: Response) => {
  const balance = await settingsService.setLeaveBalance(req.body as SetLeaveBalanceInput);
  res.status(200).json({ success: true, data: { balance } });
});
