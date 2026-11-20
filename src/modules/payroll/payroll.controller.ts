import type { Request, Response } from 'express';
import { hasPermission } from '../../config/modules';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import * as payrollService from './payroll.service';
import type { ListPayslipsQuery, UploadPayslipsInput } from './payroll.validation';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function canManagePayroll(req: Request): boolean {
  return hasPermission(req.user?.permissions, 'payroll', 'MANAGE');
}

export const listPayslips = asyncHandler(async (req: Request, res: Response) => {
  const result = await payrollService.listPayslips(
    actorId(req),
    canManagePayroll(req),
    req.query as unknown as ListPayslipsQuery,
  );
  res.status(200).json({ success: true, data: result });
});

export const uploadPayslips = asyncHandler(async (req: Request, res: Response) => {
  const files = (req.files ?? []) as Express.Multer.File[];
  const result = await payrollService.uploadPayslips(
    actorId(req),
    req.body as UploadPayslipsInput,
    files,
  );
  res.status(200).json({ success: true, data: result });
});

export const downloadPayslip = asyncHandler(async (req: Request, res: Response, next) => {
  const file = await payrollService.getPayslipFile(
    actorId(req),
    canManagePayroll(req),
    req.params.id,
  );
  res.download(file.absolutePath, file.filename, (error) => {
    if (!error) return;
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    next(error);
  });
});
