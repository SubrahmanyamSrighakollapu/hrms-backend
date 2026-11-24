import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import * as expenseService from './expense.service';
import type {
  CategoryInput,
  CreateClaimInput,
  DecisionInput,
  ListClaimsQuery,
  ReimburseInput,
  ReportQuery,
  UpdateCategoryInput,
  UpdateClaimInput,
} from './expense.validation';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function canManage(req: Request): boolean {
  return req.user?.permissions['expenses'] === 'MANAGE';
}

/* ------------------------------- Categories ------------------------------ */

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await expenseService.listCategories(false);
  res.status(200).json({ success: true, data: { categories } });
});

export const listAllCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await expenseService.listCategories(true);
  res.status(200).json({ success: true, data: { categories } });
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await expenseService.createCategory(req.body as CategoryInput);
  res.status(201).json({ success: true, data: { category } });
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await expenseService.updateCategory(req.params.id, req.body as UpdateCategoryInput);
  res.status(200).json({ success: true, data: { category } });
});

/* --------------------------------- Claims -------------------------------- */

export const listClaims = asyncHandler(async (req: Request, res: Response) => {
  const claims = await expenseService.listClaims(
    actorId(req),
    req.query as unknown as ListClaimsQuery,
    canManage(req),
  );
  res.status(200).json({ success: true, data: claims });
});

export const getClaim = asyncHandler(async (req: Request, res: Response) => {
  const claim = await expenseService.getClaim(req.params.id, actorId(req), canManage(req));
  res.status(200).json({ success: true, data: { claim } });
});

export const createClaim = asyncHandler(async (req: Request, res: Response) => {
  const claim = await expenseService.createClaim(actorId(req), req.body as CreateClaimInput);
  res.status(201).json({ success: true, data: { claim } });
});

export const updateClaim = asyncHandler(async (req: Request, res: Response) => {
  const claim = await expenseService.updateClaim(req.params.id, actorId(req), req.body as UpdateClaimInput);
  res.status(200).json({ success: true, data: { claim } });
});

export const deleteClaim = asyncHandler(async (req: Request, res: Response) => {
  await expenseService.deleteClaim(req.params.id, actorId(req));
  res.status(200).json({ success: true, data: { id: req.params.id } });
});

export const submitClaim = asyncHandler(async (req: Request, res: Response) => {
  const claim = await expenseService.submitClaim(req.params.id, actorId(req));
  res.status(200).json({ success: true, data: { claim } });
});

export const decideClaim = asyncHandler(async (req: Request, res: Response) => {
  const claim = await expenseService.decideClaim(req.params.id, actorId(req), req.body as DecisionInput);
  res.status(200).json({ success: true, data: { claim } });
});

export const reimburseClaim = asyncHandler(async (req: Request, res: Response) => {
  const claim = await expenseService.reimburseClaim(req.params.id, actorId(req), req.body as ReimburseInput);
  res.status(200).json({ success: true, data: { claim } });
});

/* -------------------------------- Receipts ------------------------------- */

export const attachReceipt = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('A receipt file is required');
  const item = await expenseService.attachReceipt(
    req.params.id,
    req.params.itemId,
    actorId(req),
    req.file,
    canManage(req),
  );
  res.status(201).json({ success: true, data: { item } });
});

export const downloadReceipt = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const file = await expenseService.getReceiptForDownload(
    req.params.id,
    req.params.itemId,
    actorId(req),
    canManage(req),
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

/* --------------------------------- Stats --------------------------------- */

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await expenseService.getStats(actorId(req), canManage(req));
  res.status(200).json({ success: true, data: { stats } });
});

export const listEmployees = asyncHandler(async (_req: Request, res: Response) => {
  const employees = await expenseService.listReportEmployees();
  res.status(200).json({ success: true, data: { employees } });
});

/* -------------------------------- Reports -------------------------------- */

export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await expenseService.getReport(
    actorId(req),
    req.query as unknown as ReportQuery,
    canManage(req),
  );
  res.status(200).json({ success: true, data: report });
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const csv = await expenseService.exportReportCsv(
    actorId(req),
    req.query as unknown as ReportQuery,
    canManage(req),
  );
  const filename = `expense-report-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csv);
});
