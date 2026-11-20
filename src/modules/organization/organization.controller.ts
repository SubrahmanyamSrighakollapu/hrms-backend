import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import type { CreateDepartmentInput, UpdateDepartmentInput } from './organization.validation';
import * as organizationService from './organization.service';

export const listDepartments = asyncHandler(async (_req: Request, res: Response) => {
  const departments = await organizationService.listDepartments();
  res.status(200).json({ success: true, data: { departments } });
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const department = await organizationService.createDepartment(req.body as CreateDepartmentInput);
  res.status(201).json({ success: true, data: { department } });
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const department = await organizationService.updateDepartment(
    req.params.id,
    req.body as UpdateDepartmentInput,
  );
  res.status(200).json({ success: true, data: { department } });
});

export const deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
  const result = await organizationService.deleteDepartment(req.params.id);
  res.status(200).json({ success: true, data: result });
});

export const hierarchy = asyncHandler(async (_req: Request, res: Response) => {
  const employees = await organizationService.getHierarchy();
  res.status(200).json({ success: true, data: { employees } });
});
