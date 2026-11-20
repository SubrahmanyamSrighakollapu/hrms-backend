import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import * as dashboardService from './dashboard.service';

export const summary = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await dashboardService.getSummary(
    req.user.id,
    req.user.roleId,
    req.user.permissions,
  );
  res.status(200).json({ success: true, data });
});
