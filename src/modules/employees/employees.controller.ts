import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import type {
  ChangeStatusInput,
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
  UpdateSelfInput,
} from './employees.validation';
import * as employeesService from './employees.service';

function actorId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.listEmployees(req.query as unknown as ListEmployeesQuery);
  res.status(200).json({ success: true, data: result });
});

export const formOptions = asyncHandler(async (_req: Request, res: Response) => {
  const options = await employeesService.formOptions();
  res.status(200).json({ success: true, data: options });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.getEmployee(req.params.id);
  res.status(200).json({ success: true, data: { employee } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.createEmployee(req.body as CreateEmployeeInput);
  res.status(201).json({ success: true, data: result });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.updateEmployee(
    req.params.id,
    req.body as UpdateEmployeeInput,
  );
  res.status(200).json({ success: true, data: { employee } });
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.changeStatus(
    req.params.id,
    req.body as ChangeStatusInput,
    actorId(req),
  );
  res.status(200).json({ success: true, data: { employee } });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeesService.resetPassword(req.params.id);
  res.status(200).json({ success: true, data: result });
});

/* ---- self service (the signed-in employee's own record) ---- */

export const me = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.getEmployee(actorId(req));
  res.status(200).json({ success: true, data: { employee } });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.updateSelf(actorId(req), req.body as UpdateSelfInput);
  res.status(200).json({ success: true, data: { employee } });
});
