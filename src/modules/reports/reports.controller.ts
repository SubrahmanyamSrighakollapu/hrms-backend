import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import type { ReportQuery } from './reports.validation';
import * as reportsService from './reports.service';

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.getSummary(req.query as unknown as ReportQuery);
  res.status(200).json({ success: true, data });
});
